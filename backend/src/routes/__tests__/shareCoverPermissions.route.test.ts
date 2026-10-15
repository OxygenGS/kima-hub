/**
 * Public share tokens authorize only the cover(s) attached to that share.
 * A token must not become a lookup key for unrelated images in the covers cache.
 */
jest.mock("../../utils/db", () => ({
    prisma: {
        shareLink: { findUnique: jest.fn() },
        track: { findUnique: jest.fn() },
        album: { findUnique: jest.fn() },
        playlistItem: { findFirst: jest.fn() },
    },
}));
jest.mock("../../utils/logger", () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../services/imageStorage", () => ({
    getLocalImagePath: jest.fn(),
    getResizedImagePath: jest.fn(),
}));
jest.mock("../../services/audioStreaming", () => ({
    getAudioStreamingService: jest.fn(),
}));
jest.mock("../../config", () => ({
    config: { music: { musicPath: "/music", transcodeCachePath: "/tmp/transcode", transcodeCacheMaxGb: 10 } },
}));

import express from "express";
import request from "supertest";
import fs from "fs";
import os from "os";
import path from "path";
import shareRouter from "../share";
import { prisma } from "../../utils/db";
import { getLocalImagePath, getResizedImagePath } from "../../services/imageStorage";

const findLink = prisma.shareLink.findUnique as jest.Mock;
const findTrack = prisma.track.findUnique as jest.Mock;
const findAlbum = prisma.album.findUnique as jest.Mock;
const findPlaylistItem = prisma.playlistItem.findFirst as jest.Mock;
const locateCover = getLocalImagePath as jest.Mock;
const resizedCover = getResizedImagePath as jest.Mock;

const app = express();
app.use("/share", shareRouter);

const link = {
    id: "share-ci", token: "isolated-share-token", entityType: "track",
    entityId: "allowed-track", expiresAt: null, maxPlays: null, playCount: 0,
};
let fixtureDirectory = "";
let fixtureFile = "";

function cover(id: string) {
    return request(app).get(`/share/${link.token}/cover-art/${encodeURIComponent(id)}`);
}

beforeAll(() => {
    fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "share-cover-test-"));
    fixtureFile = path.join(fixtureDirectory, "allowed.jpg");
    fs.writeFileSync(fixtureFile, Buffer.from("isolated image fixture"));
});
afterAll(() => {
    fs.rmSync(fixtureDirectory, { recursive: true, force: true });
});
beforeEach(() => {
    jest.resetAllMocks();
    findLink.mockResolvedValue(link);
    findTrack.mockResolvedValue({ album: { coverUrl: "native:albums/allowed.jpg" } });
    findAlbum.mockResolvedValue({ coverUrl: "native:albums/allowed.jpg" });
    findPlaylistItem.mockResolvedValue({ id: "member-1" });
    locateCover.mockReturnValue(fixtureFile);
    resizedCover.mockReturnValue(null);
});

describe("shared cover art scope", () => {
    it("allows the matching cover on a shared track and forbids persistent caches", async () => {
        const response = await cover("native:albums/allowed.jpg");
        expect(response.status).toBe(200);
        expect(response.headers["cache-control"]).toBe("private, no-store");
        expect(response.headers["content-type"]).toContain("image/jpeg");
        expect(locateCover).toHaveBeenCalledWith("native:albums/allowed.jpg");
    });

    it("denies a different cover even if the token is valid and the image exists", async () => {
        const response = await cover("native:albums/private.jpg");
        expect(response.status).toBe(403);
        expect(response.body.error).toBe("Cover art not in shared content");
        expect(locateCover).not.toHaveBeenCalled();
        expect(resizedCover).not.toHaveBeenCalled();
    });

    it("does not permit a different artist image through an album-cover token", async () => {
        const response = await cover("native:artists/private-artist.jpg");
        expect(response.status).toBe(403);
        expect(locateCover).not.toHaveBeenCalled();
    });

    it("denies album-share artwork outside the shared album", async () => {
        findLink.mockResolvedValue({ ...link, entityType: "album", entityId: "album-1" });
        expect((await cover("native:albums/private.jpg")).status).toBe(403);
        expect(findAlbum).toHaveBeenCalledWith({
            where: { id: "album-1" },
            select: { coverUrl: true },
        });
        expect(locateCover).not.toHaveBeenCalled();
    });

    it("allows the cover of the shared album", async () => {
        findLink.mockResolvedValue({ ...link, entityType: "album", entityId: "album-1" });
        expect((await cover("native:albums/allowed.jpg")).status).toBe(200);
    });

    it("requires a playlist membership tied to the requested album artwork", async () => {
        findLink.mockResolvedValue({ ...link, entityType: "playlist", entityId: "playlist-1" });
        findPlaylistItem.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "member-1" });
        expect((await cover("native:albums/private.jpg")).status).toBe(403);
        expect(locateCover).not.toHaveBeenCalled();
        expect((await cover("native:albums/allowed.jpg")).status).toBe(200);
        expect(findPlaylistItem).toHaveBeenCalledWith({
            where: {
                playlistId: "playlist-1",
                track: { album: { coverUrl: "native:albums/allowed.jpg" } },
            },
            select: { id: true },
        });
    });

    it("rejects expired and exhausted share tokens before image lookups", async () => {
        findLink.mockResolvedValueOnce({ ...link, expiresAt: new Date(Date.now() - 30_000) })
            .mockResolvedValueOnce({ ...link, maxPlays: 1, playCount: 1 });
        expect((await cover("native:albums/allowed.jpg")).status).toBe(410);
        expect((await cover("native:albums/allowed.jpg")).status).toBe(410);
        expect(findTrack).not.toHaveBeenCalled();
        expect(locateCover).not.toHaveBeenCalled();
    });

    it("does not double-decode escaped path characters", async () => {
        findTrack.mockResolvedValue({ album: { coverUrl: "native:albums/cover%20.jpg" } });
        const response = await cover("native:albums/cover%20.jpg");
        expect(response.status).toBe(200);
        expect(locateCover).toHaveBeenCalledWith("native:albums/cover%20.jpg");
    });
});
