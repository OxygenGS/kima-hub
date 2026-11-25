import { currentDjCue, suggestDjTiming, type DjCueEdge, type DjCueProfile } from "../djCuePlanning";

const edge = (first = 250, interval = 500): DjCueEdge => ({
    windowMs: 24000, beatsMs: Array.from({ length: 48 }, (_, i) => first + i * interval).filter(t => t < 24000),
    tempoBpm: 60000 / interval, confidence: 3, rmsDb: Array(24).fill(-16),
});
const profile = (head = edge(), tail = edge()): DjCueProfile => ({ version: 1, head, tail });
const at = new Date("2026-01-01T00:00:00Z");
const analyzed = new Date("2026-01-02T00:00:00Z");
const row = () => ({
    filePath: "synthetic.flac", fileModified: at, fileSize: 1000, analyzedAt: analyzed, analysisStatus: "completed",
    djCue: { sourcePath: "synthetic.flac", sourceModified: at, sourceSize: 1000, sourceAnalyzedAt: analyzed, profile: profile() },
});

describe("measured DJ edge metadata", () => {
    it("keeps only the current validated measurement", () => {
        expect(currentDjCue(row())).toEqual(profile());
        for (const patch of [
            { analysisStatus: "pending" }, { filePath: "renamed.flac" }, { fileSize: 1001 },
            { analyzedAt: new Date(analyzed.getTime() + 1) }, { analyzedAt: null },
            { fileModified: new Date(at.getTime() + 1) }, { djCue: null },
        ]) expect(currentDjCue({ ...row(), ...patch })).toBeNull();
    });

    it("rejects malformed or unsupported stored measurements", () => {
        for (const head of [
            { ...edge(), beatsMs: [1, 1, 3, 4, 5] },
            { ...edge(), beatsMs: Array(129).fill(0) },
            { ...edge(), beatsMs: [1, 2, 3, 4, 24000] },
            { ...edge(), rmsDb: [0] },
            { ...edge(), tempoBpm: 0 },
            { ...edge(), confidence: null },
        ]) expect(currentDjCue({ ...row(), djCue: { ...row().djCue, profile: { ...profile(), head } } })).toBeNull();
        expect(currentDjCue({ ...row(), djCue: { ...row().djCue, profile: { ...profile(), version: 2 } } })).toBeNull();
    });

    it("derives a bounded overlap from real phase rather than track BPM", () => {
        const answer = suggestDjTiming(profile(), profile(edge(370)));
        expect(answer).not.toBeNull();
        expect(answer!.overlapMs).toBeGreaterThanOrEqual(2000);
        expect(answer!.overlapMs).toBeLessThanOrEqual(8000);
        expect(answer!.overlapMs).toBe(answer!.incomingFirstBeatMs + answer!.outgoingBeatBeforeEndMs);
        expect(answer!.incomingFirstBeatMs).toBe(370);
        expect(answer!.matchedBeats).toBeGreaterThanOrEqual(3);
        expect(answer!.maxDriftMs).toBe(0);
        expect(answer!.overlapMs).not.toBe(6000);
    });

    it("does not infer phase from missing, incompatible or drifting measurements", () => {
        expect(suggestDjTiming(null, profile())).toBeNull();
        expect(suggestDjTiming(profile(), profile(edge(100, 600)))).toBeNull();
        const drifting = edge();
        drifting.beatsMs = drifting.beatsMs.map((tick, i) => i % 2 ? tick + 150 : tick);
        expect(suggestDjTiming(profile(), profile(drifting))).toBeNull();
        expect(suggestDjTiming(profile(), profile({ ...edge(), beatsMs: [], tempoBpm: null, confidence: null }))).toBeNull();
        expect(suggestDjTiming(profile(), profile(edge(2500)))).toBeNull();
    });
});
