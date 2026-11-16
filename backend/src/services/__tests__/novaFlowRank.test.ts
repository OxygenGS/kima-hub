import { flowReason, rankFlowCandidates, scoreFlowCandidate, type FlowCandidate } from "../novaFlowRank";

const make = (id: string, artistId: string, similarity: number | null, energy: number | null, recentPlays = 0, liked = false): FlowCandidate => ({
    id, artistId, albumId: "album-" + artistId, similarity, energy, recentPlays, liked,
});

describe("NOVA Flow ranking", () => {
    it("prefers a favorite for familiar listening when tracks are otherwise equal", () => {
        const familiar = { style: "familiar" as const, energy: 50, discovery: 0 };
        const plain = make("plain", "a", 0.9, 0.5);
        const favorite = make("favorite", "b", 0.9, 0.5, 0, true);
        expect(scoreFlowCandidate(favorite, familiar)).toBeGreaterThan(scoreFlowCandidate(plain, familiar));
        expect(rankFlowCandidates([plain, favorite], familiar, 2)[0].id).toBe("favorite");
        expect(flowReason(favorite, familiar)).toBe("favorite");
    });

    it("uses energy without treating missing analysis as zero energy", () => {
        const high = { style: "balanced" as const, energy: 95, discovery: 20 };
        const fast = make("fast", "a", 0.8, 0.9);
        const slow = make("slow", "b", 0.8, 0.1);
        const unknown = make("unknown", "c", 0.8, null);
        expect(scoreFlowCandidate(fast, high)).toBeGreaterThan(scoreFlowCandidate(unknown, high));
        expect(scoreFlowCandidate(unknown, high)).toBeGreaterThan(scoreFlowCandidate(slow, high));
    });

    it("makes exploration meaningfully favor less similar, unheard tracks", () => {
        const close = make("close", "a", 0.9, 0.5, 3);
        const curious = make("curious", "b", 0.55, 0.5, 0);
        const familiar = { style: "familiar" as const, energy: 50, discovery: 0 };
        const adventure = { style: "adventurous" as const, energy: 50, discovery: 100 };
        expect(rankFlowCandidates([close, curious], familiar, 2)[0].id).toBe("close");
        expect(rankFlowCandidates([close, curious], adventure, 2)[0].id).toBe("curious");
        expect(flowReason(curious, adventure)).toBe("new-to-you");
    });

    it("spreads artists and albums instead of repeating one voice immediately", () => {
        const prefs = { style: "balanced" as const, energy: 50, discovery: 15 };
        const tracks = [
            make("a1", "artist-a", 0.94, 0.5),
            make("a2", "artist-a", 0.93, 0.5),
            make("b1", "artist-b", 0.91, 0.5),
            make("c1", "artist-c", 0.90, 0.5),
        ];
        const ranked = rankFlowCandidates(tracks, prefs, 4);
        expect(ranked[0].id).toBe("a1");
        expect(ranked[1].id).not.toBe("a2");
        expect(new Set(ranked.map(track => track.id)).size).toBe(4);
    });

    it("is deterministic and stops at the requested count", () => {
        const candidates = [make("z", "z", null, null), make("a", "a", null, null)];
        const prefs = { style: "balanced" as const, energy: 50, discovery: 35 };
        expect(rankFlowCandidates(candidates, prefs, 1).map(c => c.id)).toEqual(["a"]);
        expect(candidates).toHaveLength(2);
    });
});
