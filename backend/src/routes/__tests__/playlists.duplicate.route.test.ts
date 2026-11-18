/** Non-destructive, authorization-safe playlist duplication. */
jest.mock("../../utils/db", () => ({
    prisma: {
        playlist: {
            findUnique: jest.fn(), findFirst: jest.fn(),
            findMany: jest.fn(), create: jest.fn(), update: jest.fn(),
        },
        playlistItem: { createMany: jest.fn(), findMany: jest.fn() },
        hiddenPlaylist: { findMany: jest.fn() },
        apiKey: { findUnique: jest.fn(), update: jest.fn() },
        user: { findUnique: jest.fn() },
        $transaction: jest.fn(),
    },
}));
jest.mock("../../utils/logger", () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../utils/playlistLogger", () => ({ sessionLog: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../utils/errors", () => ({ safeError: jest.fn((error: Error) => error.message) }));

import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { prisma } from "../../utils/db";
import playlistsRoutes from "../playlists";

const SECRET = process.env.JWT_SECRET!;
const USER_A = "user-aaa";
const USER_B = "user-bbb";
const PLAYLIST = "playlist-original";
const tx = {
    playlist: { findFirst: jest.fn(), create: jest.fn() },
    playlistItem: { createMany: jest.fn() },
};

const app = express();
app.use(express.json());
app.use("/playlists", playlistsRoutes);

const token = (id: string) => jwt.sign({
    userId: id, username: "user-" + id, role: "user", tokenVersion: 1,
}, SECRET, { expiresIn: "1h" });
const endpoint = "/playlists/" + PLAYLIST + "/duplicate";

beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockImplementation(async ({ where }) => ({
        id: where.id, username: "user-" + where.id, role: "user", tokenVersion: 1,
    }));
    (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.playlist.findUnique as jest.Mock).mockResolvedValue({
        id: PLAYLIST, userId: USER_A, name: "Original", isPublic: false,
    });
    tx.playlist.findFirst.mockResolvedValue({
        name: "Original",
        _count: { items: 3, pendingTracks: 2 },
        items: [
            { trackId: "track-1", sort: 9, rank: "a" },
            { trackId: "track-2", sort: 1, rank: "c" },
        ],
    });
    tx.playlist.create.mockResolvedValue({ id: "copied-id", name: "Original (copy)" });
    tx.playlistItem.createMany.mockResolvedValue({ count: 2 });
    (prisma.$transaction as jest.Mock).mockImplementation(async cb => cb(tx));
});

