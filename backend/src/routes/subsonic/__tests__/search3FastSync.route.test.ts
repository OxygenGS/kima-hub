/** Symfonium fast-sync requires paginated empty search3 queries. */
jest.mock("../../../utils/db", () => ({
    prisma: {
        artist: { findMany: jest.fn() },
        album: { findMany: jest.fn() },
        track: { findMany: jest.fn() },
    },
}));
jest.mock("../../../services/search", () => ({
    searchService: { searchArtists: jest.fn(), searchAlbums: jest.fn(), searchTracks: jest.fn() },
}));

import express from "express";
import request from "supertest";
import { prisma } from "../../../utils/db";
import { searchRouter } from "../search";

const app = express();
app.use("/rest", searchRouter);

beforeEach(() => {
    jest.resetAllMocks();
    (prisma.artist.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.album.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.track.findMany as jest.Mock).mockResolvedValue([]);
});

describe("OpenSubsonic search3 empty-query fast synchronization", () => {
    it("returns actual paginated library artists, albums and songs", async () => {
        (prisma.artist.findMany as jest.Mock).mockResolvedValue([
            { id: "a-1", name: "Artist", displayName: null },
        ]);
        (prisma.album.findMany as jest.Mock).mockResolvedValue([
            { id: "al-1", title: "Album", displayTitle: null, year: 2025,
              artistId: "a-1", artist: { name: "Artist", displayName: null } },
        ]);
        (prisma.track.findMany as jest.Mock).mockResolvedValue([
            { id: "t-1", title: "Song", displayTitle: null, duration: 120.7, mime: "FLAC",
              fileSize: 123456, trackNo: 3, discNumber: 2,
              albumId: "al-1", album: { title: "Album", displayTitle: null, year: 2025,
                  artistId: "a-1", artist: { name: "Artist", displayName: null } } },
        ]);
        const response = await request(app).get("/rest/search3.view")
            .query({ query: "", artistCount: 1, artistOffset: 4, albumCount: 1,
                albumOffset: 8, songCount: 1, songOffset: 12, f: "json" });
        const result = response.body["subsonic-response"].searchResult3;
        expect(response.body["subsonic-response"].status).toBe("ok");
        expect(result.artist[0].id).toBe("a-1");
        expect(result.album[0].id).toBe("al-1");
        expect(result.song[0]).toEqual(expect.objectContaining({
            id: "t-1", parent: "al-1", suffix: "flac", contentType: "audio/flac",
            duration: 121, size: 123456, track: 3, discNumber: 2, year: 2025,
            isDir: false,
        }));
        expect(prisma.artist.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ take: 1, skip: 4 }),
        );
        expect(prisma.album.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ take: 1, skip: 8, where: { location: "LIBRARY" } }),
        );
        expect(prisma.track.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ take: 1, skip: 12, where: {
                album: { location: "LIBRARY" }, corrupt: false, missingSince: null,
            } }),
        );
    });

    it('treats Symfonium query="" as an empty fast-sync request', async () => {
        (prisma.track.findMany as jest.Mock).mockResolvedValue([
            { id: "song-1", title: "Track", displayTitle: null, duration: 187,
              mime: "FLAC", fileSize: 1234, trackNo: 1, discNumber: 1,
              albumId: "album-1", album: { title: "Album", displayTitle: null,
                  year: 2026, artistId: "artist-1",
                  artist: { name: "Artist", displayName: null } } },
        ]);
        const response = await request(app).get("/rest/search3.view")
            .query({ query: '""', artistCount: 0, albumCount: 0,
                songCount: 500, songOffset: 500, f: "json" });
        expect(response.body["subsonic-response"].status).toBe("ok");
        expect(response.body["subsonic-response"].searchResult3.song[0].id).toBe("song-1");
        expect(prisma.track.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ take: 500, skip: 500 }),
        );
    });

    it("returns empty lists for zero category limits without querying the database", async () => {
        const response = await request(app).get("/rest/search3.view")
            .query({ query: "", artistCount: 0, albumCount: 0, songCount: 0, f: "json" });
        expect(response.body["subsonic-response"].searchResult3).toEqual({});
        expect(prisma.artist.findMany).not.toHaveBeenCalled();
        expect(prisma.album.findMany).not.toHaveBeenCalled();
        expect(prisma.track.findMany).not.toHaveBeenCalled();
    });

    it("retains the correct response names for search and search2", async () => {
        const old = await request(app).get("/rest/search.view").query({ query: "", f: "json" });
        const v2 = await request(app).get("/rest/search2.view").query({ query: "", f: "json" });
        expect(old.body["subsonic-response"].searchResult).toEqual({});
        expect(v2.body["subsonic-response"].searchResult2).toEqual({});
    });
});
