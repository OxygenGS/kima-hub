/**
 * Only administrators may enumerate missing artist images or start a recovery.
 */
const mockRole = { value: "admin" as "admin" | "user" | "anonymous" };
jest.mock("../../middleware/auth", () => ({
    requireAuth: (req: any, res: any, next: any) => {
        if (mockRole.value === "anonymous") return res.status(401).json({ error: "Authentication required" });
        req.user = { id: "test-account", role: mockRole.value };
        return next();
    },
    requireAdmin: (req: any, res: any, next: any) => {
        if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin access required" });
        return next();
    },
}));

const mockCount = jest.fn();
const mockStart = jest.fn();
const mockStatus = jest.fn();
jest.mock("../../services/artistArtworkRecovery", () => ({
    getMissingArtistArtworkCount: (...args: unknown[]) => mockCount(...args),
    startArtistArtworkRecovery: (...args: unknown[]) => mockStart(...args),
    getArtistArtworkRecoveryProgress: (...args: unknown[]) => mockStatus(...args),
}));
jest.mock("../../utils/logger", () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../utils/redis", () => ({
    redisClient: { get: jest.fn(), setex: jest.fn(), del: jest.fn() },
}));
jest.mock("../../services/enrichmentState", () => ({ enrichmentStateService: {} }));
jest.mock("../../services/enrichmentFailureService", () => ({ enrichmentFailureService: {} }));
jest.mock("../../utils/systemSettings", () => ({
    getSystemSettings: jest.fn(),
    invalidateSystemSettingsCache: jest.fn(),
}));
jest.mock("../../services/rateLimiter", () => ({ rateLimiter: {} }));
jest.mock("../../workers/unifiedEnrichment", () => ({
    getEnrichmentProgress: jest.fn(),
    invalidateEnrichmentProgress: jest.fn(),
    retryFailedAndBlocked: jest.fn(),
    redecideEverything: jest.fn(),
    startEnrichmentNow: jest.fn(),
}));
jest.mock("../../services/enrichment", () => ({ enrichmentService: {} }));

import express from "express";
import request from "supertest";
import enrichmentRouter from "../enrichment";

const progress = {
    inProgress: false, queued: 0, processed: 0,
    recovered: 0, missing: 0, failed: 0,
    startedAt: null, finishedAt: null,
};

let app: express.Express;
beforeEach(() => {
    jest.clearAllMocks();
    mockRole.value = "admin";
    mockCount.mockResolvedValue(12);
    mockStart.mockReturnValue(true);
    mockStatus.mockReturnValue(progress);
    app = express();
    app.use(express.json());
    app.use("/enrichment", enrichmentRouter);
});

describe("admin artwork recovery routes", () => {
    it("returns missing count and progress without initiating external requests", async () => {
        const res = await request(app).get("/enrichment/artwork/missing");
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ missingArtists: 12, progress });
        expect(mockStart).not.toHaveBeenCalled();
    });

    it("starts an asynchronous, capped recovery only on POST", async () => {
        const res = await request(app).post("/enrichment/artwork/retry-missing");
        expect(res.status).toBe(202);
        expect(res.body.progress).toEqual(progress);
        expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it("rejects a second request while recovery is in progress", async () => {
        mockStart.mockReturnValue(false);
        const res = await request(app).post("/enrichment/artwork/retry-missing");
        expect(res.status).toBe(409);
        expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it("does not expose status or mutation to a regular account", async () => {
        mockRole.value = "user";
        expect((await request(app).get("/enrichment/artwork/missing")).status).toBe(403);
        expect((await request(app).post("/enrichment/artwork/retry-missing")).status).toBe(403);
        expect(mockCount).not.toHaveBeenCalled();
        expect(mockStart).not.toHaveBeenCalled();
    });

    it("does not expose status or mutation to anonymous callers", async () => {
        mockRole.value = "anonymous";
        expect((await request(app).get("/enrichment/artwork/missing")).status).toBe(401);
        expect((await request(app).post("/enrichment/artwork/retry-missing")).status).toBe(401);
        expect(mockCount).not.toHaveBeenCalled();
        expect(mockStart).not.toHaveBeenCalled();
    });
});
