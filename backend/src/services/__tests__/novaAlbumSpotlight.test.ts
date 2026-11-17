jest.mock("../../utils/db", () => ({
    prisma: {
        album: { findMany: jest.fn() },
        artist: { findMany: jest.fn() },
        track: { findFirst: jest.fn() },
    },
}));
jest.mock("../artistSimilarity", () => ({ findSimilarArtists: jest.fn() }));
jest.mock("../musicbrainz", () => ({
    musicBrainzService: { getReleaseGroups: jest.fn() },
}));

import { prisma } from "../../utils/db";
import { musicBrainzService } from "../musicbrainz";
import { buildNovaAlbumSpotlight, normalizeNovaAlbumSuggestions } from "../novaFlowDiscovery";

const mbid = "550e8400-e29b-41d4-a716-446655440000";
const a = "550e8400-e29b-41d4-a716-446655440001";
const b = "550e8400-e29b-41d4-a716-446655440002";
const c = "550e8400-e29b-41d4-a716-446655440003";
const getReleaseGroups = musicBrainzService.getReleaseGroups as jest.Mock;
const findOwned = prisma.album.findMany as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    findOwned.mockResolvedValue([]);
    getReleaseGroups.mockResolvedValue({
        kind: "answered",
        value: [
            { id: a, title: "First", "primary-type": "Album", "first-release-date": "2019-01-01" },
            { id: b, title: "Second", "primary-type": "EP", "first-release-date": "2022" },
            { id: c, title: "Third", "primary-type": "Album" },
        ],
    });
});

describe("NOVA Album Spotlight source evidence", () => {
    it("keeps only grounded studio Album/EP groups, and deduplicates IDs", () => {
        const rows = normalizeNovaAlbumSuggestions([
            { id: a, title: "  First  ", "primary-type": "Album", "first-release-date": "2021-05" },
            { id: a, title: "Duplicate", "primary-type": "Album" },
            { id: b, title: "Concert", "primary-type": "Album", "secondary-types": ["Live"] },
            { id: b, title: "Mix", "primary-type": "EP", "secondary-types": ["Compilation"] },
            { id: c, title: "Song", "primary-type": "Single" },
            { id: c, title: "Studio EP", "primary-type": "EP", "first-release-date": "unknown" },
            { id: "invalid", title: "Not a MBID", "primary-type": "Album" },
            { id: mbid, title: " ", "primary-type": "Album" },
        ]);
        expect(rows).toEqual([
            { id: a, title: "First", type: "Album", year: 2021 },
            { id: c, title: "Studio EP", type: "EP", year: null },
        ]);
    });

    it("fetches only after being invoked, filters truly owned albums and bounds output", async () => {
        findOwned.mockResolvedValueOnce([{ rgMbid: a }]);
        const res = await buildNovaAlbumSpotlight(mbid, 2);
        expect(getReleaseGroups).toHaveBeenCalledWith(mbid, ["album", "ep"], 50, { interactive: true });
        expect(findOwned).toHaveBeenCalledWith({
            where: {
                rgMbid: { in: [a, b, c] },
                location: "LIBRARY",
                tracks: { some: { missingSince: null, corrupt: false } },
            },
            select: { rgMbid: true },
        });
        expect(res).toEqual({
            artistMbid: mbid,
            albums: [
                { id: b, title: "Second", type: "EP", year: 2022 },
                { id: c, title: "Third", type: "Album", year: null },
            ],
            sourceFailed: false, readOnly: true,
        });
    });

    it("never invents records if MusicBrainz has no data or fails", async () => {
        getReleaseGroups.mockResolvedValueOnce({ kind: "absent" });
        expect(await buildNovaAlbumSpotlight(mbid)).toMatchObject({ albums: [], sourceFailed: false });
        getReleaseGroups.mockResolvedValueOnce({ kind: "failed" });
        expect(await buildNovaAlbumSpotlight(mbid)).toMatchObject({ albums: [], sourceFailed: true });
        expect(findOwned).not.toHaveBeenCalled();
    });

    it("rejects malformed identifiers without contacting providers", async () => {
        expect(await buildNovaAlbumSpotlight("not-an-id")).toMatchObject({ albums: [] });
        expect(getReleaseGroups).not.toHaveBeenCalled();
        expect(findOwned).not.toHaveBeenCalled();
    });

    it("limits the list even when a caller requests more", async () => {
        const res = await buildNovaAlbumSpotlight(mbid, 500);
        expect(res.albums).toHaveLength(3);
        expect(res.readOnly).toBe(true);
    });
});
