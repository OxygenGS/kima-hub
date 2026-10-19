/**
 * The actual Subsonic routers must respect the fork's current persisted
 * canDownloadTracks flag. Streaming is intentionally different from download.
 * Authentication is synthetic; the live permission lookup and protocol errors
 * are real.
 */
jest.mock("../../../utils/db", () => ({
    prisma: {
        user: { findUnique: jest.fn(), findMany: jest.fn() },
        track: { findUnique: jest.fn() },
    },
}));
jest.mock("../../../utils/logger", () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../../services/liveListening", () => ({
    publicUserId: jest.fn().mockResolvedValue("subsonic-listener"),
    getLiveState: jest.fn().mockReturnValue({ status: "stopped", trackId: null, position: 0 }),
    reportLive: jest.fn(),
}));
jest.mock("../../../services/listenBrainz", () => ({
    listenBrainzService: { submitListens: jest.fn().mockResolvedValue(false) },
}));

import express from "express";
import request from "supertest";
import { prisma } from "../../../utils/db";
import { playbackRouter } from "../playback";
import { profileRouter } from "../profile";
import { userManagementRouter } from "../userManagement";

const findUser = prisma.user.findUnique as jest.Mock;
const findTrack = prisma.track.findUnique as jest.Mock;
const findUsers = prisma.user.findMany as jest.Mock;

function makeApp(role: "user" | "admin" = "user") {
    const app = express();
    app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
        req.user = { id: "subsonic-listener", username: "listener", role };
        next();
    });
    app.use("/rest", playbackRouter, profileRouter, userManagementRouter);
    return app;
}

function download(app: express.Application) {
    return request(app).get("/rest/download.view?id=track-1&f=json");
}
function errorCode(response: request.Response) {
    return response.body["subsonic-response"].error.code;
}

describe("Subsonic explicit file downloads use fresh DB permissions", () => {
    const app = makeApp();
    beforeEach(() => {
        jest.resetAllMocks();
        findUser.mockResolvedValue({
            username: "listener", role: "user", canDownloadTracks: false,
        });
        findTrack.mockResolvedValue(null);
    });

    it("denies download.view before touching a file, even for an authenticated listener", async () => {
        const response = await download(app);
        expect(response.status).toBe(200);
        expect(errorCode(response)).toBe(50);
        expect(findTrack).not.toHaveBeenCalled();
        expect(findUser).toHaveBeenCalledWith({
            where: { id: "subsonic-listener" },
            select: { role: true, canDownloadTracks: true },
        });
    });

    it("uses the same restriction for POST clients", async () => {
        const response = await request(app).post("/rest/download.view?id=track-1&f=json");
        expect(errorCode(response)).toBe(50);
        expect(findTrack).not.toHaveBeenCalled();
    });

    it("allows streaming for listeners whose explicit download is forbidden", async () => {
        const response = await request(app).get("/rest/stream.view?id=track-1&f=json");
        expect(errorCode(response)).toBe(70); // Track mock says not found, not forbidden.
        expect(findTrack).toHaveBeenCalledTimes(1);
        expect(findUser).not.toHaveBeenCalled();
    });

    it("granted permission reaches ordinary track validation", async () => {
        findUser.mockResolvedValue({ role: "user", canDownloadTracks: true });
        const response = await download(app);
        expect(errorCode(response)).toBe(70);
        expect(findTrack).toHaveBeenCalledTimes(1);
    });

    it("uses current DB rights after permission revocation", async () => {
        findUser.mockResolvedValueOnce({ role: "user", canDownloadTracks: true })
            .mockResolvedValueOnce({ role: "user", canDownloadTracks: false });
        expect(errorCode(await download(app))).toBe(70);
        expect(errorCode(await download(app))).toBe(50);
        expect(findTrack).toHaveBeenCalledTimes(1);
    });

    it("an admin can download independently of the permission toggle", async () => {
        findUser.mockResolvedValue({ role: "admin", canDownloadTracks: false });
        expect(errorCode(await download(app))).toBe(70);
        expect(findTrack).toHaveBeenCalledTimes(1);
    });

    it("denies removed users and database outages before track reads", async () => {
        findUser.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("database offline"));
        expect(errorCode(await download(app))).toBe(40);
        expect(errorCode(await download(app))).toBe(0);
        expect(findTrack).not.toHaveBeenCalled();
    });
});

describe("Subsonic user information reports actual download rights", () => {
    const app = makeApp();
    const admin = makeApp("admin");
    beforeEach(() => {
        jest.resetAllMocks();
    });

    it("getUser reports disabled file downloads for a listener", async () => {
        findUser.mockResolvedValue({
            username: "listener", role: "user", canDownloadTracks: false,
        });
        const response = await request(app).get("/rest/getUser.view?f=json");
        expect(response.body["subsonic-response"].user.downloadRole).toBe(false);
    });

    it("getUser reports an administrator's effective download right", async () => {
        findUser.mockResolvedValue({
            username: "listener", role: "admin", canDownloadTracks: false,
        });
        const response = await request(app).get("/rest/getUser.view?f=json");
        expect(response.body["subsonic-response"].user.downloadRole).toBe(true);
    });

    it("getUsers reflects each stored permission independently", async () => {
        findUsers.mockResolvedValue([
            { username: "a", role: "user", canDownloadTracks: false },
            { username: "b", role: "user", canDownloadTracks: true },
            { username: "c", role: "admin", canDownloadTracks: false },
        ]);
        const response = await request(admin).get("/rest/getUsers.view?f=json");
        const users = response.body["subsonic-response"].users.user;
        expect(users.map((u: { downloadRole: boolean }) => u.downloadRole)).toEqual([false, true, true]);
    });
});
