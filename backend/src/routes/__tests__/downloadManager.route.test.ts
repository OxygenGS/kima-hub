import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";

const mockOverview = jest.fn();
const mockBoundQueue = jest.fn();
const mockPermissionUser = jest.fn();
jest.mock("../../utils/db", () => ({
    prisma: { user: { findUnique: (...args: unknown[]) => mockPermissionUser(...args) } },
}));
jest.mock("../../services/unifiedDownloadOverview", () => ({
    MAX_DOWNLOAD_PAGE_SIZE: 100,
    MAX_DOWNLOAD_OFFSET: 1000,
    getUnifiedDownloadOverview: (...args: unknown[]) => mockOverview(...args),
}));
jest.mock("../../services/downtifyBoundQueue", () => ({
    getBoundDowntifyQueue: (...args: unknown[]) => mockBoundQueue(...args),
}));
jest.mock("../../utils/logger", () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../middleware/auth", () => ({
    requireMusicPermission: jest.requireActual("../../middleware/auth").requireMusicPermission,
    requireAuth: (req: Request, res: Response, next: NextFunction) => {
        const id = req.header("x-test-user");
        if (!id || !req.header("authorization")) {
            return res.status(401).json({ error: "Not authenticated" });
        }
        req.user = { id, role: "user" } as Request["user"];
        next();
    },
}));

import downloadManagerRoutes from "../downloadManager";

const app = express();
app.use(express.json());
app.use("/api/download-manager", downloadManagerRoutes);
const read = (user = "user-A", path = "/api/download-manager/jobs") =>
    request(app).get(path).set("Authorization", "Bearer synthetic-test-token").set("X-Test-User", user);

beforeEach(() => {
    mockPermissionUser.mockReset().mockResolvedValue({
        role: "user", canRequestAlbums: false, canDownloadTracks: true,
    });
    mockBoundQueue.mockReset().mockResolvedValue({
        state: "unbound", items: [], displayed: 0, hasMore: false,
    });
    mockOverview.mockReset().mockResolvedValue({
        items: [], total: 0, displayed: 0, limit: 50, offset: 0,
        hasMore: false, pageCounts: {
            queued: 0, processing: 0, downloaded: 0,
            failed: 0, cancelled: 0, unknown: 0,
        }, downtifyJobsIncluded: false,
    });
});

describe("read-only unified job feed", () => {
    it("does not query Kima jobs when unauthenticated", async () => {
        const res = await request(app).get("/api/download-manager/jobs");
        expect(res.status).toBe(401);
        expect(mockOverview).not.toHaveBeenCalled();
    });

    it("uses authenticated identity, ignoring a forged userId or admin claim", async () => {
        const response = await read("user-A", "/api/download-manager/jobs?userId=user-B&role=admin");
        expect(response.status).toBe(200);
        expect(mockOverview).toHaveBeenCalledWith("user-A", 50, 0);
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(response.body.downtifyJobsIncluded).toBe(false);
    });

    it("accepts strictly bounded page size and offset", async () => {
        const response = await read("user-C", "/api/download-manager/jobs?limit=100&offset=1000");
        expect(response.status).toBe(200);
        expect(mockOverview).toHaveBeenCalledWith("user-C", 100, 1000);
    });

    it.each([
        "?limit=0", "?limit=101", "?limit=-1", "?limit=1.5", "?limit=abc",
        "?offset=-1", "?offset=1001", "?offset=abc", "?limit[]=5",
    ])("rejects %s before touching the database", async (q) => {
        const response = await read("user-A", "/api/download-manager/jobs" + q);
        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: "Invalid pagination" });
        expect(mockOverview).not.toHaveBeenCalled();
    });

    it("returns a generic failure without leaking DB errors, paths or secrets", async () => {
        mockOverview.mockRejectedValue(new Error("secret=never-return /music/private/file.flac"));
        const response = await read();
        expect(response.status).toBe(500);
        expect(response.body).toEqual({ error: "Unable to load download overview" });
        expect(JSON.stringify(response.body)).not.toContain("never-return");
    });

    it("has no route for download creation, modification or cancellation", async () => {
        expect((await request(app).post("/api/download-manager/jobs").send({})).status).toBe(404);
        expect((await request(app).patch("/api/download-manager/jobs/any").send({})).status).toBe(404);
        expect((await request(app).delete("/api/download-manager/jobs/any")).status).toBe(404);
        expect(mockOverview).not.toHaveBeenCalled();
    });
});

