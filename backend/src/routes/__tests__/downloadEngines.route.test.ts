import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";

const mockProbe = jest.fn();
const mockStorage = jest.fn();
jest.mock("../../services/downtifyStoragePreflight", () => ({
    inspectDowntifyStorage: (...args: unknown[]) => mockStorage(...args),
}));
jest.mock("../../services/downtifyClient", () => ({
    probeDowntify: (...args: unknown[]) => mockProbe(...args),
}));
jest.mock("../../middleware/auth", () => ({
    requireAuth: (req: Request, res: Response, next: NextFunction) => {
        if (!req.header("authorization")) return res.status(401).json({ error: "Not authenticated" });
        next();
    },
    requireAdmin: (req: Request, res: Response, next: NextFunction) => {
        if (req.header("x-test-role") !== "admin") return res.status(403).json({ error: "Admin access required" });
        next();
    },
}));

import router from "../downloadEngines";
const app = express();
app.use("/api/download-engines", router);

beforeEach(() => {
    mockStorage.mockReset().mockResolvedValue({
        state: "disabled", filesystemRelation: "not_checked",
        copyRequiredByDevice: null, mountIdentityVerified: false,
        sourceAudioVerified: false, libraryImportVerified: false,
        importerCutoverAuthorized: false, filesChanged: false,
    });
    mockProbe.mockReset().mockResolvedValue({
        engine: "downtify",
        enabled: false,
        configured: false,
        state: "disabled",
    });
});

describe("read-only Downtify engine diagnostics", () => {
    it("requires authentication before performing any network probe", async () => {
        const res = await request(app).get("/api/download-engines/downtify/status");
        expect(res.status).toBe(401);
        expect(mockProbe).not.toHaveBeenCalled();
    });

    it("requires an administrator, not any signed-in downloader", async () => {
        const res = await request(app).get("/api/download-engines/downtify/status")
            .set("Authorization", "Bearer signed-in-user")
            .set("X-Test-Role", "user");
        expect(res.status).toBe(403);
        expect(mockProbe).not.toHaveBeenCalled();
    });

    it("returns a no-store status to administrators, with no settings or tokens", async () => {
        const res = await request(app).get("/api/download-engines/downtify/status")
            .set("Authorization", "Bearer signed-in-admin")
            .set("X-Test-Role", "admin");
        expect(res.status).toBe(200);
        expect(res.headers["cache-control"]).toBe("no-store");
        expect(res.body).toEqual({
            engine: "downtify", enabled: false, configured: false, state: "disabled",
        });
        expect(mockProbe).toHaveBeenCalledTimes(1);
    });

    it("does not expose a write route during phase A", async () => {
        const res = await request(app).post("/api/download-engines/downtify/status")
            .set("Authorization", "Bearer signed-in-admin")
            .set("X-Test-Role", "admin");
        expect(res.status).toBe(404);
        expect(mockProbe).not.toHaveBeenCalled();
    });
});


describe("D4 admin-only read-only storage topology route", () => {
    const url = "/api/download-engines/downtify/storage-preflight";
    const admin = () => request(app).get(url)
        .set("Authorization", "Bearer signed-in-admin")
        .set("X-Test-Role", "admin");

    it("rejects unauthenticated callers without any disk inspection", async () => {
        const res = await request(app).get(url);
        expect(res.status).toBe(401);
        expect(mockStorage).not.toHaveBeenCalled();
    });

    it("rejects any non-admin, including a Kima download-permitted account", async () => {
        const res = await request(app).get(url)
            .set("Authorization", "Bearer signed-in-user")
            .set("X-Test-Role", "user");
        expect(res.status).toBe(403);
        expect(mockStorage).not.toHaveBeenCalled();
    });

    it("returns a sanitized disabled state with no-store headers", async () => {
        const res = await admin();
        expect(res.status).toBe(200);
        expect(res.headers["cache-control"]).toBe("no-store");
        expect(res.body).toEqual({
            state: "disabled", filesystemRelation: "not_checked",
            copyRequiredByDevice: null, mountIdentityVerified: false,
            sourceAudioVerified: false, libraryImportVerified: false,
            importerCutoverAuthorized: false, filesChanged: false,
        });
        expect(mockStorage).toHaveBeenCalledTimes(1);
    });

    it("reports cross-device topology without filesystem paths or source data", async () => {
        mockStorage.mockResolvedValue({
            state: "inspected", filesystemRelation: "different_device",
            copyRequiredByDevice: true, mountIdentityVerified: false,
            sourceAudioVerified: false, libraryImportVerified: false,
            importerCutoverAuthorized: false, filesChanged: false,
        });
        const res = await admin();
        expect(res.status).toBe(200);
        expect(res.body.filesChanged).toBe(false);
        expect(res.body.importerCutoverAuthorized).toBe(false);
        expect(JSON.stringify(res.body)).not.toContain("/music");
        expect(JSON.stringify(res.body)).not.toContain("/downloads");
    });

    it("redacts failed local inspections and does not expose write methods", async () => {
        mockStorage.mockRejectedValue(new Error("private source path /music secret"));
        const res = await admin();
        expect(res.status).toBe(503);
        expect(res.body).toEqual({ error: "Storage inspection unavailable" });
        expect(JSON.stringify(res.body)).not.toContain("secret");
        expect((await request(app).post(url)
            .set("Authorization", "Bearer signed-in-admin")
            .set("X-Test-Role", "admin").send({})).status).toBe(404);
        expect((await request(app).delete(url)
            .set("Authorization", "Bearer signed-in-admin")
            .set("X-Test-Role", "admin")).status).toBe(404);
    });
});
