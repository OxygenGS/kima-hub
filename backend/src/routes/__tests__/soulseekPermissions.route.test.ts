/**
 * The real v1.11 Soulseek router must check persisted per-user download
 * permission BEFORE it queries credentials or writes any music/download job.
 * Only request authentication is synthetic; use actual permission middleware.
 */
const mockCurrentUser = jest.fn();
const mockIsAvailable = jest.fn();
const mockDownloadTrack = jest.fn();
jest.mock("../../utils/db", () => ({
    prisma: {
        user: { findUnique: (...args: unknown[]) => mockCurrentUser(...args) },
    },
}));
jest.mock("../../utils/logger", () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../services/soulseek", () => ({
    soulseekService: {
        isAvailable: (...args: unknown[]) => mockIsAvailable(...args),
        downloadTrack: (...args: unknown[]) => mockDownloadTrack(...args),
    },
}));
jest.mock("../../services/eventBus", () => ({
    eventBus: { emit: jest.fn() },
}));
jest.mock("../../utils/systemSettings", () => ({
    getSystemSettings: jest.fn(),
}));
jest.mock("../../middleware/auth", () => ({
    requireAuth: (req: any, _res: any, next: any) => {
        req.user = { id: "real-soulseek-test-user", username: "listener", role: "user" };
        next();
    },
    requireMusicPermission: jest.requireActual("../../middleware/auth").requireMusicPermission,
}));

import express from "express";
import request from "supertest";
import soulseekRouter from "../soulseek";

const app = express();
app.use(express.json());
app.use("/soulseek", soulseekRouter);

beforeEach(() => {
    mockCurrentUser.mockReset().mockResolvedValue({
        role: "user",
        canRequestAlbums: false,
        canDownloadTracks: false,
    });
    mockIsAvailable.mockReset().mockResolvedValue(true);
    mockDownloadTrack.mockReset();
});

describe("POST /soulseek/download — original fork rights retained in v1.11", () => {
    const post = () => request(app).post("/soulseek/download").send({
        username: "peer", filepath: "Artist/Album/01 - Example.flac",
    });

    it("denies an unprivileged listener before Soulseek or file actions", async () => {
        const response = await post();
        expect(response.status).toBe(403);
        expect(response.body.permission).toBe("canDownloadTracks");
        expect(mockIsAvailable).not.toHaveBeenCalled();
        expect(mockDownloadTrack).not.toHaveBeenCalled();
        expect(mockCurrentUser).toHaveBeenCalledWith({
            where: { id: "real-soulseek-test-user" },
            select: { role: true, canRequestAlbums: true, canDownloadTracks: true },
        });
    });

    it("a granted listener reaches regular input validation", async () => {
        mockCurrentUser.mockResolvedValue({
            role: "user", canRequestAlbums: false, canDownloadTracks: true,
        });
        const response = await request(app).post("/soulseek/download").send({});
        expect(response.status).toBe(400);
        expect(response.body.error).toBe("username and filepath are required");
        expect(mockIsAvailable).toHaveBeenCalledTimes(1);
        expect(mockDownloadTrack).not.toHaveBeenCalled();
    });

    it("the administrator bypasses individual flags, not input validation", async () => {
        mockCurrentUser.mockResolvedValue({
            role: "admin", canRequestAlbums: false, canDownloadTracks: false,
        });
        const response = await request(app).post("/soulseek/download").send({});
        expect(response.status).toBe(400);
        expect(mockIsAvailable).toHaveBeenCalledTimes(1);
    });

    it("denies deleted accounts without contacting Soulseek", async () => {
        mockCurrentUser.mockResolvedValue(null);
        const response = await post();
        expect(response.status).toBe(401);
        expect(mockIsAvailable).not.toHaveBeenCalled();
    });

    it("fails closed if persisted permissions cannot be read", async () => {
        mockCurrentUser.mockRejectedValue(new Error("temporary database failure"));
        const response = await post();
        expect(response.status).toBe(500);
        expect(mockIsAvailable).not.toHaveBeenCalled();
        expect(mockDownloadTrack).not.toHaveBeenCalled();
    });
});
