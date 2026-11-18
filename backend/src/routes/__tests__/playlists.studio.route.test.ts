/** Playlist Studio search must not bypass the caller's playlist read rights. */
jest.mock("../../utils/db", () => ({
    prisma: {
        playlist: {
            count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(),
        },
        hiddenPlaylist: { findMany: jest.fn() },
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
import { prisma } from "../../utils/db";
import playlistsRoutes from "../playlists";

const SECRET = process.env.JWT_SECRET!;
const USER_A = "listener-a";
const app = express();
app.use(express.json());
app.use("/playlists", playlistsRoutes);

const bearer = jwt.sign({
    userId: USER_A, username: "listener-a", role: "user", tokenVersion: 1,
}, SECRET, { expiresIn: "1h" });
const authed = () => request(app).get("/playlists/studio").set("Authorization", "Bearer " + bearer);

beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockImplementation(async ({ where }) => ({
        id: where.id, username: "listener-a", role: "user", tokenVersion: 1,
    }));
    (prisma.apiKey.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.playlist.count as jest.Mock)
        .mockResolvedValueOnce(83).mockResolvedValueOnce(4);
    (prisma.playlist.findMany as jest.Mock).mockResolvedValue([{
        id: "playlist-one", name: "My Rock", userId: USER_A, isPublic: false,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        user: { username: "listener-a" },
        _count: { items: 11 },
        items: [{ id: "playlist-item", track: { album: { coverUrl: null } } }],
    }]);
});

describe("GET /playlists/studio", () => {
    it("requires authentication", async () => {
        await request(app).get("/playlists/studio").expect(401);
        expect(prisma.playlist.findMany).not.toHaveBeenCalled();
    });

    it("returns bounded results with separate visible and hidden totals", async () => {
        const response = await authed().expect(200);
        expect(response.headers["cache-control"]).toBe("private, no-store");
        expect(response.body).toMatchObject({
            page: 1, limit: 24, pages: 4, total: 83,
            counts: { visible: 83, hidden: 4 },
            items: [{
                id: "playlist-one", name: "My Rock", trackCount: 11,
                isOwner: true, isHidden: false,
            }],
        });
        expect(response.body.items[0]._count).toBeUndefined();
        expect(prisma.playlist.findMany).toHaveBeenCalledWith(expect.objectContaining({
            skip: 0, take: 24,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            where: { AND: [
                { AND: [
                    { OR: [{ userId: USER_A }, { isPublic: true }] },
                    {},
                    {},
                ] },
                { hiddenByUsers: { none: { userId: USER_A } } },
            ] },
        }));
    });

    it("searches through all accessible playlists, not a loaded client slice", async () => {
        const response = await authed()
            .query({ q: "  ROAD  ", page: "3", limit: "10", sort: "name-asc" })
            .expect(200);
        expect(response.body.page).toBe(3);
        expect(prisma.playlist.findMany).toHaveBeenCalledWith(expect.objectContaining({
            skip: 20, take: 10,
            orderBy: [{ name: "asc" }, { id: "asc" }],
            where: expect.objectContaining({
                AND: [
                    { AND: [
                        { OR: [{ userId: USER_A }, { isPublic: true }] },
                        { name: { contains: "ROAD", mode: "insensitive" } },
                        {},
                    ] },
                    { hiddenByUsers: { none: { userId: USER_A } } },
                ],
            }),
        }));
    });

    it("combines shared-only and hidden scopes without leaking private playlists", async () => {
        const response = await authed()
            .query({ owner: "shared", scope: "hidden", sort: "oldest" })
            .expect(200);
        expect(response.body.total).toBe(4);
        expect(response.body.items[0].isHidden).toBe(true);
        expect(prisma.playlist.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { AND: [
                { AND: [
                    { OR: [{ userId: USER_A }, { isPublic: true }] },
                    {},
                    { userId: { not: USER_A }, isPublic: true },
                ] },
                { hiddenByUsers: { some: { userId: USER_A } } },
            ] },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }));
    });

    it("keeps own-only playlists bound to the caller", async () => {
        await authed().query({ owner: "mine", sort: "name-desc" }).expect(200);
        expect(prisma.playlist.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                AND: expect.arrayContaining([
                    { AND: [
                        { OR: [{ userId: USER_A }, { isPublic: true }] },
                        {},
                        { userId: USER_A },
                    ] },
                ]),
            }),
            orderBy: [{ name: "desc" }, { id: "asc" }],
        }));
    });

    it("rejects invalid and unbounded query inputs before querying the database", async () => {
        for (const query of [
            { q: "x".repeat(121) },
            { limit: "61" },
            { limit: "0" },
            { page: "0" },
            { page: "not-a-number" },
            { owner: "any" },
            { scope: "private" },
            { sort: "random" },
            { unexpected: "parameter" },
        ]) {
            await authed().query(query).expect(400);
        }
        expect(prisma.playlist.findMany).not.toHaveBeenCalled();
        expect(prisma.playlist.count).not.toHaveBeenCalled();
    });

    it("reports empty pages without widening query permissions", async () => {
        (prisma.playlist.count as jest.Mock).mockReset().mockResolvedValue(0);
        (prisma.playlist.findMany as jest.Mock).mockResolvedValue([]);
        const response = await authed().expect(200);
        expect(response.body).toMatchObject({
            total: 0, pages: 1, counts: { visible: 0, hidden: 0 }, items: [],
        });
    });
});
