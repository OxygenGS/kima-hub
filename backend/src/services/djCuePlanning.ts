import { z } from "zod";

const Edge = z.object({
    windowMs: z.number().int().min(8000).max(24000),
    beatsMs: z.array(z.number().int().min(0).max(23999)).max(128),
    tempoBpm: z.number().min(30).max(300).nullable(),
    confidence: z.number().min(1).max(100).nullable(),
    rmsDb: z.array(z.number().min(-90).max(0)).min(8).max(24),
}).strict().refine(edge => {
    if (edge.rmsDb.length !== Math.ceil(edge.windowMs / 1000)) return false;
    if (!edge.beatsMs.length) return edge.tempoBpm === null && edge.confidence === null;
    if (edge.beatsMs.length < 5 || edge.tempoBpm === null || edge.confidence === null) return false;
    return edge.beatsMs.every((tick, index) =>
        tick < edge.windowMs && (index === 0 || tick > edge.beatsMs[index - 1]));
}, "Invalid measured edge");

const Profile = z.object({
    version: z.literal(1),
    head: Edge.nullable(),
    tail: Edge.nullable(),
}).strict().refine(profile => profile.head !== null || profile.tail !== null);

export type DjCueEdge = z.infer<typeof Edge>;
export type DjCueProfile = z.infer<typeof Profile>;

interface CueRow {
    filePath: string;
    fileModified: Date;
    fileSize: number;
    analyzedAt: Date | null;
    analysisStatus: string;
    djCue: {
        sourcePath: string;
        sourceModified: Date;
        sourceSize: number;
        sourceAnalyzedAt: Date;
        profile: unknown;
    } | null;
}

/** Only consume measurements belonging to the current indexed source and
 * completed analysis. No storage paths or file identity leave this function.
 */
export function currentDjCue(track: CueRow): DjCueProfile | null {
    const cue = track.djCue;
    if (!cue || track.analysisStatus !== "completed" || !track.analyzedAt ||
        cue.sourcePath !== track.filePath || cue.sourceSize !== track.fileSize ||
        cue.sourceModified.getTime() !== track.fileModified.getTime() ||
        cue.sourceAnalyzedAt.getTime() !== track.analyzedAt.getTime()) return null;
    const result = Profile.safeParse(cue.profile);
    return result.success ? result.data : null;
}

export interface DjTimingAdvice {
    overlapMs: number;
    incomingFirstBeatMs: number;
    outgoingBeatBeforeEndMs: number;
    matchedBeats: number;
    maxDriftMs: number;
}

/** Find an overlap suggestion using actual edge ticks without changing tempo,
 * skipping the intro or claiming downbeat alignment. Require measured local
 * tempo agreement and several matching ticks, not just a global BPM match.
 * Advisory only: the playback engine still uses its fixed crossfade setting.
 */
export function suggestDjTiming(outgoing: DjCueProfile | null, incoming: DjCueProfile | null): DjTimingAdvice | null {
    const tail = outgoing?.tail;
    const head = incoming?.head;
    if (!tail || !head || !tail.tempoBpm || !head.tempoBpm ||
        !tail.beatsMs.length || !head.beatsMs.length ||
        Math.abs(tail.tempoBpm - head.tempoBpm) / Math.min(tail.tempoBpm, head.tempoBpm) > 0.02) return null;
    const first = head.beatsMs[0];
    if (first > 2000) return null;
    let best: DjTimingAdvice | null = null;
    let bestCost = Infinity;
    for (const beat of tail.beatsMs) {
        const beforeEnd = tail.windowMs - beat;
        const overlapMs = beforeEnd + first;
        if (overlapMs < 2000 || overlapMs > 8000 || overlapMs > head.windowMs || overlapMs > tail.windowMs) continue;
        const start = tail.windowMs - overlapMs;
        const beats = head.beatsMs.filter(tick => tick < overlapMs - 80);
        if (beats.length < 3) continue;
        let previous = -1;
        let maxDriftMs = 0;
        let valid = true;
        for (const tick of beats) {
            let closest = -1;
            let distance = Infinity;
            for (let i = previous + 1; i < tail.beatsMs.length; i++) {
                const drift = Math.abs(tail.beatsMs[i] - (start + tick));
                if (drift < distance) { distance = drift; closest = i; }
                if (tail.beatsMs[i] > start + tick + 80) break;
            }
            if (closest < 0 || distance > 80) { valid = false; break; }
            previous = closest;
            maxDriftMs = Math.max(maxDriftMs, distance);
        }
        if (!valid) continue;
        const score = Math.abs(overlapMs - 6000) + 4 * maxDriftMs;
        if (score < bestCost) {
            bestCost = score;
            best = { overlapMs, incomingFirstBeatMs: first, outgoingBeatBeforeEndMs: beforeEnd,
                matchedBeats: beats.length, maxDriftMs };
        }
    }
    return best;
}
