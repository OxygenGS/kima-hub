/** Playlist details must be readable only while owned or public. */
jest.mock("../../utils/db", () => ({
    prisma: {
        playlist: { findUnique: jest.fn(), findFirst: jest.fn() },
        apiKey: { findUnique: jest.fn(), update: jest.fn() },
        user: { findUnique: jest.fn() },
    },
}));
jest.mock("../../utils/logger", () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../utils/playlistLogger", () => ({ sessionLog: jest.fn() }));
jest.mock("../../utils/errors", () => ({ safeError: jest.fn() }));

import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { prisma } from "../../utils/db";
import playlistRoutes from "../playlists";

const OWNER = "playlist-owner";
const READER = "other-listener";
const PLAYLIST_ID = "privacy-test-playlist";
const url = "/playlists/" + PLAYLIST_ID;
const app = express();
app.use(express.json());
app.use("/playlists", playlistRoutes);

const token = (id: string) => jwt.sign({
    userId: id, username: id, role: "user", tokenVersion: 1,
}, process.env.JWT_SECRET!, { expiresIn: "1h" });
const authed = (id: string) =>
    request(app).get(url).set("Authorization", "Bearer " + token(id));

const playlist = (isPublic: boolean) => ({
    id: PLAYLIST_ID, userId: OWNER, name: "Personal playlist", isPublic,
    user: { username: "playlist-owner" }, customCover: null,
    hiddenByUsers: [], items: [], pendingTracks: [],
});

beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockImplementation(async ({ where }) => ({
        id: where.id, username: where.id, role: "user", tokenVersion: 1,
    }));
    (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.playlist.findUnique as jest.Mock).mockResolvedValue({
        id: PLAYLIST_ID, userId: OWNER, name: "Personal playlist", isPublic: false,
    });
    (prisma.playlist.findFirst as jest.Mock).mockResolvedValue(playlist(false));
});

describe("GET /playlists/:id", () => {
    it("denies unauthenticated callers without reading playlist details", async () => {
        await request(app).get(url).expect(401);
        expect(prisma.playlist.findFirst).not.toHaveBeenCalled();
    });

    it("denies other listeners when a playlist is private", async () => {
        await authed(READER).expect(403);
        expect(prisma.playlist.findFirst).not.toHaveBeenCalled();
    });

    it("returns a private playlist to its owner with no-store caching", async () => {
        const response = await authed(OWNER).expect(200);
        expect(response.headers["cache-control"]).toBe("private, no-store");
        expect(response.body).toMatchObject({
            id: PLAYLIST_ID, name: "Personal playlist", isOwner: true,
            trackCount: 0, pendingCount: 0, items: [], pendingTracks: [],
        });
        expect(prisma.playlist.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: PLAYLIST_ID, OR: [{ userId: OWNER }, { isPublic: true }] },
        }));
    });

    it("returns shared playlist details only when still public at the content query", async () => {
        (prisma.playlist.findUnique as jest.Mock).mockResolvedValue({
            id: PLAYLIST_ID, userId: OWNER, name: "Shared", isPublic: true,
        });
        (prisma.playlist.findFirst as jest.Mock).mockResolvedValue(playlist(true));
        const response = await authed(READER).expect(200);
        expect(response.body.isOwner).toBe(false);
        expect(prisma.playlist.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: PLAYLIST_ID, OR: [{ userId: READER }, { isPublic: true }] },
        }));
    });

    it("returns no details if public access is revoked after the middleware check", async () => {
        // Middleware's first lookup sees public; the permission-filtered
        // content query sees the newly private playlist and returns no row.
        (prisma.playlist.findUnique as jest.Mock).mockResolvedValue({
            id: PLAYLIST_ID, userId: OWNER, name: "Shared", isPublic: true,
        });
        (prisma.playlist.findFirst as jest.Mock).mockResolvedValue(null);
        const response = await authed(READER).expect(404);
        expect(response.body).toEqual({ error: "Playlist not found" });
        expect(prisma.playlist.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: PLAYLIST_ID, OR: [{ userId: READER }, { isPublic: true }] },
        }));
    });
});
