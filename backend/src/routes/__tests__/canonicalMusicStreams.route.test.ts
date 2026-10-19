/**
 * Browser streaming, prewarming and Subsonic streaming/downloads must agree
 * on physical (realpath) music-root containment. A scanned Track's filePath
 * is not a trusted proof that the content is in the music directory.
 */
jest.mock("../../utils/db", () => ({
    prisma: {
        track: { findUnique: jest.fn() },
        user: { findUnique: jest.fn() },
        userSettings: { findUnique: jest.fn() },
    },
}));
jest.mock("../../utils/logger", () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../config", () => ({
    config: {
        music: {
            musicPath: "/tmp/ci-uninitialized-music-root",
            transcodeCachePath: "/tmp/ci-transcode",
            transcodeCacheMaxGb: 10,
        },
    },
}));
jest.mock("../../services/audioStreaming", () => ({
    getAudioStreamingService: jest.fn(),
    isQuality: (value: unknown) =>
        typeof value === "string" && ["original", "high", "medium", "low"].includes(value),
}));
jest.mock("../../services/liveListening", () => ({
    publicUserId: jest.fn().mockResolvedValue("ci-listener"),
    getLiveState: jest.fn().mockReturnValue({ status: "stopped", trackId: null, position: 0 }),
    reportLive: jest.fn(),
}));
jest.mock("../../services/listenBrainz", () => ({
    listenBrainzService: { submitListens: jest.fn().mockResolvedValue(false) },
}));

import express from "express";
import request from "supertest";
import fs from "fs";
import os from "os";
import path from "path";
import browserStreaming from "../library/streaming";
import { playbackRouter } from "../subsonic/playback";
import { prisma } from "../../utils/db";
import { config } from "../../config";
import { getAudioStreamingService } from "../../services/audioStreaming";

const findTrack = prisma.track.findUnique as jest.Mock;
const findUser = prisma.user.findUnique as jest.Mock;
const findSettings = prisma.userSettings.findUnique as jest.Mock;
const getStreaming = getAudioStreamingService as jest.Mock;
const prepareFile = jest.fn();
const sendStream = jest.fn();

const app = express();
app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = { id: "ci-listener", username: "listener", role: "user" };
    next();
});
app.use("/library", browserStreaming);
app.use("/rest", playbackRouter);

let fixture = "";
let musicRoot = "";
let allowed = "";
function storedPath(relativePath: string) {
    findTrack.mockResolvedValue({
        id: "track-1", filePath: relativePath, fileModified: new Date(),
        missingSince: null,
    });
}
function browser() {
    return request(app).get("/library/tracks/track-1/stream?quality=original");
}
function prewarm() {
    return request(app).post("/library/tracks/track-1/prewarm?quality=high");
}
function subsonic() {
    return request(app).get("/rest/stream.view?id=track-1&format=raw&f=json");
}
function download() {
    return request(app).get("/rest/download.view?id=track-1&f=json");
}
function protocolError(result: request.Response) {
    return result.body["subsonic-response"].error.code;
}

beforeAll(() => {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), "ci-stream-realpath-"));
    musicRoot = path.join(fixture, "music");
    fs.mkdirSync(musicRoot);
    allowed = path.join(musicRoot, "real.flac");
    const outside = path.join(fixture, "outside-private.flac");
    fs.writeFileSync(allowed, "authorized music fixture");
    fs.writeFileSync(outside, "not music");
    fs.symlinkSync(outside, path.join(musicRoot, "escape.flac"));
    fs.symlinkSync(allowed, path.join(musicRoot, "internal.flac"));
    fs.symlinkSync(musicRoot, path.join(fixture, "linked-root"));
});
afterAll(() => {
    fs.rmSync(fixture, { recursive: true, force: true });
});
beforeEach(() => {
    jest.resetAllMocks();
    config.music.musicPath = musicRoot;
    findSettings.mockResolvedValue(null);
    findUser.mockResolvedValue({ role: "user", canDownloadTracks: true });
    storedPath("real.flac");
    prepareFile.mockImplementation(async (_id: string, _quality: string, _mtime: Date, sourcePath: string) => ({
        filePath: sourcePath,
        mimeType: "audio/flac",
    }));
    sendStream.mockImplementation(async (_req: express.Request, res: express.Response) => {
        res.status(200).type("audio/flac").send(Buffer.from("authorized music fixture"));
    });
    getStreaming.mockReturnValue({
        getStreamFilePath: prepareFile,
        streamFileWithRangeSupport: sendStream,
    });
});

describe("canonical physical music stream containment", () => {
    it("allows legitimate browser playback and passes a canonical file to the streamer", async () => {
        expect((await browser()).status).toBe(200);
        expect(prepareFile.mock.calls[0][3]).toBe(await fs.promises.realpath(allowed));
        expect(sendStream).toHaveBeenCalledTimes(1);
    });

    it("rejects browser playback through a symlink to outside the music root", async () => {
        storedPath("escape.flac");
        const result = await browser();
        expect(result.status).toBe(404);
        expect(result.body.error).toBe("Track not available");
        expect(getStreaming).not.toHaveBeenCalled();
    });

    it("rejects traversal and missing browser tracks before opening audio", async () => {
        for (const filePath of ["../outside-private.flac", "missing.flac"]) {
            storedPath(filePath);
            expect((await browser()).status).toBe(404);
            expect(getStreaming).not.toHaveBeenCalled();
        }
    });

    it("never prewarms a symlink outside the music root", async () => {
        storedPath("escape.flac");
        const result = await prewarm();
        expect(result.status).toBe(202);
        expect(getStreaming).not.toHaveBeenCalled();
    });

    it("blocks a Subsonic stream on an escaped symlink using protocol 70", async () => {
        storedPath("escape.flac");
        const result = await subsonic();
        expect(result.status).toBe(200);
        expect(protocolError(result)).toBe(70);
        expect(getStreaming).not.toHaveBeenCalled();
    });

    it("blocks an otherwise allowed Subsonic download on an escaped symlink", async () => {
        storedPath("escape.flac");
        const result = await download();
        expect(result.status).toBe(200);
        expect(protocolError(result)).toBe(70);
        expect(findUser).toHaveBeenCalledTimes(1);
        expect(getStreaming).not.toHaveBeenCalled();
    });

    it("allows a legitimate Subsonic listener and a user with download permission", async () => {
        expect((await subsonic()).status).toBe(200);
        expect((await download()).status).toBe(200);
        expect(prepareFile).toHaveBeenCalledTimes(2);
        expect(prepareFile.mock.calls.every((call: unknown[]) => call[3] === allowed)).toBe(true);
    });

    it("accepts a symlinked music-root mount while still rejecting an escaped file", async () => {
        config.music.musicPath = path.join(fixture, "linked-root");
        storedPath("internal.flac");
        expect((await browser()).status).toBe(200);
        expect(prepareFile.mock.calls[0][3]).toBe(await fs.promises.realpath(allowed));
        getStreaming.mockClear();
        storedPath("escape.flac");
        expect((await browser()).status).toBe(404);
        expect(getStreaming).not.toHaveBeenCalled();
    });
});
