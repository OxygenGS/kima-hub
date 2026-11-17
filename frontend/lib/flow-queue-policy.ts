import type { Track, VibeOperation } from "./audio-state-context";

export type ActiveFlowOperation = Extract<VibeOperation, { type: "flow" }>;

export const FLOW_REFILL_AT = 6;
export const FLOW_BATCH_SIZE = 20;
export const FLOW_HISTORY_TO_KEEP = 8;
export const FLOW_RECENT_WINDOW = 180;

export interface FlowSnapshot {
    operation: VibeOperation;
    ownerId: string | null;
    queue: Track[];
    currentIndex: number;
    currentTrackId: string | null;
    playbackType: "track" | "audiobook" | "podcast" | null;
    isPlaying: boolean;
    isShuffle: boolean;
    repeatMode: "off" | "one" | "all";
}

export function sameFlowQueue(queue: readonly Track[], expectedIds: readonly string[]): boolean {
    return queue.length === expectedIds.length
        && queue.every((item, index) => item.id === expectedIds[index]);
}

/**
 * A Flow session owns the exact queue it generated. Any manual reorder,
 * add/remove, replacement, device sync or account change invalidates it.
 * Reaching the end never starts a new audio stream by itself.
 */
export function isFlowSessionIntact(snapshot: FlowSnapshot): snapshot is FlowSnapshot & { operation: ActiveFlowOperation } {
    const op = snapshot.operation;
    return op.type === "flow"
        && !!snapshot.ownerId
        && op.ownerId === snapshot.ownerId
        && snapshot.playbackType === "track"
        && !!snapshot.currentTrackId
        && snapshot.currentIndex >= 0
        && snapshot.currentIndex < snapshot.queue.length
        && snapshot.queue[snapshot.currentIndex]?.id === snapshot.currentTrackId
        && !snapshot.isShuffle
        && snapshot.repeatMode === "off"
        && sameFlowQueue(snapshot.queue, op.trackIds);
}

export function shouldRefillFlow(snapshot: FlowSnapshot): boolean {
    return isFlowSessionIntact(snapshot)
        && snapshot.isPlaying
        && snapshot.queue.length - snapshot.currentIndex - 1 <= FLOW_REFILL_AT;
}

export function flowExclusions(op: ActiveFlowOperation, queue: readonly Track[]): string[] {
    // Server accepts at most 250 IDs. A rolling 180-ID memory gives variety
    // without a growing per-user listening profile or unbounded API payload.
    return [...new Set([...op.recentTrackIds, ...queue.map(t => t.id)])].slice(-240);
}

export function planFlowAppend(snapshot: FlowSnapshot, incoming: readonly Track[]): {
    queue: Track[];
    currentIndex: number;
    operation: ActiveFlowOperation;
} | null {
    if (!shouldRefillFlow(snapshot)) return null;
    const op = snapshot.operation as ActiveFlowOperation;
    const excluded = new Set(flowExclusions(op, snapshot.queue));
    const append: Track[] = [];

    for (const track of incoming) {
        if (!track?.id || excluded.has(track.id)) continue;
        excluded.add(track.id);
        append.push(track);
        if (append.length >= FLOW_BATCH_SIZE) break;
    }
    if (append.length === 0) return null;

    const all = [...snapshot.queue, ...append];
    // Keep a few previous songs for Previous, but bound the rolling queue.
    // Removing only already-played entries never changes the playing audio
    // engine; currentIndex is adjusted by exactly the number removed.
    const drop = Math.max(0, snapshot.currentIndex - FLOW_HISTORY_TO_KEEP);
    const queue = all.slice(drop);
    const currentIndex = snapshot.currentIndex - drop;
    const recentTrackIds = [...new Set([
        ...op.recentTrackIds,
        ...snapshot.queue.map(t => t.id),
        ...append.map(t => t.id),
    ])].slice(-FLOW_RECENT_WINDOW);

    return {
        queue,
        currentIndex,
        operation: {
            ...op,
            trackIds: queue.map(t => t.id),
            recentTrackIds,
        },
    };
}
