"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useAudioState, type Track } from "@/lib/audio-state-context";
import { useAudioPlayback } from "@/lib/audio-playback-context";
import { useAudioControls } from "@/lib/audio-controls-context";
import {
    FLOW_BATCH_SIZE, flowExclusions, isFlowSessionIntact, sameFlowQueue,
    shouldRefillFlow, type FlowSnapshot,
} from "@/lib/flow-queue-policy";

const CHECK_INTERVAL_MS = 20_000;

/**
 * A tiny, local-only playlist continuation bridge. It never invokes the
 * playback engine or audio controls such as Play/Next; it only requests
 * candidates and appends them behind the current song when the verified
 * Flow session still owns the untouched queue.
 *
 * No background service, server write or automatic download is involved.
 */
export function FlowContinuationBridge() {
    const { user } = useAuth();
    const state = useAudioState();
    const playback = useAudioPlayback();
    const { appendFlowTracks } = useAudioControls();

    const snapshot: FlowSnapshot = {
        operation: state.activeOperation,
        ownerId: user?.id ?? null,
        queue: state.queue,
        currentIndex: state.currentIndex,
        currentTrackId: state.currentTrack?.id ?? null,
        playbackType: state.playbackType,
        isPlaying: playback.isPlaying,
        isShuffle: state.isShuffle,
        repeatMode: state.repeatMode,
    };
    const latestRef = useRef(snapshot);
    const appendRef = useRef(appendFlowTracks);
    useLayoutEffect(() => {
        latestRef.current = snapshot;
        appendRef.current = appendFlowTracks;
    });

    const sessionId = state.activeOperation.type === "flow" ? state.activeOperation.sessionId : null;
    const sessionOwner = state.activeOperation.type === "flow" ? state.activeOperation.ownerId : null;

    // A user edit or another device's queue update ends auto-refill without
    // cancelling audio or deleting their chosen upcoming songs.
    useEffect(() => {
        if (!sessionId || state.activeOperation.type !== "flow") return;
        if (!isFlowSessionIntact(snapshot)) {
            state.setActiveOperation(prev =>
                prev.type === "flow" && prev.sessionId === sessionId ? { type: "idle" } : prev);
        }
    }, [
        sessionId, state.activeOperation, state.queue, state.currentIndex, state.currentTrack?.id,
        state.playbackType, state.isShuffle, state.repeatMode, state.setActiveOperation, user?.id,
    ]);

    useEffect(() => {
        if (!sessionId || !sessionOwner) return;
        let alive = true;
        let inFlight = false;
        let pending: AbortController | null = null;

        const finishFlow = () => {
            state.setActiveOperation(prev =>
                prev.type === "flow" && prev.sessionId === sessionId ? { type: "idle" } : prev);
        };

        const check = async () => {
            if (!alive || inFlight) return;
            const current = latestRef.current;
            if (!shouldRefillFlow(current) ||
                current.operation.type !== "flow" ||
                current.operation.sessionId !== sessionId ||
                current.operation.ownerId !== sessionOwner) return;

            const originalQueueIds = current.queue.map(t => t.id);
            const seedTrackId = originalQueueIds.at(-1);
            if (!seedTrackId) return;
            const ctrl = new AbortController();
            pending = ctrl;
            inFlight = true;
            try {
                const response = await api.getNovaFlowPreview({
                    seedTrackId,
                    style: current.operation.style,
                    energy: current.operation.energy,
                    discovery: current.operation.discovery,
                    limit: FLOW_BATCH_SIZE,
                    excludeTrackIds: flowExclusions(current.operation, current.queue),
                }, ctrl.signal);

                if (!alive || ctrl.signal.aborted) return;
                const latest = latestRef.current;
                if (!shouldRefillFlow(latest) ||
                    latest.operation.type !== "flow" ||
                    latest.operation.sessionId !== sessionId ||
                    !sameFlowQueue(latest.queue, originalQueueIds)) return;

                const newTracks: Track[] = response.tracks.map(({ reason: _reason, feedback: _feedback, ...track }) => ({
                    ...track,
                    album: { ...track.album, coverArt: track.album.coverArt ?? undefined },
                }));

                if (newTracks.length === 0) {
                    // Nothing eligible remains. Finish this finite queue, do not
                    // retry forever or make up unavailable/foreign library tracks.
                    finishFlow();
                    return;
                }

                const appended = appendRef.current({
                    sessionId,
                    ownerId: sessionOwner,
                    queueIds: originalQueueIds,
                }, newTracks);
                if (!appended && shouldRefillFlow(latestRef.current) &&
                    sameFlowQueue(latestRef.current.queue, originalQueueIds)) {
                    // All candidates were duplicates or invalid for this session.
                    finishFlow();
                }
            } catch (error) {
                if (!alive || ctrl.signal.aborted) return;
                // An unavailable seed is terminal; transient backend/network
                // errors leave the existing queue intact and retry at most once
                // per interval, never spin in a render loop.
                if ((error as { status?: number } | null)?.status === 404) finishFlow();
            } finally {
                inFlight = false;
                if (pending === ctrl) pending = null;
            }
        };

        void check();
        const interval = window.setInterval(() => { void check(); }, CHECK_INTERVAL_MS);
        return () => {
            alive = false;
            window.clearInterval(interval);
            pending?.abort();
        };
    }, [sessionId, sessionOwner, state.setActiveOperation]);

    return null;
}
