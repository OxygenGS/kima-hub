/** Deterministic, bounded DJ set planning over existing analysis.
 * This is musical compatibility, NOT beat-grid analysis or audio mixing.
 */
export const MAX_DJ_TRACKS = 60;
export type DjStyle = "smooth" | "build" | "cooldown";
export interface DjAnalysis {
    id: string;
    bpm: number | null;
    key: string | null;
    keyScale: string | null;
    keyStrength: number | null;
    energy: number | null;
}
export type HarmonicMatch = "same" | "neighbor" | "relative" | "different" | "unknown";
export interface DjTransition {
    bpmDifference: number | null;
    harmonic: HarmonicMatch;
    energyDifference: number | null;
}
const NOTES: Record<string, number> = {
    C: 0, "B#": 0, "C#": 1, DB: 1, D: 2, "D#": 3, EB: 3, E: 4, FB: 4,
    F: 5, "E#": 5, "F#": 6, GB: 6, G: 7, "G#": 8, AB: 8, A: 9,
    "A#": 10, BB: 10, B: 11, CB: 11,
};
function note(a: DjAnalysis): { pitch: number; mode: "major" | "minor" } | null {
    if (!a.key || (a.keyScale !== "major" && a.keyScale !== "minor")) return null;
    if (a.keyStrength !== null && (!Number.isFinite(a.keyStrength) || a.keyStrength < 0.45)) return null;
    const pitch = NOTES[a.key.trim().replace(/♯/g, "#").replace(/♭/g, "b").toUpperCase()];
    return typeof pitch === "number" ? { pitch, mode: a.keyScale } : null;
}
function valid(v: number | null, min: number, max: number): v is number {
    return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}
export function describeDjTransition(a: DjAnalysis, b: DjAnalysis): DjTransition {
    const x = note(a), y = note(b);
    let harmonic: HarmonicMatch = "unknown";
    if (x && y) {
        const delta = (y.pitch - x.pitch + 12) % 12;
        harmonic = x.mode === y.mode
            ? delta === 0 ? "same" : delta === 5 || delta === 7 ? "neighbor" : "different"
            : (x.mode === "major" ? delta === 9 : delta === 3) ? "relative" : "different";
    }
    return {
        bpmDifference: valid(a.bpm, 30, 300) && valid(b.bpm, 30, 300)
            ? Math.round(Math.abs(a.bpm - b.bpm) * 10) / 10 : null,
        harmonic,
        energyDifference: valid(a.energy, 0, 1) && valid(b.energy, 0, 1)
            ? Math.round((b.energy - a.energy) * 1000) / 1000 : null,
    };
}
function cost(t: DjTransition, style: DjStyle): number {
    const tempo = t.bpmDifference === null ? 0.65 : Math.min(2, t.bpmDifference / 18);
    const harmony = { same: 0, relative: 0.1, neighbor: 0.2, unknown: 0.65, different: 1.2 }[t.harmonic];
    const energy = t.energyDifference;
    const shape = energy === null ? 0.35 : Math.abs(energy) * 0.8 +
        (style === "build" ? Math.max(0, -energy) * 2 : style === "cooldown" ? Math.max(0, energy) * 2 : 0);
    return tempo + harmony + shape;
}
/** Keep the first selected track, then choose the lowest-cost transition.
 * Ties preserve input order. Repeated input IDs are deliberately kept as
 * distinct queue entries; no track is invented or downloaded.
 */
export function planDjSet<T extends DjAnalysis>(tracks: readonly T[], style: DjStyle) {
    if (tracks.length > MAX_DJ_TRACKS) throw new RangeError("DJ set exceeds limit");
    const remaining = tracks.slice(1);
    const ordered = tracks.length ? [tracks[0]] : [];
    while (remaining.length) {
        const prev = ordered[ordered.length - 1];
        let index = 0;
        let best = Infinity;
        for (let i = 0; i < remaining.length; i++) {
            const score = cost(describeDjTransition(prev, remaining[i]), style);
            if (score < best) { best = score; index = i; }
        }
        ordered.push(remaining.splice(index, 1)[0]);
    }
    return ordered.map((track, i) => ({
        track,
        transition: i === 0 ? null : describeDjTransition(ordered[i - 1], track),
    }));
}
