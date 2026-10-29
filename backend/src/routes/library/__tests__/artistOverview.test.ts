import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../../../utils/db";
import router from "../artistOverview";

jest.mock("../../../utils/db", () => ({ prisma: { artist: { findFirst: jest.fn() } }, Prisma: { SortOrder: { asc: "asc" } } }));
jest.mock("../../../utils/logger", () => ({ logger: { error: jest.fn() } }));
jest.mock("../../../services/artistIdentity", () => ({ isMbid: (id: string | null) => id === "valid-mbid" }));
jest.mock("../../../utils/metadataOverrides", () => ({
    getArtistDisplaySummary: (artist: { userSummary?: string; summary: string }) => artist.userSummary || artist.summary,
    getMergedGenres: (artist: { genres: string[] }) => artist.genres,
}));

const app = express();
app.use(router);
const find = prisma.artist.findFirst as jest.Mock;
const track = { id: "track", title: "Track", duration: 60, trackNo: 1 };
const fixture = () => ({
    id: "artist", name: "Artist", mbid: "valid-mbid", heroUrl: "stored-image",
    userHeroUrl: "override-image", summary: "Biography", userSummary: "Edited biography", genres: ["Rock"],
    albums: [
        { id: "old", title: "Old album", year: 2000, coverUrl: "old-cover", userCoverUrl: null, tracks: [track] },
        { id: "new", title: "New album", year: 2026, coverUrl: "cover", userCoverUrl: "custom-cover", tracks: [track] },
    ],
});
beforeEach(() => jest.clearAllMocks());

describe("database-only artist overview", () => {
    it("returns playable albums and saved overrides without external enrichment", async () => {
        find.mockResolvedValue(fixture());
        const response = await request(app).get("/artists/artist/overview");
        expect(response.status).toBe(200);
        expect(response.body.coverArt).toBe("override-image");
        expect(response.body.bio).toBe("Edited biography");
        expect(response.body.albums.map((album: { id: string }) => album.id)).toEqual(["new", "old"]);
        expect(response.body.albums[0]).toMatchObject({ owned: true, source: "database", coverArt: "custom-cover" });
        expect(response.body.albums[0].tracks[0]).toMatchObject({ id: "track", album: { id: "new", coverArt: "custom-cover" } });
        expect(response.body.topTracks).toEqual([]);
        expect(response.body.similarArtists).toEqual([]);
        expect(find).toHaveBeenCalledTimes(1);
        const selection = find.mock.calls[0][0].include.albums.include.tracks.select;
        expect(selection.filePath).toBeUndefined();
        expect(selection.id).toBe(true);
    });
    it("supports the same ID, name and MBID lookup without changing identity", async () => {
        find.mockResolvedValue(fixture());
        await request(app).get("/artists/Some%20Artist/overview");
        expect(find.mock.calls[0][0].where.OR).toEqual([
            { id: "Some Artist" }, { name: { equals: "Some Artist", mode: "insensitive" } }, { mbid: "Some Artist" },
        ]);
    });
    it("preserves not-found and database failure responses", async () => {
        find.mockResolvedValue(null);
        expect((await request(app).get("/artists/missing/overview")).status).toBe(404);
        find.mockRejectedValue(new Error("Database unavailable"));
        expect((await request(app).get("/artists/artist/overview")).status).toBe(500);
    });
    it("has no provider dependency and remains behind the existing auth and limiter", () => {
        const index = readFileSync(resolve(__dirname, "../index.ts"), "utf8");
        expect(index.indexOf("router.use(requireAuthOrToken)")).toBeLessThan(index.indexOf("router.use(artistOverviewRouter)"));
        expect(index.indexOf("return apiLimiter(req, res, next)")).toBeLessThan(index.indexOf("router.use(artistOverviewRouter)"));
        const route = readFileSync(resolve(__dirname, "../artistOverview.ts"), "utf8");
        expect(route).not.toMatch(/from ["'][^"']*(?:redis|musicbrainz|listenBrainz|deezer|artwork|dataCache)["']/);
    });
});
