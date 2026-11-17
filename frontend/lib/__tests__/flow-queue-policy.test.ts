import { describe, expect, it } from "vitest";
import type { Track, VibeOperation } from "../audio-state-context";
import {
    FLOW_BATCH_SIZE, FLOW_REFILL_AT, FLOW_RECENT_WINDOW,
    flowExclusions, isFlowSessionIntact, planFlowAppend, shouldRefillFlow,
    type FlowSnapshot,
} from "../flow-queue-policy";

const track = (id: string): Track => ({
    id, title: id, duration: 210,
    artist: { id: "artist-" + id, name: "Artist " + id },
    album: { id: "album-" + id, title: "Album " + id },
});

function snap(index = 19, size = 25): FlowSnapshot {
    const queue = Array.from({ length: size }, (_, i) => track("t" + i));
    const operation: VibeOperation = {
        type: "flow", sessionId: "flow-1", ownerId: "alice", sourceTrackId: "t0",
        style: "balanced", energy: 55, discovery: 35,
        trackIds: queue.map(t => t.id), recentTrackIds: queue.map(t => t.id),
    };
    return {
        operation, ownerId: "alice", queue,
        currentIndex: index, currentTrackId: queue[index]?.id ?? null,
        playbackType: "track", isPlaying: true, isShuffle: false, repeatMode: "off",
    };
}

describe("Continuous Flow guardrails", () => {
    it("refills only close to the tail of an actively playing, verified queue", () => {
        const near = snap();
        expect(near.queue.length - near.currentIndex - 1).toBeLessThanOrEqual(FLOW_REFILL_AT);
        expect(shouldRefillFlow(near)).toBe(true);
        expect(shouldRefillFlow(snap(5))).toBe(false);
        expect(shouldRefillFlow({ ...near, isPlaying: false })).toBe(false);
        expect(shouldRefillFlow({ ...near, currentIndex: 24, currentTrackId: "else" })).toBe(false);
    });

    it("stops on manual reorder, deletion, another source or a different owner", () => {
        const current = snap();
        expect(isFlowSessionIntact(current)).toBe(true);
        const edited = [...current.queue];
        [edited[20], edited[21]] = [edited[21], edited[20]];
        expect(isFlowSessionIntact({ ...current, queue: edited })).toBe(false);
        expect(isFlowSessionIntact({ ...current, queue: current.queue.slice(1) })).toBe(false);
        expect(isFlowSessionIntact({ ...current, ownerId: "bob" })).toBe(false);
        expect(isFlowSessionIntact({ ...current, ownerId: null })).toBe(false);
        expect(isFlowSessionIntact({ ...current, playbackType: "podcast" })).toBe(false);
        expect(isFlowSessionIntact({ ...current, repeatMode: "one" })).toBe(false);
        expect(isFlowSessionIntact({ ...current, isShuffle: true })).toBe(false);
        expect(isFlowSessionIntact({ ...current, operation: { type: "idle" } })).toBe(false);
    });

    it("appends without touching current media, keeps previous tracks and bounds queue history", () => {
        const before = snap();
        const fresh = Array.from({ length: 30 }, (_, i) => track("fresh" + i));
        const result = planFlowAppend(before, fresh);
        expect(result).not.toBeNull();
        expect(result!.queue[result!.currentIndex].id).toBe("t19");
        expect(result!.currentIndex).toBe(8);
        expect(result!.queue).toHaveLength(25 - (19 - 8) + FLOW_BATCH_SIZE);
        expect(result!.queue.slice(-FLOW_BATCH_SIZE).map(t => t.id))
            .toEqual(fresh.slice(0, FLOW_BATCH_SIZE).map(t => t.id));
        expect(result!.operation.sessionId).toBe("flow-1");
        expect(result!.operation.trackIds).toEqual(result!.queue.map(t => t.id));
        expect(result!.operation.recentTrackIds).toContain("t0");
        expect(before.queue).toHaveLength(25); // immutable
    });

    it("never duplicates an already queued or recently played candidate", () => {
        const before = snap();
        const batch = [track("t0"), track("t18"), track("new"), track("new"), track("next")];
        const next = planFlowAppend(before, batch);
        expect(next?.queue.slice(-2).map(t => t.id)).toEqual(["new", "next"]);
        expect(next?.operation.recentTrackIds.filter(id => id === "new")).toHaveLength(1);
        expect(planFlowAppend(before, [track("t0"), track("t20")])).toBeNull();
    });

    it("keeps a bounded request and recent-history window across many refills", () => {
        const before = snap();
        const op = before.operation;
        if (op.type !== "flow") throw new Error("Flow op expected");
        const old = Array.from({ length: FLOW_RECENT_WINDOW }, (_, i) => "old" + i);
        const huge: FlowSnapshot = {
            ...before, operation: { ...op, recentTrackIds: old },
        };
        const result = planFlowAppend(huge, [track("new")]);
        expect(result?.operation.recentTrackIds.length).toBeLessThanOrEqual(FLOW_RECENT_WINDOW);
        expect(result?.operation.recentTrackIds).toContain("new");
        expect(flowExclusions(op, before.queue).length).toBeLessThanOrEqual(240);
        const veryMany = { ...op, recentTrackIds: Array.from({ length: 500 }, (_, i) => String(i)) };
        expect(flowExclusions(veryMany, before.queue)).toHaveLength(240);
    });
});
