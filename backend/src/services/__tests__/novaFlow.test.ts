jest.mock("../../utils/db", () => ({
    prisma: {
        track: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
        },
        play: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
        },
        likedTrack: {
            findFirst: jest.fn(),
            findMany: jest.fn(),
        },
    },
}));
jest.mock("../hybridSimilarity", () => ({
    findSimilarTracks: jest.fn(),
}));

import { prisma } from "../../utils/db";
import { findSimilarTracks } from "../hybridSimilarity";
import { buildNovaFlow } from "../novaFlow";

const seed = {
    id: "seed", title: "Seed", duration: 195, energy: 0.65, arousal: 0.6,
    album: { id: "album-a", title: "Album A", coverUrl: null, artist: { id: "a", name: "Artist A" } },
};
const next = {
    id: "next", title: "Next", duration: 203, energy: 0.7, arousal: 0.5,
    album: { id: "album-b", title: "Album B", coverUrl: "cover.jpg", artist: { id: "b", name: "Artist B" } },
};
const options = {
    seedTrackId: "seed", style: "balanced" as const, energy: 55, discovery: 35,
    limit: 5, excludeTrackIds: [] as string[],
};
const db = prisma as unknown as {
    track: { findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    play: { findFirst: jest.Mock; findMany: jest.Mock };
    likedTrack: { findFirst: jest.Mock; findMany: jest.Mock };
};

beforeEach(() => {
    jest.clearAllMocks();
    db.track.findFirst.mockImplementation(async ({ where }: { where: { id?: string } }) => where.id ? seed : seed);
    db.track.findMany.mockResolvedValue([next]);
    db.track.count.mockResolvedValue(0);
    db.play.findFirst.mockResolvedValue(null);
    db.play.findMany.mockResolvedValue([]);
    db.likedTrack.findFirst.mockResolvedValue(null);
    db.likedTrack.findMany.mockResolvedValue([]);
    (findSimilarTracks as jest.Mock).mockResolvedValue([{ id: "next", similarity: 0.85 }]);
});

describe("NOVA Flow library-safe generation", () => {
    it("returns only local, available candidate fields and scopes listener history", async () => {
        const flow = await buildNovaFlow("alice", options);
        expect(flow.unavailableSeed).toBe(false);
        expect(flow.tracks.map(track => track.id)).toEqual(["seed", "next"]);
        expect(JSON.stringify(flow.tracks)).not.toMatch(/filePath|password|token/);
        expect(db.track.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                missingSince: null,
                corrupt: false,
                album: expect.objectContaining({ location: "LIBRARY" }),
                id: { in: ["next"] },
            }),
        }));
        expect(db.play.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ userId: "alice" }),
        }));
        expect(db.likedTrack.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ userId: "alice" }),
        }));
    });

    it("never includes excluded seed tracks, useful for a later refill phase", async () => {
        const flow = await buildNovaFlow("alice", { ...options, excludeTrackIds: ["seed"] });
        expect(flow.tracks.map(t => t.id)).toEqual(["next"]);
    });

    it("refuses an unavailable explicit seed rather than replacing the listener's choice", async () => {
        db.track.findFirst.mockResolvedValueOnce(null);
        const flow = await buildNovaFlow("alice", options);
        expect(flow.unavailableSeed).toBe(true);
        expect(flow.tracks).toEqual([]);
        expect(findSimilarTracks).not.toHaveBeenCalled();
    });

    it("starts from recent listening and survives an unavailable similarity service", async () => {
        db.play.findFirst.mockResolvedValue({ trackId: "seed" });
        (findSimilarTracks as jest.Mock).mockRejectedValue(new Error("no analyzer"));
        db.track.count.mockResolvedValue(1);
        db.track.findMany.mockResolvedValue([next]);
        const flow = await buildNovaFlow("bob", { ...options, seedTrackId: undefined });
        expect(flow.seedTrackId).toBe("seed");
        expect(flow.tracks.map(t => t.id)).toEqual(["seed", "next"]);
        expect(db.play.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ userId: "bob" }),
        }));
        expect(db.track.count).toHaveBeenCalledWith({
            where: expect.objectContaining({ missingSince: null, corrupt: false }),
        });
    });
});
