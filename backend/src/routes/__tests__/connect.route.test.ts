/** The Connect API only exposes authenticated owner's players and accepts safe commands. */
const mockList = jest.fn();
const mockPulse = jest.fn();
const mockSend = jest.fn();
jest.mock("../../services/connectDevices", () => ({
    listConnectDevices: (...args: unknown[]) => mockList(...args),
    heartbeatConnectDevice: (...args: unknown[]) => mockPulse(...args),
    sendConnectCommand: (...args: unknown[]) => mockSend(...args),
    ConnectDeviceLimitError: class ConnectDeviceLimitError extends Error {},
}));
jest.mock("../../middleware/auth", () => ({
    requireAuth: (req: any, res: any, next: any) => {
        if (!req.headers["x-test-user"]) return res.status(401).end();
        req.user = { id: req.headers["x-test-user"] };
        next();
    },
}));

import express from "express";
import request from "supertest";
import connectRoutes from "../connect";

const app = express();
app.use(express.json());
app.use("/api/connect", connectRoutes);

const A = "aa47d96f-37dd-4fd4-a550-74e10e2f7241";
const B = "bb47d96f-37dd-4fd4-a550-74e10e2f7242";

beforeEach(() => {
    jest.clearAllMocks();
    mockList.mockResolvedValue([]);
    mockPulse.mockResolvedValue({ command: null, ttlSeconds: 45 });
    mockSend.mockResolvedValue({ id: "cmd1", type: "pause", createdAt: Date.now() });
});

describe("Kima Connect API", () => {
    it("rejects anonymous presence, listing and remote commands", async () => {
        expect((await request(app).get("/api/connect/devices")).status).toBe(401);
        expect((await request(app).post("/api/connect/heartbeat").mockSend({
            id: A, name: "Kima desktop", status: "playing", trackTitle: null,
        })).status).toBe(401);
        expect((await request(app).post("/api/connect/devices/" + B + "/command").mockSend({ type: "pause" })).status).toBe(401);
        expect(mockList).not.toHaveBeenCalled();
        expect(mockSend).not.toHaveBeenCalled();
    });

    it("lists devices only through caller's account", async () => {
        await request(app).get("/api/connect/devices").set("x-test-user", "alice").expect(200);
        await request(app).get("/api/connect/devices").set("x-test-user", "bob").expect(200);
        expect(mockList).toHaveBeenNthCalledWith(1, "alice");
        expect(mockList).toHaveBeenNthCalledWith(2, "bob");
    });

    it("rejects fake device identifiers, invalid status and unexpected payload fields", async () => {
        for (const bad of [
            { id: "not-a-uuid", name: "Phone", status: "idle", trackTitle: null },
            { id: A, name: "Phone", status: "running", trackTitle: null },
            { id: A, name: "Phone", status: "idle", trackTitle: null, userId: "bob" },
        ]) {
            await request(app).post("/api/connect/heartbeat").set("x-test-user", "alice").mockSend(bad).expect(400);
        }
        expect(mockPulse).not.toHaveBeenCalled();
        await request(app).post("/api/connect/heartbeat").set("x-test-user", "alice").mockSend({
            id: A, name: "Phone", status: "playing", trackTitle: "Song",
        }).expect(200);
        expect(mockPulse).toHaveBeenCalledWith("alice", expect.objectContaining({ id: A }));
    });

    it("rejects unknown commands, cross-account targets and stale players", async () => {
        await request(app).post("/api/connect/devices/" + B + "/command").set("x-test-user", "alice")
            .mockSend({ type: "deleteFiles" }).expect(400);
        await request(app).post("/api/connect/devices/invalid/command").set("x-test-user", "alice")
            .mockSend({ type: "pause" }).expect(400);
        expect(mockSend).not.toHaveBeenCalled();
        mockSend.mockResolvedValueOnce(null);
        await request(app).post("/api/connect/devices/" + B + "/command").set("x-test-user", "bob")
            .mockSend({ type: "pause" }).expect(404);
        expect(mockSend).toHaveBeenCalledWith("bob", B, "pause");
    });

    it("returns 202 for queued commands; does not claim the browser already executed them", async () => {
        const res = await request(app).post("/api/connect/devices/" + B + "/command")
            .set("x-test-user", "alice").mockSend({ type: "next" }).expect(202);
        expect(res.body).toEqual({ queued: true, commandId: "cmd1" });
        expect(mockSend).toHaveBeenCalledWith("alice", B, "next");
        expect(res.headers["cache-control"]).toBe("private, no-store");
    });
});
