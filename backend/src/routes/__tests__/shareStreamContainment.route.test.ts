/**
 * Anonymous shared streams must not escape the music root through symlinks
 * even when a valid token authorizes the requested Track.
 */
const mockStream = jest.fn();

jest.mock("../../utils/db", () => ({
    prisma: {
        shareLink: { findUnique: jest.fn(), update: jest.fn() },
        track: { findUnique: jest.fn() },
    },
}));
jest.mock("../../utils/logger", () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../services/imageStorage", () => ({
    getLocalImagePath: jest.fn(),
    getResizedImagePath: jest.fn(),
}));
jest.mock("../../services/audioStreaming", () => ({
    getAudioStreamingService: () => ({
        streamFileWithRangeSupport: (...args: unknown[]) => mockStream(...args),
    }),
}));
jest.mock("../../config", () => ({
    config: {
        music: { musicPath: "/tmp/placeholder", transcodeCachePath: "/tmp/transcode", transcodeCacheMaxGb: 10 },
    },
}));

import express from "express";
import request from "supertest";
import fs from "fs";
import os from "os";
import path from "path";
import shareRouter from "../share";
import { prisma } from "../../utils/db";
import { config } from "../../config";

const app = express();
app.use("/share", shareRouter);
const findShare = prisma.shareLink.findUnique as jest.Mock;
const findTrack = prisma.track.findUnique as jest.Mock;
const countPlay = prisma.shareLink.update as jest.Mock;
const share = {
    id: "symlink-test-token-id", token: "symlink-test-token",
    entityType: "track", entityId: "allowed-track",
    expiresAt: null, maxPlays: null, playCount: 0,
};
let fixture = "";
let musicRoot = "";
let allowedFile = "";
let outsideFile = "";

beforeAll(() => {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), "share-audio-ci-"));
    musicRoot = path.join(fixture, "music");
    fs.mkdirSync(musicRoot);
    allowedFile = path.join(musicRoot, "allowed.flac");
    outsideFile = path.join(fixture, "outside.flac");
    fs.writeFileSync(allowedFile, "safe audio fixture");
    fs.writeFileSync(outsideFile, "private file fixture");
    fs.symlinkSync(outsideFile, path.join(musicRoot, "escaped.flac"));
    fs.symlinkSync(musicRoot, path.join(fixture, "linked-root"));
});
afterAll(() => {
    fs.rmSync(fixture, { recursive: true, force: true });
});
beforeEach(() => {
    jest.resetAllMocks();
    (config.music as { musicPath: string }).musicPath = musicRoot;
    findShare.mockResolvedValue(share);
    findTrack.mockResolvedValue({ filePath: "allowed.flac" });
    countPlay.mockResolvedValue({});
    mockStream.mockImplementation(async (_req: unknown, res: express.Response) => {
        res.status(200).send("test audio");
    });
});

function stream() {
    return request(app).get("/share/symlink-test-token/stream/allowed-track");
}

describe("public shared audio canonical-path containment", () => {
    it("streams a real file physically inside the configured music root", async () => {
        const response = await stream();
        expect(response.status).toBe(200);
        expect(mockStream).toHaveBeenCalledTimes(1);
        expect(mockStream.mock.calls[0][2]).toBe(await fs.promises.realpath(allowedFile));
        expect(mockStream.mock.calls[0][4]).toBe("private, no-store");
        expect(countPlay).toHaveBeenCalledTimes(1);
    });

    it("refuses an in-root symlink that resolves outside the music root", async () => {
        findTrack.mockResolvedValue({ filePath: "escaped.flac" });
        const response = await stream();
        expect(response.status).toBe(403);
        expect(response.body.error).toBe("Access denied");
        expect(mockStream).not.toHaveBeenCalled();
        expect(countPlay).not.toHaveBeenCalled();
    });

    it("refuses parent traversal in stored file paths", async () => {
        findTrack.mockResolvedValue({ filePath: "../outside.flac" });
        expect((await stream()).status).toBe(403);
        expect(mockStream).not.toHaveBeenCalled();
        expect(countPlay).not.toHaveBeenCalled();
    });

    it("refuses inaccessible or missing audio paths without counting a play", async () => {
        findTrack.mockResolvedValue({ filePath: "missing.flac" });
        expect((await stream()).status).toBe(404);
        expect(mockStream).not.toHaveBeenCalled();
        expect(countPlay).not.toHaveBeenCalled();
    });

    it("supports a configured music root which is itself a symlink", async () => {
        (config.music as { musicPath: string }).musicPath = path.join(fixture, "linked-root");
        expect((await stream()).status).toBe(200);
        expect(mockStream.mock.calls[0][2]).toBe(await fs.promises.realpath(allowedFile));
    });

    it("validates the token before opening or counting any files", async () => {
        findShare.mockResolvedValue(null);
        expect((await stream()).status).toBe(404);
        expect(findTrack).not.toHaveBeenCalled();
        expect(mockStream).not.toHaveBeenCalled();
        expect(countPlay).not.toHaveBeenCalled();
    });
});
