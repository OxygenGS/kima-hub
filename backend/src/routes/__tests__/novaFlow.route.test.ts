import express from "express";
import request from "supertest";

const generate = jest.fn();

jest.mock("../../middleware/auth", () => ({
    requireAuth: (req: any, res: any, next: any) => {
        const owner = req.headers["x-test-user"];
        if (!owner) return res.status(401).json({ error: "Unauthorized" });
        req.user = { id: owner };
        next();
    },
}));

jest.mock("../../services/novaFlow", () => ({
    buildNovaFlow: (...args: unknown[]) => generate(...args),
}));

import vibeRouter from "../vibe";

const app = express();
app.use(express.json());
app.use("/api/vibe", vibeRouter);

beforeEach(() => {
    jest.clearAllMocks();
    generate.mockResolvedValue({ unavailableSeed: false, seedTrackId: "track1", tracks: [] });
});

describe("NOVA Flow authenticated preview", () => {
    it("requires a session and never builds an anonymous profile", async () => {
        await request(app).post("/api/vibe/flow").send({}).expect(401);
        expect(generate).not.toHaveBeenCalled();
    });

    it("validates preferences, strict request body and bounded exclusions", async () => {
        const bad = [
            { energy: -1 }, { energy: 101 }, { energy: "50" },
            { discovery: 101 }, { discovery: NaN }, { limit: 31 },
            { style: "autoplay" }, { userId: "other" },
            { excludeTrackIds: Array.from({ length: 251 }, (_, i) => String(i)) },
        ];
        for (const body of bad) {
            await request(app).post("/api/vibe/flow").set("x-test-user", "alice").send(body).expect(400);
        }
        expect(generate).not.toHaveBeenCalled();
    });

    it("derives user ID from the authenticated context and disables response caching", async () => {
        const res = await request(app).post("/api/vibe/flow").set("x-test-user", "alice")
            .send({ seedTrackId: "track1", style: "balanced", energy: 55, discovery: 35, limit: 20 })
            .expect(200);
        expect(res.headers["cache-control"]).toBe("private, no-store");
        expect(generate).toHaveBeenCalledWith("alice", {
            seedTrackId: "track1", style: "balanced", energy: 55, discovery: 35, limit: 20,
            excludeTrackIds: [],
        });
        expect(res.body.tracks).toEqual([]);
    });

    it("refuses an unavailable explicit seed instead of silently choosing another track", async () => {
        generate.mockResolvedValueOnce({ unavailableSeed: true, seedTrackId: "missing", tracks: [] });
        const res = await request(app).post("/api/vibe/flow")
            .set("x-test-user", "alice").send({ seedTrackId: "missing" }).expect(404);
        expect(res.body.error).toMatch(/not available/);
    });
});