describe("owner-bound Downtify read-only route", () => {
    it("requires authentication before remote lookup", async () => {
        const response = await request(app).get("/api/download-manager/downtify/jobs");
        expect(response.status).toBe(401);
        expect(mockBoundQueue).not.toHaveBeenCalled();
    });

    it("uses only the authenticated Kima user, never a query-supplied owner", async () => {
        const response = await read("my-kima-id", "/api/download-manager/downtify/jobs?userId=other&admin=true");
        expect(response.status).toBe(200);
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(mockBoundQueue).toHaveBeenCalledWith("my-kima-id");
        expect(response.body).toEqual({ state: "unbound", items: [], displayed: 0, hasMore: false });
    });

    it("does not return upstream errors or secrets", async () => {
        mockBoundQueue.mockRejectedValue(new Error("secret=private path=/music/personal"));
        const response = await read("my-kima-id", "/api/download-manager/downtify/jobs");
        expect(response.status).toBe(503);
        expect(response.body).toEqual({
            state: "unavailable", items: [], displayed: 0, hasMore: false,
        });
    });

    it("provides no create, cancel or delete actions", async () => {
        const endpoint = "/api/download-manager/downtify/jobs";
        expect((await request(app).post(endpoint).send({})).status).toBe(404);
        expect((await request(app).delete(endpoint)).status).toBe(404);
        expect((await request(app).patch(endpoint).send({})).status).toBe(404);
        expect(mockBoundQueue).not.toHaveBeenCalled();
    });
});


describe("Spotify link intake preview, no downloads submitted", () => {
    const id = "0123456789ABCDEFGHIJKL";
    const post = (body: object | string = { url: "https://open.spotify.com/track/" + id }) =>
        request(app).post("/api/download-manager/spotify/preview")
            .set("Authorization", "Bearer synthetic-test-token")
            .set("X-Test-User", "account-A").send(body);

    it("requires authentication before querying stored permissions", async () => {
        const response = await request(app).post("/api/download-manager/spotify/preview")
            .send({ url: "https://open.spotify.com/track/" + id });
        expect(response.status).toBe(401);
        expect(mockPermissionUser).not.toHaveBeenCalled();
        expect(mockBoundQueue).not.toHaveBeenCalled();
    });

    it("uses current database permissions, not client-provided claims", async () => {
        mockPermissionUser.mockResolvedValue({
            role: "user", canRequestAlbums: true, canDownloadTracks: false,
        });
        const response = await post({
            url: "https://open.spotify.com/track/" + id,
            canDownloadTracks: true, role: "admin", userId: "another-user",
        });
        expect(response.status).toBe(403);
        expect(response.body.permission).toBe("canDownloadTracks");
        expect(mockPermissionUser).toHaveBeenCalledWith({
            where: { id: "account-A" },
            select: { role: true, canRequestAlbums: true, canDownloadTracks: true },
        });
        expect(mockBoundQueue).not.toHaveBeenCalled();
    });

    it("allows an administrator but still validates their link", async () => {
        mockPermissionUser.mockResolvedValue({
            role: "admin", canRequestAlbums: false, canDownloadTracks: false,
        });
        const response = await post({ url: "https://open.spotify.com/album/" + id + "?si=share" });
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            provider: "spotify", kind: "album",
            canonicalUrl: "https://open.spotify.com/album/" + id,
            intentKey: "spotify:album:" + id,
            duplicateCheck: "not_checked",
            downloadStarted: false,
            libraryVerification: "not_checked",
            submissionEnabled: false,
        });
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(JSON.stringify(response.body)).not.toContain("share");
    });

    it("accepts a permitted listener but NEVER queues or checks any downloads", async () => {
        const response = await post();
        expect(response.status).toBe(200);
        expect(response.body.kind).toBe("track");
        expect(response.body.downloadStarted).toBe(false);
        expect(response.body.duplicateCheck).toBe("not_checked");
        expect(response.body.submissionEnabled).toBe(false);
        expect(mockBoundQueue).not.toHaveBeenCalled();
        expect(mockOverview).not.toHaveBeenCalled();
    });

    it.each([
        {}, { url: null }, { url: 123 }, { url: [] },
        { url: "https://spotify.example/track/" + id },
        { url: "http://open.spotify.com/track/" + id },
        { url: "https://open.spotify.com/artist/" + id },
        { url: "https://open.spotify.com/track/nope" },
        { url: "x".repeat(2400) },
    ])("rejects an unsupported input before any remote operation: %p", async (body) => {
        const response = await post(body);
        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            error: "Unsupported Spotify track, album or playlist link",
        });
        expect(JSON.stringify(response.body)).not.toContain("x".repeat(60));
        expect(mockBoundQueue).not.toHaveBeenCalled();
    });

    it("denies removed accounts and fails closed on permission-store errors", async () => {
        mockPermissionUser.mockResolvedValue(null);
        expect((await post()).status).toBe(401);
        mockPermissionUser.mockRejectedValue(new Error("private database failure"));
        const response = await post();
        expect(response.status).toBe(500);
        expect(JSON.stringify(response.body)).not.toContain("private database failure");
    });
});