describe("POST /playlists/:id/duplicate", () => {
    it("requires an authenticated user", async () => {
        await request(app).post(endpoint).send({}).expect(401);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
    it("denies copying another user's private playlist", async () => {
        await request(app).post(endpoint)
            .set("Authorization", "Bearer " + token(USER_B))
            .send({}).expect(403);
        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
    it("copies only available tracks in original rank order and defaults to private", async () => {
        const response = await request(app).post(endpoint)
            .set("Authorization", "Bearer " + token(USER_A))
            .send({}).expect(201);
        expect(response.body).toEqual({
            id: "copied-id", name: "Original (copy)", isPublic: false,
            copiedTrackCount: 2, skippedTrackCount: 1, skippedPendingCount: 2,
        });
        expect(tx.playlist.findFirst).toHaveBeenCalledWith({
            where: { id: PLAYLIST, OR: [{ userId: USER_A }, { isPublic: true }] },
            select: expect.objectContaining({
                items: expect.objectContaining({
                    orderBy: [{ rank: "asc" }, { id: "asc" }],
                    where: {
                        track: { missingSince: null, corrupt: false, album: { location: "LIBRARY" } },
                    },
                }),
            }),
        });
        expect(tx.playlist.create).toHaveBeenCalledWith({
            data: { userId: USER_A, name: "Original (copy)", isPublic: false },
            select: { id: true, name: true },
        });
        expect(tx.playlistItem.createMany).toHaveBeenCalledWith({
            data: [
                { playlistId: "copied-id", trackId: "track-1", sort: 0, rank: "a" },
                { playlistId: "copied-id", trackId: "track-2", sort: 1, rank: "c" },
            ],
        });
    });
    it("allows copying a publicly readable playlist, but never inherits visibility", async () => {
        (prisma.playlist.findUnique as jest.Mock).mockResolvedValue({
            id: PLAYLIST, userId: USER_A, name: "Shared", isPublic: true,
        });
        tx.playlist.create.mockResolvedValue({ id: "copy-user-b", name: "My copy" });
        const response = await request(app).post(endpoint)
            .set("Authorization", "Bearer " + token(USER_B))
            .send({ name: "My copy" }).expect(201);
        expect(response.body.isPublic).toBe(false);
        expect(tx.playlist.create).toHaveBeenCalledWith({
            data: { userId: USER_B, name: "My copy", isPublic: false },
            select: { id: true, name: true },
        });
    });
    it("trims a custom name before creating a private copy", async () => {
        tx.playlist.create.mockResolvedValueOnce({ id: "copy-named", name: "Road trip" });
        const response = await request(app).post(endpoint)
            .set("Authorization", "Bearer " + token(USER_A))
            .send({ name: "  Road trip  " }).expect(201);
        expect(response.body.name).toBe("Road trip");
        expect(tx.playlist.create).toHaveBeenCalledWith({
            data: { userId: USER_A, name: "Road trip", isPublic: false },
            select: { id: true, name: true },
        });
    });
    it("creates an empty private copy without adding pending downloads", async () => {
        tx.playlist.findFirst.mockResolvedValueOnce({
            name: "Pending only", _count: { items: 0, pendingTracks: 3 }, items: [],
        });
        tx.playlist.create.mockResolvedValueOnce({ id: "copy-empty", name: "Pending only (copy)" });
        const response = await request(app).post(endpoint)
            .set("Authorization", "Bearer " + token(USER_A))
            .send({}).expect(201);
        expect(response.body).toEqual({
            id: "copy-empty", name: "Pending only (copy)", isPublic: false,
            copiedTrackCount: 0, skippedTrackCount: 0, skippedPendingCount: 3,
        });
        expect(tx.playlistItem.createMany).not.toHaveBeenCalled();
    });
    it("fits a default copy name into the 200-character playlist limit", async () => {
        tx.playlist.findFirst.mockResolvedValueOnce({
            name: "A".repeat(200), _count: { items: 0, pendingTracks: 0 }, items: [],
        });
        await request(app).post(endpoint)
            .set("Authorization", "Bearer " + token(USER_A))
            .send({}).expect(201);
        expect(tx.playlist.create).toHaveBeenCalledWith({
            data: { userId: USER_A, name: "A".repeat(193) + " (copy)", isPublic: false },
            select: { id: true, name: true },
        });
    });
    it("rechecks visibility inside transaction to prevent a public-to-private race", async () => {
        (prisma.playlist.findUnique as jest.Mock).mockResolvedValue({
            id: PLAYLIST, userId: USER_A, name: "Shared", isPublic: true,
        });
        tx.playlist.findFirst.mockResolvedValueOnce(null);
        await request(app).post(endpoint)
            .set("Authorization", "Bearer " + token(USER_B)).send({}).expect(404);
        expect(tx.playlist.create).not.toHaveBeenCalled();
        expect(tx.playlistItem.createMany).not.toHaveBeenCalled();
    });
    it("rejects oversized and malformed copies without creating a playlist", async () => {
        tx.playlist.findFirst.mockResolvedValueOnce({
            name: "Huge", _count: { items: 2001, pendingTracks: 0 }, items: [],
        });
        await request(app).post(endpoint)
            .set("Authorization", "Bearer " + token(USER_A)).send({}).expect(413);
        for (const body of [{ name: "" }, { name: "x".repeat(201) }, { isPublic: true }]) {
            await request(app).post(endpoint)
                .set("Authorization", "Bearer " + token(USER_A)).send(body).expect(400);
        }
        expect(tx.playlist.create).not.toHaveBeenCalled();
    });
    it("rolls the transaction back if saving items fails", async () => {
        tx.playlistItem.createMany.mockRejectedValueOnce(new Error("database offline"));
        await request(app).post(endpoint)
            .set("Authorization", "Bearer " + token(USER_A)).send({}).expect(500);
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
});
