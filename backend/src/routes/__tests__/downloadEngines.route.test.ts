import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";

const mockProbe = jest.fn();
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
