/** Browser-side validation of advisory timing. Never infer beats from BPM.
 * Milliseconds are relative to the decoded track edges; media clock drift
 * is checked separately during the overlap. Not a sample-accurate beat lock.
 */
export interface DjTimingAdvice {
    overlapMs: number;
    incomingFirstBeatMs: number;
    outgoingBeatBeforeEndMs: number;
    matchedBeats: number;
    maxDriftMs: number;
}

export interface DjTimingPair {
    outgoingId: string;
    incomingId: string;
    targetSeconds: number;
}

export const DJ_START_TOLERANCE_S = 0.1;
export const DJ_CLOCK_DRIFT_TOLERANCE_S = 0.15;

export function isMusicStream(src: string | null, trackId: string): boolean {
    if (!src || !trackId) return false;
    return src.split(/[?#]/, 1)[0].endsWith("/api/library/tracks/" + encodeURIComponent(trackId) + "/stream");
}

export function readDjTiming(value: unknown, pair: DjTimingPair): DjTimingAdvice | null {
    if (!value || typeof value !== "object") return null;
    const response = value as Record<string, unknown>;
    if (response.outgoingId !== pair.outgoingId || response.incomingId !== pair.incomingId ||
        response.targetSeconds !== pair.targetSeconds || ![2, 4, 6, 8].includes(pair.targetSeconds) ||
        !response.timing || typeof response.timing !== "object") return null;
    const timing = response.timing as Record<string, unknown>;
    const within = (n: unknown, min: number, max: number): n is number =>
        typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;
    const { overlapMs, incomingFirstBeatMs, outgoingBeatBeforeEndMs, matchedBeats, maxDriftMs } = timing;
    if (!within(overlapMs, Math.max(2000, pair.targetSeconds * 1000 - 750), Math.min(8000, pair.targetSeconds * 1000 + 750)) ||
        !within(incomingFirstBeatMs, 0, 2000) || !within(outgoingBeatBeforeEndMs, 1, 8000) ||
        overlapMs !== incomingFirstBeatMs + outgoingBeatBeforeEndMs ||
        !within(matchedBeats, 3, 128) || !within(maxDriftMs, 0, 80)) return null;
    return { overlapMs, incomingFirstBeatMs, outgoingBeatBeforeEndMs, matchedBeats, maxDriftMs };
}

export function guidedStart(overlapS: number, remainingS: number): "wait" | "start" | "missed" {
    if (!Number.isFinite(overlapS) || !Number.isFinite(remainingS) || overlapS < 2 || overlapS > 8) return "missed";
    if (remainingS > overlapS) return "wait";
    return remainingS >= overlapS - DJ_START_TOLERANCE_S ? "start" : "missed";
}
