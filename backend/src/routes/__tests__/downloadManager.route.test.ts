import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";

const mockOverview = jest.fn();
jest.mock("../../services/unifiedDownloadOverview", () => ({
    MAX_DOWNLOAD_PAGE_SIZE: 100,
    MAX_DOWNLOAD_OFFSET: 1000,
    getUnifiedDownloadOverview: (...args: unknown[]) => mockOverview(...args),
}));
jest.mock("../../utils/logger", () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../middleware/auth", () => ({
    requireAuth: (req: Request, res: Response, next: NextFunction) => {
        const id = req.header("x-test-user");
        if (!id || !req.header("authorization")) return res.status(401).json({ error: "Not authenticated" });
        req.user = { id, role: "user" } as Request["user"];
        next();
    },
}));
import router from "../downloadManager";

const app = express();
app.use(express.json());
app.use("/api/download-manager", router);
const read = (path = "/api/download-manager/jobs", user = "user-A") =>
    request(app).get(path).set("Authorization", "Bearer synthetic-test-token").set("X-Test-User", user);

beforeEach(() => {
    mockOverview.mockReset().mockResolvedValue({
        items: [], total: 0, displayed: 0, limit: 50, offset: 0, hasMore: false,
        pageCounts: { queued: 0, processing: 0, downloaded: 0, failed: 0, cancelled: 0, unknown: 0 },
    });
});

describe("Kima-only authenticated download overview", () => {
    it("requires authentication and never queries another user's jobs", async () => {
        expect((await request(app).get("/api/download-manager/jobs")).status).toBe(401);
        expect(mockOverview).not.toHaveBeenCalled();
        const result = await read("/api/download-manager/jobs?userId=other", "user-A");
        expect(result.status).toBe(200);
        expect(mockOverview).toHaveBeenCalledWith("user-A", 50, 0);
        expect(result.headers["cache-control"]).toBe("no-store");
    });
    it("rejects invalid pagination without querying the database", async () => {
        for (const query of ["?limit=0", "?limit=101", "?limit=abc", "?offset=-1", "?offset=1001"]) {
            mockOverview.mockClear();
            const result = await read("/api/download-manager/jobs" + query);
            expect(result.status).toBe(400);
            expect(mockOverview).not.toHaveBeenCalled();
        }
    });
    it("does not expose external download/submit routes", async () => {
        expect((await read("/api/download-manager/downtify/jobs")).status).toBe(404);
        expect((await read("/api/download-manager/spotify/dispatch-capability")).status).toBe(404);
        expect((await request(app).post("/api/download-manager/spotify/intents").send({})).status).toBe(404);
    });
    it("returns a bounded error without leaking internal details", async () => {
        mockOverview.mockRejectedValueOnce(new Error("private /music/path"));
        const result = await read();
        expect(result.status).toBe(500);
        expect(result.body).toEqual({ error: "Unable to load download overview" });
    });
});
