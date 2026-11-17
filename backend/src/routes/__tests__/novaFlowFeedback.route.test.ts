import express from "express";
import request from "supertest";

const save = jest.fn();
const clear = jest.fn();

jest.mock("../../middleware/auth", () => ({
    requireAuth: (req: any, res: any, next: any) => {
        const userId = req.headers["x-test-user"];
        if (!userId) return res.status(401).json({ error: "Unauthorized" });
        req.user = { id: userId };
        next();
    },
}));
jest.mock("../../services/novaFlowFeedback", () => ({
    setNovaFlowFeedback: (...args: unknown[]) => save(...args),
    clearNovaFlowFeedback: (...args: unknown[]) => clear(...args),
}));
jest.mock("../../services/novaFlow", () => ({
    buildNovaFlow: jest.fn(),
}));

import vibeRouter from "../vibe";

const app = express();
app.use(express.json());
app.use("/api/vibe", vibeRouter);

beforeEach(() => {
    jest.clearAllMocks();
    save.mockResolvedValue("more");
    clear.mockResolvedValue(undefined);
});

describe("Music DNA feedback HTTP authorization", () => {
    it("requires a valid session for write and undo", async () => {
        await request(app).put("/api/vibe/flow/feedback")
            .send({ trackId: "track1", choice: "more" }).expect(401);
        await request(app).delete("/api/vibe/flow/feedback/track1").expect(401);
        expect(save).not.toHaveBeenCalled();
        expect(clear).not.toHaveBeenCalled();
    });

    it("requires strict bounded choices and never accepts client-supplied user IDs", async () => {
        const invalid = [
            {}, { choice: "more" }, { trackId: "", choice: "more" },
            { trackId: "track1", choice: "neutral" },
            { trackId: "track1", choice: 1 },
            { trackId: "track1", choice: "less", userId: "another" },
            { trackId: "x".repeat(101), choice: "more" },
        ];
        for (const value of invalid) {
            await request(app).put("/api/vibe/flow/feedback")
                .set("x-test-user", "alice").send(value).expect(400);
        }
        expect(save).not.toHaveBeenCalled();
    });

    it("scopes a personal positive choice to the authenticated account", async () => {
        const r = await request(app).put("/api/vibe/flow/feedback")
            .set("x-test-user", "alice").send({ trackId: "track1", choice: "more" })
            .expect(200);
        expect(r.headers["cache-control"]).toBe("private, no-store");
        expect(r.body).toEqual({ trackId: "track1", feedback: "more" });
        expect(save).toHaveBeenCalledWith("alice", "track1", "more");
    });

    it("accepts a negative preference without changing Favorites or playback", async () => {
        save.mockResolvedValue("less");
        const r = await request(app).put("/api/vibe/flow/feedback")
            .set("x-test-user", "bob").send({ trackId: "track2", choice: "less" }).expect(200);
        expect(r.body).toEqual({ trackId: "track2", feedback: "less" });
        expect(save).toHaveBeenCalledWith("bob", "track2", "less");
    });

    it("refuses unavailable or unowned catalog entries", async () => {
        save.mockResolvedValue(null);
        await request(app).put("/api/vibe/flow/feedback")
            .set("x-test-user", "alice").send({ trackId: "missing", choice: "more" })
            .expect(404);
    });

    it("provides idempotent private JSON undo for the shared client", async () => {
        const r = await request(app).delete("/api/vibe/flow/feedback/track1")
            .set("x-test-user", "alice").expect(200);
        expect(clear).toHaveBeenCalledWith("alice", "track1");
        expect(r.headers["cache-control"]).toBe("private, no-store");
        expect(r.body).toEqual({ trackId: "track1", feedback: null });
    });

    it("validates undo IDs without touching another account", async () => {
        await request(app).delete("/api/vibe/flow/feedback/" + "x".repeat(101))
            .set("x-test-user", "alice").expect(400);
        expect(clear).not.toHaveBeenCalled();
    });
});
