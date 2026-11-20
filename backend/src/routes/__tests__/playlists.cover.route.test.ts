/** Authenticated owner-only custom playlist cover handling. */
jest.mock("../../utils/db", () => ({
    prisma: {
        playlist: { findUnique: jest.fn() },
        playlistCustomCover: {
            upsert: jest.fn(), findFirst: jest.fn(), deleteMany: jest.fn(),
        },
        apiKey: { findUnique: jest.fn(), update: jest.fn() },
        user: { findUnique: jest.fn() },
    },
}));
jest.mock("../../utils/logger", () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../utils/playlistLogger", () => ({ sessionLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../utils/errors", () => ({ safeError: jest.fn() }));

import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import sharp from "sharp";
import { prisma } from "../../utils/db";
import playlistRoutes from "../playlists";

const SECRET = process.env.JWT_SECRET!;
const OWNER = "owner-one";
const STRANGER = "other-user";
const PLAYLIST_ID = "playlist-one";
const endpoint = "/playlists/" + PLAYLIST_ID + "/cover";
const app = express();
app.use(express.json());
app.use("/playlists", playlistRoutes);
const token = (id: string) => jwt.sign({
    userId: id, username: "user-" + id, role: "user", tokenVersion: 1,
}, SECRET, { expiresIn: "1h" });

beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockImplementation(async ({ where }) => ({
        id: where.id, username: "user-" + where.id, role: "user", tokenVersion: 1,
    }));
    (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.playlist.findUnique as jest.Mock).mockResolvedValue({
        id: PLAYLIST_ID, userId: OWNER, name: "Roadtrip", isPublic: false,
    });
    (prisma.playlistCustomCover.upsert as jest.Mock).mockResolvedValue({
        updatedAt: new Date("2026-11-18T00:00:00Z"),
    });
    (prisma.playlistCustomCover.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
});

describe("playlist custom cover", () => {
    it("rejects unauthenticated uploads, reading and removal", async () => {
        await request(app).post(endpoint).set("Content-Type", "image/png")
            .send(Buffer.from("invalid")).expect(401);
        await request(app).get(endpoint).expect(401);
        await request(app).delete(endpoint).expect(401);
        expect(prisma.playlistCustomCover.upsert).not.toHaveBeenCalled();
    });

    it("blocks another user from reading a private playlist cover or changing it", async () => {
        await request(app).get(endpoint).set("Authorization", "Bearer " + token(STRANGER)).expect(403);
        await request(app).post(endpoint).set("Authorization", "Bearer " + token(STRANGER))
            .set("Content-Type", "image/png").send(Buffer.from("bad")).expect(403);
        await request(app).delete(endpoint).set("Authorization", "Bearer " + token(STRANGER)).expect(403);
        expect(prisma.playlistCustomCover.upsert).not.toHaveBeenCalled();
    });

    it("allows reading public playlist covers but never changing someone else's artwork", async () => {
        (prisma.playlist.findUnique as jest.Mock).mockResolvedValue({
            id: PLAYLIST_ID, userId: OWNER, name: "Roadtrip", isPublic: true,
        });
        (prisma.playlistCustomCover.findFirst as jest.Mock).mockResolvedValue({
            imageData: Buffer.from("RIFFxxxxxxxxWEBP", "utf8"),
        });
        await request(app).get(endpoint)
            .set("Authorization", "Bearer " + token(STRANGER))
            .expect(200).expect("Content-Type", /image\/webp/);
        await request(app).delete(endpoint)
            .set("Authorization", "Bearer " + token(STRANGER)).expect(403);
    });

    it("rechecks shared playlist visibility when reading artwork", async () => {
        (prisma.playlist.findUnique as jest.Mock).mockResolvedValue({
            id: PLAYLIST_ID, userId: OWNER, name: "Shared", isPublic: true,
        });
        // Public access revoked between the guard and the cover lookup:
        (prisma.playlistCustomCover.findFirst as jest.Mock).mockResolvedValue(null);
        await request(app).get(endpoint)
            .set("Authorization", "Bearer " + token(STRANGER)).expect(404);
        expect(prisma.playlistCustomCover.findFirst).toHaveBeenCalledWith({
            where: {
                playlistId: PLAYLIST_ID,
                playlist: { is: { OR: [{ userId: STRANGER }, { isPublic: true }] } },
            },
            select: { imageData: true },
        });
    });

    it("re-encodes valid raster input as a 512px WebP without copying image metadata", async () => {
        const input = await sharp({
            create: {
                width: 32, height: 20, channels: 3,
                background: { r: 20, g: 90, b: 150 },
            },
        }).png().toBuffer();
        await request(app).post(endpoint)
            .set("Authorization", "Bearer " + token(OWNER))
            .set("Content-Type", "image/png")
            .send(input).expect(200)
            .expect(({ body }) => {
                expect(body.coverUpdatedAt).toBe("2026-11-18T00:00:00.000Z");
            });
        const call = (prisma.playlistCustomCover.upsert as jest.Mock).mock.calls[0][0];
        expect(call.where).toEqual({ playlistId: PLAYLIST_ID });
        expect(call.create.playlistId).toBe(PLAYLIST_ID);
        expect(call.update.imageData).toEqual(call.create.imageData);
        const out = Buffer.from(call.create.imageData);
        expect(out.subarray(0, 4).toString()).toBe("RIFF");
        expect(out.subarray(8, 12).toString()).toBe("WEBP");
        expect(await sharp(out).metadata()).toMatchObject({ format: "webp", width: 512, height: 512 });
    });

    it("rejects non-image and unsupported uploads", async () => {
        await request(app).post(endpoint)
            .set("Authorization", "Bearer " + token(OWNER))
            .set("Content-Type", "image/png")
            .send(Buffer.from("not actually PNG")).expect(400);
        await request(app).post(endpoint)
            .set("Authorization", "Bearer " + token(OWNER))
            .set("Content-Type", "image/svg+xml")
            .send(Buffer.from("<svg></svg>")).expect(400);
        expect(prisma.playlistCustomCover.upsert).not.toHaveBeenCalled();
    });

    it("rejects uploads over 3 MB before image processing or writing", async () => {
        await request(app).post(endpoint)
            .set("Authorization", "Bearer " + token(OWNER))
            .set("Content-Type", "image/png")
            .send(Buffer.alloc(3 * 1024 * 1024 + 1)).expect(413);
        expect(prisma.playlistCustomCover.upsert).not.toHaveBeenCalled();
    });

    it("serves no cover for a playlist with no custom artwork", async () => {
        (prisma.playlistCustomCover.findFirst as jest.Mock).mockResolvedValue(null);
        await request(app).get(endpoint)
            .set("Authorization", "Bearer " + token(OWNER)).expect(404);
    });

    it("removes only the caller's own cover, leaving the playlist in place", async () => {
        const res = await request(app).delete(endpoint)
            .set("Authorization", "Bearer " + token(OWNER)).expect(200);
        expect(res.body.coverUpdatedAt).toBe(null);
        expect(prisma.playlistCustomCover.deleteMany).toHaveBeenCalledWith({
            where: { playlistId: PLAYLIST_ID },
        });
    });
});
