/**
 * Pure, bounded ranking for NOVA Flow. The existing audio-analysis engine
 * remains authoritative for similarity; this layer only personalizes the
 * order for a signed-in listener without modifying their library.
 */
export type FlowStyle = "familiar" | "balanced" | "adventurous";

export interface FlowCandidate {
    id: string;
    artistId: string;
    albumId: string;
    similarity: number | null;
    energy: number | null;
    recentPlays: number;
    liked: boolean;
}

export interface FlowPreferences {
    style: FlowStyle;
    energy: number; // 0..100
    discovery: number; // 0..100
}

export function scoreFlowCandidate(candidate: FlowCandidate, prefs: FlowPreferences): number {
    const exploration = Math.min(1, Math.max(0, prefs.discovery / 100));
    const energy = Math.min(1, Math.max(0, prefs.energy / 100));
    const styleShift = prefs.style === "familiar" ? 0.09
        : prefs.style === "adventurous" ? -0.09 : 0;
    // Higher discovery deliberately explores farther from the seed.
    const targetSimilarity = Math.max(0.30, Math.min(0.98, 0.91 - exploration * 0.42 + styleShift));
    const similarity = candidate.similarity === null
        ? 0.52 : Math.max(0, Math.min(1, candidate.similarity));
    const similarityFit = 1 - Math.abs(similarity - targetSimilarity);
    // Unknown energy must not be classified as high/low; leave it neutral.
    const energyFit = candidate.energy === null
        ? 0.5 : 1 - Math.abs(Math.max(0, Math.min(1, candidate.energy)) - energy);
    const novelty = 1 / (1 + Math.max(0, candidate.recentPlays));
    const favoriteWeight = prefs.style === "familiar" ? 0.14 : prefs.style === "balanced" ? 0.09 : 0.04;

    return 0.56 * similarityFit
        + 0.22 * energyFit
        + (0.10 + exploration * 0.14) * novelty
        + (candidate.liked ? favoriteWeight * (1 - exploration * 0.6) : 0);
}

export function flowReason(candidate: FlowCandidate, prefs: FlowPreferences):
    "favorite" | "new-to-you" | "similar" | "energy" | "library-pick" {
    if (candidate.liked && prefs.style !== "adventurous") return "favorite";
    if (candidate.recentPlays === 0 && prefs.discovery >= 45) return "new-to-you";
    if (candidate.similarity !== null) return "similar";
    if (candidate.energy !== null) return "energy";
    return "library-pick";
}

/** Greedy artist/album spacing. Re-running with identical inputs is stable. */
export function rankFlowCandidates(candidates: FlowCandidate[], prefs: FlowPreferences, limit: number): FlowCandidate[] {
    const remaining = [...candidates];
    const picked: FlowCandidate[] = [];
    while (picked.length < limit && remaining.length > 0) {
        let best = 0;
        let bestScore = -Infinity;
        for (let i = 0; i < remaining.length; i++) {
            const candidate = remaining[i];
            const lastTwo = picked.slice(-2);
            const artistRepeat = lastTwo.some(x => x.artistId === candidate.artistId);
            const albumRepeat = picked.slice(-4).some(x => x.albumId === candidate.albumId);
            const adjusted = scoreFlowCandidate(candidate, prefs)
                - (artistRepeat ? 0.32 : 0)
                - (albumRepeat ? 0.14 : 0);
            if (adjusted > bestScore ||
                (adjusted === bestScore && candidate.id.localeCompare(remaining[best].id) < 0)) {
                best = i;
                bestScore = adjusted;
            }
        }
        picked.push(remaining.splice(best, 1)[0]);
    }
    return picked;
}
