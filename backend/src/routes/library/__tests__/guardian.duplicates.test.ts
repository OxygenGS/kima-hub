import express from "express";
import request from "supertest";

const inspect = jest.fn();

jest.mock("../../../middleware/auth", () => ({
    requireAdmin: (req: any, res: any, next: any) => {
        if (req.headers["x-test-role"] !== "admin") {
            return res.status(403).json({ error: "Forbidden" });
        }
        req.user = { id: req.headers["x-test-user"] || "admin" };
        next();
    },
}));
jest.mock("../../../services/libraryGuardianDuplicates", () => ({
    getLibraryGuardianDuplicates: (...args: unknown[]) => inspect(...args),
}));
jest.mock("../../../services/libraryDoctor", () => ({ getLibraryDoctorReport: jest.fn() }));
jest.mock("../../../services/smartDownloadInbox", () => ({ getSmartDownloadInbox: jest.fn() }));
jest.mock("../../../services/smartImportSuggestion", () => ({ getSmartImportSuggestion: jest.fn() }));
jest.mock("../../../services/smartImportRepair", () => ({
    applySmartImportRepair: jest.fn(), undoSmartImportRepair: jest.fn(),
    SmartImportRepairError: class extends Error {},
}));

import doctorRouter from "../doctor";

const app = express();
app.use(express.json());
app.use("/api/library", doctorRouter);

beforeEach(() => {
    jest.clearAllMocks();
    inspect.mockResolvedValue({
        readOnly: true, basis: "indexed-recording-metadata",
        groupLimit: 8, sampleLimit: 4, generatedAt: "2026-11-17T12:00:00.000Z",
        hasMore: false, candidates: [],
    });
});

describe("Library Guardian duplicate route", () => {
    it("does not allow unauthenticated or non-admin users to inspect paths", async () => {
        await request(app).get("/api/library/doctor/guardian/duplicates").expect(403);
        await request(app).get("/api/library/doctor/guardian/duplicates")
            .set("x-test-role", "listener").expect(403);
        expect(inspect).not.toHaveBeenCalled();
    });

    it("strictly limits admin requests and rejects injected query fields", async () => {
        for (const query of [
            "?limit=0", "?limit=13", "?limit=-5", "?limit=1.2",
            "?limit=999", "?limit=1&limit=2", "?userId=someone",
        ]) {
            await request(app).get("/api/library/doctor/guardian/duplicates" + query)
                .set("x-test-role", "admin").expect(400);
        }
        expect(inspect).not.toHaveBeenCalled();
    });

    it("returns read-only evidence only when an administrator explicitly asks", async () => {
        const res = await request(app).get("/api/library/doctor/guardian/duplicates?limit=5")
            .set("x-test-role", "admin").expect(200);
        expect(res.headers["cache-control"]).toBe("private, no-store");
        expect(inspect).toHaveBeenCalledWith(5);
        expect(res.body).toMatchObject({ readOnly: true, candidates: [], groupLimit: 8 });
    });

    it("uses default sampling without saving or starting a scan", async () => {
        await request(app).get("/api/library/doctor/guardian/duplicates")
            .set("x-test-role", "admin").expect(200);
        expect(inspect).toHaveBeenCalledWith(8);
    });

    it("does not report fictional health when the underlying DB check fails", async () => {
        inspect.mockRejectedValueOnce(new Error("database offline"));
        const res = await request(app).get("/api/library/doctor/guardian/duplicates")
            .set("x-test-role", "admin").expect(500);
        expect(res.body.error).toMatch(/Failed to inspect/);
    });
});
