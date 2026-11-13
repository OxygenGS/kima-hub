/**
 * The similar-artists strip on GET /artists/:id gets images through
 * `artwork.ts` on both its paths, and an artist already in the library keeps the
 * library's picture. Failure and boundary paths first.
 */

jest.mock("p-limit", () => () => (fn: (...args: any[]) => any) => fn());

jest.mock("../../../middleware/auth", () => ({
    requireAdmin: (req: any, _res: any, next: any) => {
        req.user = { id: "admin", role: "admin" };
        next();
    },
    requireAuthOrToken: (req: any, _res: any, next: any) => {
        req.user = { id: "user-1" };
        next();
    },
}));

// The handler reads req.user directly; this router does not mount the auth
// middleware itself, so the app has to put a user on the request.
const authenticate = (req: any, _res: any, next: any) => {
    req.user = { id: "user-1", role: "admin" };
    next();
};

const mockArtistFindUnique = jest.fn();
const mockArtistFindMany = jest.fn();
const mockLocalPlays = jest.fn();

jest.mock("../../../utils/db", () => {
    const prisma = {
        artist: {
            // The route accepts an id, a name or an MBID, so it is findFirst.
            findFirst: (...a: any[]) => mockArtistFindUnique(...a),
            findUnique: (...a: any[]) => mockArtistFindUnique(...a),
            findMany: (...a: any[]) => mockArtistFindMany(...a),
            count: jest.fn().mockResolvedValue(0),
        },
        album: { findMany: jest.fn().mockResolvedValue([]) },
        track: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
        // The handler counts this user's plays across the artist's tracks
        // before it ever gets to the similar-artists strip.
        play: { groupBy: jest.fn().mockResolvedValue([]) },
        $queryRaw: (...args: any[]) => mockLocalPlays(...args),
        $transaction: (fn: any) => fn(prisma),
    };
    return {
        prisma,
        Prisma: {
            SortOrder: { asc: "asc", desc: "desc" },
            sql: (strings: TemplateStringsArray, ...vals: any[]) => ({ strings, vals }),
            empty: { strings: [""], vals: [] },
            join: (parts: any[]) => ({ parts }),
        },
    };
});

