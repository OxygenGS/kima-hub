import { selectSmartDjTracks, type SmartDjCandidate, type SmartDjContext } from "../smartDj";

const track = (
    id: string,
    artist = id,
    energy: number | null = 0.5,
    albumId = id,
): SmartDjCandidate => ({
    id, title: "Song " + id, duration: 210, energy,
    bpm: energy === null ? null : 90 + energy * 80, valence: 0.5,
    album: {
        id: albumId, title: "Album " + albumId, coverUrl: null,
        artist: { id: artist, name: "Artist " + artist },
    },
});

const ctx = (overrides: Partial<SmartDjContext> = {}): SmartDjContext => ({
    preset: "flow", limit: 4, userId: "listener-a",
    excludeIds: new Set<string>(), recentlyPlayedIds: [],
    likedIds: new Set<string>(), dislikedIds: new Set<string>(),
    similarities: new Map<string, number>(),
    ...overrides,
});

describe("adaptive Smart DJ scoring and queue safety", () => {
    it("only selects a track once and respects exclusions, dislikes and the seed", () => {
        const picks = selectSmartDjTracks([
            track("a"), track("a"), track("b"), track("c"), track("d"), track("e"), track("f"),
        ], ctx({
            seedTrackId: "a",
            excludeIds: new Set(["b"]),
            dislikedIds: new Set(["c"]),
        }), 120);
        expect(picks.map(p => p.track.id)).toEqual(expect.arrayContaining(["d", "e", "f"]));
        expect(new Set(picks.map(p => p.track.id)).size).toBe(picks.length);
        expect(picks.every(p => !["a", "b", "c"].includes(p.track.id))).toBe(true);
    });

    it("discovery prioritizes never-played items over repeatedly heard tracks", () => {
        const picks = selectSmartDjTracks([track("heard"), track("fresh")], ctx({
            preset: "explore", limit: 2,
            recentlyPlayedIds: ["heard", "heard", "heard"],
        }), 10);
        expect(picks[0].track.id).toBe("fresh");
        expect(picks[0].reason).toBe("not-yet-played");
    });

    it("focus prefers calm songs, energy prefers energetic songs", () => {
        const songs = [track("calm", "x", 0.14), track("fast", "y", 0.96)];
        expect(selectSmartDjTracks(songs, ctx({ preset: "focus", limit: 2 }), 10)[0].track.id)
            .toBe("calm");
        expect(selectSmartDjTracks(songs, ctx({ preset: "energy", limit: 2 }), 10)[0].track.id)
            .toBe("fast");
    });

    it("preserves artist variety unless the library is small", () => {
        const songs = [
            track("a", "same"), track("b", "same"), track("c", "same"), track("d", "other"),
        ];
        const picks = selectSmartDjTracks(songs, ctx({ limit: 4 }), 11);
        expect(picks.map(p => p.track.id)).toHaveLength(4);
        expect(new Set(picks.map(p => p.track.id)).size).toBe(4);
        expect(picks[0].track.album.artist.id).not.toBe(picks[1].track.album.artist.id);
    });

    it("keeps the selection user-specific and never mutates candidate arrays", () => {
        const songs = Object.freeze([track("a"), track("b"), track("c"), track("d")]);
        const a = selectSmartDjTracks(songs, ctx({
            preset: "explore", recentlyPlayedIds: ["a", "a"], userId: "listener-a",
        }), 22);
        const b = selectSmartDjTracks(songs, ctx({
            preset: "explore", recentlyPlayedIds: ["b", "b"], userId: "listener-b",
        }), 22);
        expect(a[0].track.id).not.toBe("a");
        expect(b[0].track.id).not.toBe("b");
        expect(songs).toHaveLength(4);
    });

    it("accepts unanalyzed songs as a fallback", () => {
        const picks = selectSmartDjTracks([track("no-features", "a", null)], ctx({
            preset: "focus", limit: 5,
        }), 1);
        expect(picks.map(p => p.track.id)).toEqual(["no-features"]);
    });
});
