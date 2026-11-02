jest.mock("../../../middleware/auth", () => ({
    requireAdmin: (req: any, res: any, next: any) => {
        if (!req.user) return res.status(401).json({ error: "Not authenticated" });
        if (req.user.role !== "admin") return res.status(403).json({ error: "Admin access required" });
        next();
    },
}));
jest.mock("../../../services/libraryDoctor", () => ({
    getLibraryDoctorReport: jest.fn(),
}));
jest.mock("../../../utils/logger", () => ({
    logger: { error: jest.fn() },
}));

import express from "express";
import request from "supertest";
import doctorRouter from "../doctor";
import { getLibraryDoctorReport } from "../../../services/libraryDoctor";

const getReport = getLibraryDoctorReport as jest.Mock;

function appFor(role?: string) {
    const app = express();
    app.use((req, _res, next) => {
        if (role) (req as any).user = { id: "test-user", username: "test", role };
        next();
    });
    app.use("/", doctorRouter);
    return app;
}

beforeEach(() => jest.resetAllMocks());

describe("GET /doctor/report", () => {
    it("rejects anonymous users without performing any diagnostics", async () => {
        const response = await request(appFor()).get("/doctor/report");
        expect(response.status).toBe(401);
        expect(getReport).not.toHaveBeenCalled();
    });

    it("rejects regular users without performing any diagnostics", async () => {
        const response = await request(appFor("user")).get("/doctor/report");
        expect(response.status).toBe(403);
        expect(getReport).not.toHaveBeenCalled();
    });

    it("serves an uncached report to administrators", async () => {
        const report = { basis: "indexed-metadata", counts: { libraryTracks: 42 } };
        getReport.mockResolvedValue(report);
        const response = await request(appFor("admin")).get("/doctor/report");
        expect(response.status).toBe(200);
        expect(response.body).toEqual(report);
        expect(response.headers["cache-control"]).toBe("private, no-store");
        expect(getReport).toHaveBeenCalledTimes(1);
    });

    it("fails closed when the diagnostics query fails", async () => {
        getReport.mockRejectedValue(new Error("offline"));
        const response = await request(appFor("admin")).get("/doctor/report");
        expect(response.status).toBe(500);
        expect(response.body.error).toBe("Failed to inspect the library");
    });
});
