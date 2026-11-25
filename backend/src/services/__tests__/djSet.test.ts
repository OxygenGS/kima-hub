import { describeDjTransition, planDjSet, MAX_DJ_TRACKS, type DjAnalysis } from "../djSet";
const track = (id: string, bpm: number | null, key: string | null, keyScale: string | null = "major", energy: number | null = 0.5): DjAnalysis =>
    ({ id, bpm, key, keyScale, keyStrength: 0.9, energy });

describe("DJ set transition planning", () => {
    it("recognizes same, fifth-related, and relative keys including enharmonic spellings", () => {
        const a = track("a", 120, "C#");
        expect(describeDjTransition(a, track("b", 122, "Db"))).toEqual({ bpmDifference: 2, harmonic: "same", energyDifference: 0 });
        expect(describeDjTransition(track("c", 120, "C"), track("g", 120, "G")).harmonic).toBe("neighbor");
        expect(describeDjTransition(track("c", 120, "C"), track("am", 120, "A", "minor")).harmonic).toBe("relative");
        expect(describeDjTransition(track("am", 120, "A", "minor"), track("c", 120, "C")).harmonic).toBe("relative");
        expect(describeDjTransition(track("c", 120, "C"), track("f#", 120, "F#")).harmonic).toBe("different");
    });
    it("never invents tempo or harmonic confidence for unanalyzed songs", () => {
        const a = track("a", null, null, null, null);
        expect(describeDjTransition(a, track("b", 120, "C"))).toEqual({ bpmDifference: null, harmonic: "unknown", energyDifference: null });
        expect(describeDjTransition({ ...track("a", 120, "C"), keyStrength: 0.1 }, track("b", 120, "C")).harmonic).toBe("unknown");
        expect(describeDjTransition(track("bad", NaN, "C"), track("b", 120, "C")).bpmDifference).toBeNull();
    });
    it("keeps the seed, prefers compatible transitions and preserves every entry", () => {
        const input = [track("a", 120, "C"), track("far", 180, "F#"), track("near", 122, "G"), track("near", 122, "G")];
        const out = planDjSet(input, "smooth");
        expect(out.map(x => x.track.id)).toEqual(["a", "near", "near", "far"]);
        expect(out[0].transition).toBeNull();
        expect(input.map(x => x.id)).toEqual(["a", "far", "near", "near"]);
    });
    it("supports directional energy without changing playback rates", () => {
        const input = [track("seed", 120, "C", "major", .5), track("lower", 120, "C", "major", .3), track("higher", 120, "C", "major", .7)];
        expect(planDjSet(input, "build")[1].track.id).toBe("higher");
        expect(planDjSet(input, "cooldown")[1].track.id).toBe("lower");
    });
    it("bounds work and handles an empty selection", () => {
        expect(planDjSet([], "smooth")).toEqual([]);
        expect(() => planDjSet(Array.from({ length: MAX_DJ_TRACKS + 1 }, (_, i) => track(String(i), null, null)), "smooth")).toThrow(RangeError);
    });
});