jest.mock("../../../utils/logger", () => ({
    logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock("../../../utils/redis", () => ({
    redisClient: {
        get: jest.fn().mockResolvedValue(null),
        setex: jest.fn().mockResolvedValue("OK"),
        del: jest.fn().mockResolvedValue(1),
    },
}));

const mockGetSimilarArtists = jest.fn();
// Similar artists come from the local-centroid / ListenBrainz engine.
jest.mock("../../../services/artistSimilarity", () => ({
    getSimilarArtists: (...a: any[]) => mockGetSimilarArtists(...a),
    enrichSimilarArtists: jest.fn().mockResolvedValue([]),
}));

// The artist page also requests global popularity before resolving similar artwork.
// Keep this test offline: provider latency would otherwise consume Jest's 5-second
// limit and make unrelated artwork assertions depend on internet availability.
const mockGlobalTopRecordings = jest.fn();
jest.mock("../../../services/listenBrainz", () => ({
    listenBrainzService: {
        getTopRecordingsForArtist: (...args: any[]) => mockGlobalTopRecordings(...args),
    },
}));
const mockDeezerTopTracks = jest.fn();
jest.mock("../../../services/deezer", () => ({
    deezerService: {
        getArtistTopTracks: (...args: any[]) => mockDeezerTopTracks(...args),
    },
}));

const mockGetReleaseGroups = jest.fn();
jest.mock("../../../services/musicbrainz", () => ({
    musicBrainzService: {
        getArtist: jest.fn().mockResolvedValue(null),
        searchArtist: jest.fn().mockResolvedValue([]),
        getReleaseGroups: (...args: any[]) => mockGetReleaseGroups(...args),
    },
}));

const mockGetArtistImage = jest.fn();
jest.mock("../../../services/dataCache", () => ({
    dataCacheService: {
        getArtistImage: (...args: unknown[]) => mockGetArtistImage(...args),
        getAlbumCover: jest.fn().mockResolvedValue(null),
        getArtistImagesBatch: jest.fn().mockResolvedValue(new Map()),
    },
}));

const mockFindArtistArtwork = jest.fn();
jest.mock("../../../services/artwork", () => ({
    findArtistArtwork: (...a: any[]) => mockFindArtistArtwork(...a),
}));

import express from "express";
import request from "supertest";
import libraryArtistRoutes from "../artists";

function makeApp() {
    const app = express();
    app.use(express.json());
    app.use(authenticate);
    app.use("/library", libraryArtistRoutes);
    return app;
}

const FOUND = "https://assets.fanart.tv/fanart/music/x/artistthumb/a.jpg";
const LOCAL = "native:artists/known-1.jpg";

/** The artist whose page is being rendered. */
const subject = (similarArtistsJson: unknown) => ({
    id: "art-1",
    name: "Perturbator",
    mbid: "11111111-2222-3333-4444-555555555555",
    normalizedName: "perturbator",
    heroUrl: null,
    bio: null,
    genres: [],
    similarArtistsJson,
    enrichmentStatus: "enriched",
    albums: [],
    // The handler reads these straight off the row; without them it throws
    // before it ever reaches the similar-artists strip.
    ownedAlbums: [],
    _count: { albums: 0 },
});

async function similarFrom(res: any): Promise<any[]> {
    return res.body.similarArtists || [];
}

describe("the similar-artists strip and where its pictures come from", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFindArtistArtwork.mockResolvedValue(null);
        mockGetArtistImage.mockReset().mockResolvedValue(null);
        mockArtistFindMany.mockResolvedValue([]);
        mockGetSimilarArtists.mockResolvedValue([]);
        mockGlobalTopRecordings.mockResolvedValue([]);
        mockDeezerTopTracks.mockResolvedValue([]);
        mockLocalPlays.mockReset().mockResolvedValue([]);
        mockGetReleaseGroups.mockReset().mockResolvedValue({ kind: "absent" });
    });

    it("keeps album and top-track playback contracts without per-track album joins", async () => {
        const track = {
            id: "owned-track", albumId: "owned-album", title: "My Song",
            duration: 215, trackNo: 1, discNumber: 1, recordingMbid: null,
        };
        mockArtistFindUnique.mockResolvedValue({
            ...subject(null),
            mbid: null,
            albums: [{
                id: "owned-album", title: "My Album", coverUrl: "native:albums/owned.jpg",
                year: 2024, rgMbid: "local-release", tracks: [track],
            }],
        });
        mockDeezerTopTracks.mockResolvedValue([{
            title: "My Song", album: "My Album", durationMs: 215000, rank: 1200,
            coverUrl: "https://deezer.example/art.jpg",
        }]);

        const res = await request(makeApp()).get("/library/artists/art-1");
        expect(res.status).toBe(200);
        const tracksQuery = mockArtistFindUnique.mock.calls[0][0].include.albums.include.tracks;
        // Albums are already loaded by the parent include; never rejoin them per track.
        expect(tracksQuery.orderBy).toEqual({ trackNo: "asc" });
        expect(tracksQuery.include).toBeUndefined();

        const albumDetails = {
            id: "owned-album", title: "My Album",
            coverUrl: "native:albums/owned.jpg", coverArt: "native:albums/owned.jpg",
        };
        expect(res.body.albums[0].tracks[0].album).toEqual(albumDetails);
        expect(res.body.albums[0].tracks[0].audioFeatures).toHaveProperty("bpm", null);
        expect(res.body.topTracks[0]).toMatchObject({
            id: "owned-track", popularitySource: "global", album: { ...albumDetails, coverArt: albumDetails.coverUrl },
        });
    });

    it("keeps user-selected album artwork across overview, full details and globally popular tracks", async () => {
        const manualCover = "native:albums/manual.jpg";
        const defaultCover = "native:albums/default.jpg";
        mockArtistFindUnique.mockResolvedValue({
            ...subject(null),
            mbid: null,
            albums: [{
                id: "favorite", title: "Favorite", year: 2026, rgMbid: "local-rg",
                coverUrl: defaultCover, userCoverUrl: manualCover,
                tracks: [{ id: "favorite-track", albumId: "favorite", title: "Song", duration: 200, trackNo: 1 }],
            }],
        });
        mockDeezerTopTracks.mockResolvedValue([{
            title: "Song", album: "Favorite", durationMs: 200000,
            rank: 120, coverUrl: "https://deezer.example/default.jpg",
        }]);

        const res = await request(makeApp()).get("/library/artists/art-1");
        expect(res.status).toBe(200);
        expect(res.body.albums[0]).toMatchObject({
            id: "favorite", coverUrl: defaultCover, userCoverUrl: manualCover,
            coverArt: manualCover,
            tracks: [{ album: { id: "favorite", coverUrl: manualCover, coverArt: manualCover } }],
        });
        expect(res.body.topTracks[0]).toMatchObject({
            id: "favorite-track", album: { id: "favorite", coverUrl: manualCover, coverArt: manualCover },
        });
    });

    it("uses the manual cover in locally-played popular tracks, not the automatic SQL cover", async () => {
        mockArtistFindUnique.mockResolvedValue({
            ...subject(null),
            mbid: null,
            albums: [{
                id: "favorite", title: "Favorite", coverUrl: "native:albums/automatic.jpg",
                userCoverUrl: "native:albums/manual.jpg",
                tracks: [{ id: "played-track", albumId: "favorite", title: "Song", duration: 200, trackNo: 1 }],
            }],
        });
        mockLocalPlays.mockResolvedValue([{
            id: "played-track", title: "Song", duration: 200,
            albumId: "favorite", albumTitle: "Favorite",
            albumCoverUrl: "native:albums/automatic.jpg",
            artistId: "art-1", artistName: "Perturbator", playCount: 5n,
        }]);

        const res = await request(makeApp()).get("/library/artists/art-1");
        expect(res.status).toBe(200);
        expect(res.body.topTracks[0]).toMatchObject({
            id: "played-track", playCount: 5, userPlayCount: 5,
            album: {
                id: "favorite", coverUrl: "native:albums/manual.jpg",
                coverArt: "native:albums/manual.jpg",
            },
        });
    });

    it("reuses parent album data for the fallback popular tracks on a cold library", async () => {
        mockArtistFindUnique.mockResolvedValue({
            ...subject(null),
            mbid: null,
            albums: [{
                id: "old-album", title: "Early Work", year: 1997, rgMbid: "local-release",
                coverUrl: "native:albums/early.jpg",
                tracks: [{ id: "early-track", albumId: "old-album", title: "Early", duration: 160, trackNo: 1 }],
            }],
        });
        const res = await request(makeApp()).get("/library/artists/art-1");
        expect(res.status).toBe(200);
        expect(res.body.topTracks).toHaveLength(1);
        expect(res.body.topTracks[0]).toMatchObject({
            id: "early-track", releaseDate: "1997-01-01",
            album: { id: "old-album", title: "Early Work", coverArt: "native:albums/early.jpg" },
        });
    });

    it("requests independent enrichments while a MusicBrainz discography is still pending", async () => {
        mockArtistFindUnique.mockResolvedValue(subject(null));

        // Hold the discography open to detect accidental serial waterfalls.
        let finishDiscography!: (result: { kind: "absent" }) => void;
        mockGetReleaseGroups.mockReturnValue(new Promise((resolve) => {
            finishDiscography = resolve;
        }));

        const responsePromise = request(makeApp()).get("/library/artists/art-1").then((response) => response);
        try {
            for (let n = 0; n < 30 && mockGetReleaseGroups.mock.calls.length === 0; n++) {
                await new Promise<void>((resolve) => setImmediate(resolve));
            }

            expect(mockGetReleaseGroups).toHaveBeenCalled();
            // Neither top-track provider nor similar artists should wait
            // for the slower release-group request to resolve.
            expect(mockGlobalTopRecordings).toHaveBeenCalled();
            expect(mockGetSimilarArtists).toHaveBeenCalled();
        } finally {
            finishDiscography({ kind: "absent" });
        }

        const response = await responsePromise;
        expect(response.status).toBe(200);
        expect(response.body.albums).toEqual([]);
    });

    describe("reuse existing artist images without extra database or provider requests", () => {
        it("serves a manually selected hero from the already loaded artist", async () => {
            mockArtistFindUnique.mockResolvedValue({
                ...subject(null),
                heroUrl: "native:artists/automatic.jpg",
                userHeroUrl: "native:artists/manual.jpg",
            });

            const res = await request(makeApp()).get("/library/artists/art-1");
            expect(res.status).toBe(200);
            expect(res.body.coverArt).toBe("native:artists/manual.jpg");
            expect(mockGetArtistImage).not.toHaveBeenCalled();
        });

        it("uses the existing fallback lookup only for artists with no saved photo", async () => {
            mockArtistFindUnique.mockResolvedValue(subject(null));
            mockGetArtistImage.mockResolvedValue(FOUND);

            const res = await request(makeApp()).get("/library/artists/art-1");
            expect(res.status).toBe(200);
            expect(res.body.coverArt).toBe(FOUND);
            expect(mockGetArtistImage).toHaveBeenCalledTimes(1);
            expect(mockGetArtistImage).toHaveBeenCalledWith(
                "art-1", "Perturbator", "11111111-2222-3333-4444-555555555555",
            );
        });

        it("recognizes accented and ampersand names locally and prefers manual portraits", async () => {
            mockArtistFindUnique.mockResolvedValue(subject([
                { name: "Sigur Rós", mbid: null, match: 0.91 },
                { name: "Hall & Oates", mbid: null, match: 0.89 },
            ]));
            mockArtistFindMany.mockResolvedValue([
                {
                    id: "local-sigur", name: "Sigur Rós", normalizedName: "sigur ros",
                    mbid: null, heroUrl: "native:artists/sigur.jpg",
                    userHeroUrl: null, _count: { albums: 2 },
                },
                {
                    id: "local-hall", name: "Hall & Oates", normalizedName: "hall and oates",
                    mbid: null, heroUrl: "native:artists/hall-auto.jpg",
                    userHeroUrl: "native:artists/hall-custom.jpg",
                    _count: { albums: 3 },
                },
            ]);

            const res = await request(makeApp()).get("/library/artists/art-1");
            expect(res.status).toBe(200);
            expect(res.body.similarArtists).toMatchObject([
                {
                    id: "local-sigur", inLibrary: true, ownedAlbumCount: 2,
                    coverArt: "native:artists/sigur.jpg",
                },
                {
                    id: "local-hall", inLibrary: true, ownedAlbumCount: 3,
                    coverArt: "native:artists/hall-custom.jpg",
                },
            ]);
            expect(mockArtistFindMany.mock.calls[0][0].select.userHeroUrl).toBe(true);
            expect(mockFindArtistArtwork).not.toHaveBeenCalled();
        });
    });

    describe("built from the artist's own enriched data", () => {
        const enriched = [{ name: "Carpenter Brut", mbid: "sim-1", match: 0.9 }];

        it("leaves the picture empty when no source had one", async () => {
            mockArtistFindUnique.mockResolvedValue(subject(enriched));

            const res = await request(makeApp()).get("/library/artists/art-1");

            expect(res.status).toBe(200);
            const [first] = await similarFrom(res);
            expect(first?.coverArt ?? null).toBeNull();
        });

        it("asks the one door, by name and by id, rather than Deezer alone", async () => {
            mockArtistFindUnique.mockResolvedValue(subject(enriched));
            mockFindArtistArtwork.mockResolvedValue({ url: FOUND, source: "fanart" });

            const res = await request(makeApp()).get("/library/artists/art-1");

            expect(mockFindArtistArtwork).toHaveBeenCalledWith({
                name: "Carpenter Brut",
                mbid: "sim-1",
            });
            const [first] = await similarFrom(res);
            expect(first?.coverArt).toBe(FOUND);
        });

        it("keeps the library's own picture instead of going out for one", async () => {
            // Already downloaded, already chosen. Replacing it would be slower
            // and worse.
            mockArtistFindUnique.mockResolvedValue(subject(enriched));
            mockArtistFindMany.mockResolvedValue([
                {
                    id: "known-1",
                    name: "Carpenter Brut",
                    normalizedName: "carpenter brut",
                    mbid: "sim-1",
                    heroUrl: LOCAL,
                    _count: { albums: 3 },
                },
            ]);

            const res = await request(makeApp()).get("/library/artists/art-1");

            const [first] = await similarFrom(res);
            expect(first?.coverArt).toBe(LOCAL);
            expect(mockFindArtistArtwork).not.toHaveBeenCalled();
        });
    });

    describe("built from a live Last.fm lookup", () => {
        it("asks the one door here too", async () => {
            mockArtistFindUnique.mockResolvedValue(subject(null));
            mockGetSimilarArtists.mockResolvedValue([
                { name: "Carpenter Brut", mbid: "sim-1", match: 0.9 },
            ]);
            mockFindArtistArtwork.mockResolvedValue({ url: FOUND, source: "deezer" });

            const res = await request(makeApp()).get("/library/artists/art-1");

            expect(res.status).toBe(200);
            expect(mockFindArtistArtwork).toHaveBeenCalledWith({
                name: "Carpenter Brut",
                mbid: "sim-1",
            });
        });
    });
});
