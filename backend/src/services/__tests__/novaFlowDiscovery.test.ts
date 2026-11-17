jest.mock("../../utils/db", () => ({
    prisma: {
        track: { findFirst: jest.fn() },
        artist: { findMany: jest.fn() },
    },
}));
jest.mock("../artistSimilarity", () => ({
    findSimilarArtists: jest.fn(),
}));

import { prisma } from "../../utils/db";
import { findSimilarArtists } from "../artistSimilarity";
import { buildNovaDiscovery, distinctDiscoveryArtists } from "../novaFlowDiscovery";

const mbid = "550e8400-e29b-41d4-a716-446655440000";
const secondMbid = "550e8400-e29b-41d4-a716-446655440001";

const db = prisma as unknown as {
    track: { findFirst: jest.Mock };
    artist: { findMany: jest.Mock };
};
const similar = findSimilarArtists as jest.Mock;

beforeEach(() => {
    jest.clearAllMocks();
    db.track.findFirst.mockResolvedValue({
        album: { artist: { name: "Seed Artist", mbid } },
    });
    db.artist.findMany.mockResolvedValue([]);
    similar.mockResolvedValue({
        failed: false,
        artists: [
            { name: "Seed Artist", mbid, match: 0.99, inLibrary: true },
            { name: "Owned Artist", mbid: secondMbid, match: 0.94, inLibrary: true },
            { name: "New Artist", mbid: undefined, match: 0.90, inLibrary: false },
        ],
    });
});

describe("NOVA Discovery Radar", () => {
    it("requires an actually playable local seed, not an external or missing track", async () => {
        db.track.findFirst.mockResolvedValueOnce(null);
        const response = await buildNovaDiscovery("missing", 8);
        expect(response).toEqual({
            unavailableSeed: true, seedArtist: null, artists: [], sourceFailed: false,
        });
        expect(db.track.findFirst).toHaveBeenCalledWith({
            where: expect.objectContaining({
                id: "missing", missingSince: null, corrupt: false,
                album: expect.objectContaining({ location: "LIBRARY" }),
            }),
            select: { album: { select: { artist: { select: { name: true, mbid: true } } } } },
        });
        expect(similar).not.toHaveBeenCalled();
    });

    it("checks real playable album+track relations before calling an artist missing", async () => {
        db.artist.findMany.mockResolvedValue([
            { mbid: secondMbid, identityKey: "ownedartist" },
        ]);
        const response = await buildNovaDiscovery("local-seed", 8);
        expect(response).toEqual({
            unavailableSeed: false,
            seedArtist: "Seed Artist",
            sourceFailed: false,
            artists: [{ name: "New Artist", mbid: null, match: 0.9 }],
        });
        expect(db.artist.findMany).toHaveBeenCalledWith({
            where: {
                OR: [
                    { mbid: { in: [secondMbid] } },
                    { identityKey: { in: ["ownedartist", "newartist"] } },
                ],
                albums: {
                    some: {
                        location: "LIBRARY",
                        tracks: { some: { missingSince: null, corrupt: false } },
                    },
                },
            },
            select: { mbid: true, identityKey: true },
        });
        expect(similar).toHaveBeenCalledWith(mbid, "Seed Artist", 32, { interactive: true });
    });

    it("does not trust inLibrary flags without playable track proof", async () => {
        similar.mockResolvedValueOnce({
            failed: false,
            artists: [{ name: "Placeholder Only", mbid: undefined, match: 0.82, inLibrary: true }],
        });
        const response = await buildNovaDiscovery("seed", 5);
        expect(response.artists.map(x => x.name)).toEqual(["Placeholder Only"]);
    });

    it("marks source outages without inventing external suggestions", async () => {
        similar.mockResolvedValueOnce({ failed: true, artists: [] });
        const response = await buildNovaDiscovery("seed", 8);
        expect(response.artists).toEqual([]);
        expect(response.sourceFailed).toBe(true);
        expect(db.artist.findMany).not.toHaveBeenCalled();
    });

    it("bounds, normalizes and deduplicates source results, skipping invalid matches", () => {
        const results = distinctDiscoveryArtists([
            { name: "Seed Artist", mbid, match: 1 },
            { name: "  Muse ", mbid: secondMbid, match: 1.5 },
            { name: "muse", mbid: undefined, match: 0.8 },
            { name: "Unrated", mbid: undefined, match: Number.NaN },
            { name: "Another Artist", mbid: undefined, match: -0.2 },
            { name: "X".repeat(181), mbid: undefined, match: 0.5 },
        ], "seed artist");
        expect(results).toEqual([
            { name: "Muse", mbid: secondMbid, match: 1 },
            { name: "Another Artist", mbid: null, match: 0 },
        ]);
    });

    it("returns at most the requested number of verified artist results", async () => {
        similar.mockResolvedValueOnce({
            failed: false,
            artists: ["One", "Two", "Three", "Four"].map(name =>
                ({ name, mbid: undefined, match: 0.8 })),
        });
        const response = await buildNovaDiscovery("seed", 2);
        expect(response.artists).toHaveLength(2);
        expect(response.artists.map(x => x.name)).toEqual(["One", "Two"]);
    });
});
