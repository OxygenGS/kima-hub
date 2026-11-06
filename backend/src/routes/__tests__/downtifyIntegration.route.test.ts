import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";

const mockStatus = jest.fn();
const mockPair = jest.fn();
const mockTest = jest.fn();
const mockTestSaved = jest.fn();
const mockControls = jest.fn();
jest.mock("../../services/downtifyIntegrationSettings", () => ({
    DowntifySetupError: class DowntifySetupError extends Error {
        constructor(public state: string) { super(state); }
    },
    getDowntifyAdminStatus: (...args: unknown[]) => mockStatus(...args),
    pairDowntify: (...args: unknown[]) => mockPair(...args),
    verifyDowntifyPair: (...args: unknown[]) => mockTest(...args),
    testSavedDowntifyPair: (...args: unknown[]) => mockTestSaved(...args),
    updateDowntifyControls: (...args: unknown[]) => mockControls(...args),
}));
jest.mock("../../middleware/auth", () => ({
    requireAdmin: (req: Request, res: Response, next: NextFunction) => {
        const role = req.header("x-test-role");
        if (!req.header("authorization")) return res.status(401).json({ error: "Not authenticated" });
        if (role !== "admin") return res.status(403).json({ error: "Admin access required" });
        req.user = { id: "admin-1", username: "owner", role: "admin" };
        return next();
    },
}));
import route from "../downtifyIntegration";
const app = express();
app.use(express.json());
app.use("/api/downtify-integration", route);
const url = "/api/downtify-integration";
const admin = () => request(app).get(url)
    .set("Authorization", "Bearer admin")
    .set("X-Test-Role", "admin");
const post = (path: string, body: unknown = {}) => request(app).post(url + path)
    .set("Authorization", "Bearer admin")
    .set("X-Test-Role", "admin")
    .send(body);
const cfg = {
    source: "database", configured: true, enabled: false,
    url: "http://downtify:8000/", username: "remote",
    ownerMatches: true, spotifyIntentsEnabled: false,
    trackSubmissionEnabled: false, reconciliationEnabled: false,
    tokenConfigured: true, fileVerificationManagedInDocker: true,
};
const test = { state: "connected", version: "3.2.0", identityVerified: true };
const TOKEN = "dtfy_synthetic_device_token_1234567890";

beforeEach(() => {
    jest.clearAllMocks();
    mockStatus.mockResolvedValue(cfg);
    mockPair.mockResolvedValue({
        baseUrl: "http://downtify:8000/", expectedUsername: "remote",
        expectedUserId: 12, expectedServerId: "server-id-secret",
        version: "3.2.0",
    });
    mockTest.mockResolvedValue({
        baseUrl: "http://downtify:8000/", expectedUsername: "remote",
        expectedUserId: 12, expectedServerId: "server-id-secret",
        version: "3.2.0",
    });
    mockTestSaved.mockResolvedValue({
        expectedServerId: "server-id-secret", version: "3.2.0",
        expectedUsername: "remote", expectedUserId: 12,
    });
    mockControls.mockResolvedValue(cfg);
});

describe("Downtify Settings admin-only API", () => {
    it("rejects anonymous and regular users before reading configuration", async () => {
        expect((await request(app).get(url)).status).toBe(401);
        expect((await request(app).get(url)
            .set("Authorization", "Bearer regular")
            .set("X-Test-Role", "user")).status).toBe(403);
        expect((await request(app).post(url + "/pair").send({
            baseUrl: "http://downtify:8000", deviceToken: TOKEN,
        })).status).toBe(401);
        expect(mockPair).not.toHaveBeenCalled();
        expect(mockStatus).not.toHaveBeenCalled();
    });

    it("shows no token, remote ID, ciphertext or private server identity", async () => {
        const res = await admin();
        expect(res.status).toBe(200);
        expect(res.headers["cache-control"]).toBe("no-store");
        expect(res.body).toEqual(cfg);
        expect(mockStatus).toHaveBeenCalledWith("admin-1");
        for(const secret of [TOKEN, "server-id-secret", "xc1.", "12"]) {
            expect(JSON.stringify(res.body)).not.toContain(secret);
        }
    });

    it("tests candidate or saved credentials with GET-only service and returns redacted result", async () => {
        const raw = { baseUrl: "http://downtify:8000", deviceToken: TOKEN };
        const candidate = await post("/test", raw);
        expect(candidate.status).toBe(200);
        expect(candidate.body).toEqual(test);
        expect(mockTest).toHaveBeenCalledWith(raw);
        const stored = await post("/test");
        expect(stored.status).toBe(200);
        expect(stored.body).toEqual(test);
        expect(mockTestSaved).toHaveBeenCalledWith("admin-1");
        expect(JSON.stringify(stored.body)).not.toContain(TOKEN);
    });

    it("does not persist a pairing with invalid credentials, URLs or extra fields", async () => {
        const invalid = await post("/pair", {
            baseUrl: "file:///etc/passwd",
            deviceToken: "bad-password",
            remoteAccountId: 7,
        });
        expect(invalid.status).toBe(400);
        expect(mockPair).not.toHaveBeenCalled();
    });

    it("re-verifies a paired device, pins current admin and never returns the token", async () => {
        const saved = await post("/pair", {
            baseUrl: "http://downtify:8000", deviceToken: TOKEN,
        });
        expect(saved.status).toBe(201);
        expect(mockPair).toHaveBeenCalledWith("admin-1", {
            baseUrl: "http://downtify:8000", deviceToken: TOKEN,
        });
        expect(saved.body).toEqual(cfg);
        expect(JSON.stringify(saved.body)).not.toContain(TOKEN);
    });

    it("requires exact feature keys and keeps submission ACK server-side", async () => {
        const invalid = await post("/controls", {
            enabled: true, spotifyIntentsEnabled: true,
            trackSubmissionEnabled: true, reconciliationEnabled: true,
            stagingPath: "/etc/passwd",
        });
        expect(invalid.status).toBe(400);
        expect(mockControls).not.toHaveBeenCalled();
        const input = {
            enabled: true, spotifyIntentsEnabled: true,
            trackSubmissionEnabled: true, reconciliationEnabled: true,
            acknowledgeTrackSubmission: true,
        };
        const ok = await post("/controls", input);
        expect(ok.status).toBe(200);
        expect(mockControls).toHaveBeenCalledWith("admin-1", {
            enabled: true, spotifyIntentsEnabled: true,
            trackSubmissionEnabled: true, reconciliationEnabled: true,
        }, true);
    });

    it("redacts upstream exceptions and never exposes write-to-media methods", async () => {
        mockTest.mockRejectedValueOnce(new Error("/music private-token=" + TOKEN));
        const res = await post("/test", { baseUrl: "http://downtify:8000", deviceToken: TOKEN });
        expect(res.status).toBe(503);
        expect(JSON.stringify(res.body)).not.toContain(TOKEN);
        expect(JSON.stringify(res.body)).not.toContain("/music");
        expect((await request(app).delete(url).set("Authorization", "Bearer admin")
            .set("X-Test-Role", "admin")).status).toBe(404);
        expect((await request(app).post(url + "/import").set("Authorization", "Bearer admin")
            .set("X-Test-Role", "admin")).status).toBe(404);
    });
});
