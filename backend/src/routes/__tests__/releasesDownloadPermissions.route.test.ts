/**
 * New upstream 1.11 Release Radar can start album acquisitions without going
 * through /downloads. Verify the real fork permission middleware blocks this
 * alternative entry point BEFORE any download/acquisition code is reached.
 */
const mockStoredUser = jest.fn();
const mockFindDownload = jest.fn();
const mockCreateDownload = jest.fn();
jest.mock("../../utils/db", () => ({
    prisma: {
        user: { findUnique: (...args: unknown[]) => mockStoredUser(...args) },
        downloadJob: {
            findFirst: (...args: unknown[]) => mockFindDownload(...args),
            create: (...args: unknown[]) => mockCreateDownload(...args),
        },
    },
}));
jest.mock("../../utils/logger", () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../services/lidarr", () => ({
    lidarrService: {},
}));
jest.mock("../../services/artwork", () => ({
    withAlbumArtwork: jest.fn(),
}));
jest.mock("../../middleware/auth", () => ({
    requireAuthOrToken: (req: any, _res: any, next: any) => {
        req.user = { id: "radar-test-user", role: "user", username: "listener" };
        next();
    },
    requireMusicPermission: jest.requireActual("../../middleware/auth").requireMusicPermission,
}));

import express from "express";
import request from "supertest";
import releasesRouter from "../releases";

const app = express();
app.use(express.json());
app.use("/releases", releasesRouter);
const url = "/releases/download/ab12cd34-1111-2222-3333-abcdefabcdef";

beforeEach(() => {
    mockStoredUser.mockReset().mockResolvedValue({
        role: "user", canRequestAlbums: false, canDownloadTracks: false,
    });
    mockFindDownload.mockReset();
    mockCreateDownload.mockReset();
});

describe("v1.11 Release Radar download permissions", () => {
    const post = () => request(app).post(url).send({
        artistName: "Example Artist", albumTitle: "Example Album",
    });
    it("rejects the default listener before any download activity", async () => {
        const res = await post();
        expect(res.status).toBe(403);
        expect(res.body.permission).toBe("canRequestAlbums");
        expect(mockFindDownload).not.toHaveBeenCalled();
        expect(mockCreateDownload).not.toHaveBeenCalled();
    });
    it("requires a current database permission rather than trusting request claims", async () => {
        const res = await post();
        expect(res.status).toBe(403);
        expect(mockStoredUser).toHaveBeenCalledWith({
            where: { id: "radar-test-user" },
            select: { role: true, canRequestAlbums: true, canDownloadTracks: true },
        });
    });
    it("checks the actual request payload after an album grant", async () => {
        mockStoredUser.mockResolvedValue({
            role: "user", canRequestAlbums: true, canDownloadTracks: false,
        });
        const res = await request(app).post(url).send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toContain("artistName and albumTitle");
    });
    it("lets administrators past permission checks even with both toggles off", async () => {
        mockStoredUser.mockResolvedValue({
            role: "admin", canRequestAlbums: false, canDownloadTracks: false,
        });
        const res = await request(app).post(url).send({});
        expect(res.status).toBe(400);
    });
    it("does not begin acquisitions if the permission database fails", async () => {
        mockStoredUser.mockRejectedValue(new Error("Database temporarily down"));
        const res = await post();
        expect(res.status).toBe(500);
        expect(mockFindDownload).not.toHaveBeenCalled();
        expect(mockCreateDownload).not.toHaveBeenCalled();
    });
    it("rejects deleted users without starting an acquisition", async () => {
        mockStoredUser.mockResolvedValue(null);
        const res = await post();
        expect(res.status).toBe(401);
        expect(mockCreateDownload).not.toHaveBeenCalled();
    });
});
