"use client";

import { useEffect, useRef, useState } from "react";
import { api, type ConnectHandoff } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useAudioState } from "@/lib/audio-state-context";
import { useAudioPlayback } from "@/lib/audio-playback-context";
import { useAudioControls } from "@/lib/audio-controls-context";
import { getConnectDeviceId, getConnectDeviceName } from "@/lib/connect-device-id";
import { ConnectHandoffPrompt } from "@/components/player/ConnectHandoffPrompt";

const PULSE_MS = 7_000;
const MAX_SOURCE_DRIFT_SECONDS = 20;

/**
 * Browser presence + local command execution. Every remote control remains
 * a request to an existing audio engine, not an alternate player.
 *
 * A transfer appears only on the addressed browser and requires a local click.
 * The source may pause after a receiver's actual-playing receipt, but only if
 * the original track and approximately continuous play position still match.
 */
export function ConnectDeviceBridge() {
    const { user } = useAuth();
    const state = useAudioState();
    const playback = useAudioPlayback();
    const controls = useAudioControls();
    const latest = useRef({ state, playback, controls });
    const handledSourceHandoffs = useRef(new Set<string>());
    const [incoming, setIncoming] = useState<{ ownerId: string; handoff: ConnectHandoff; receivedAtMs: number } | null>(null);

    useEffect(() => {
        latest.current = { state, playback, controls };
    }, [state, playback, controls]);

    useEffect(() => {
        const ownerId = user?.id;
        if (!ownerId) return;
        const id = getConnectDeviceId(ownerId);
        if (!id) return;
        const name = getConnectDeviceName();
        let mounted = true;
        let inFlight = false;

        const pulse = async () => {
            if (!mounted || inFlight) return;
            inFlight = true;
            try {
                const player = latest.current;
                const currentTitle = player.state.playbackType === "track"
                    ? player.state.currentTrack?.title
                    : player.state.playbackType === "audiobook"
                      ? player.state.currentAudiobook?.title
                      : player.state.currentPodcast?.title;
                const response = await api.connectHeartbeat({
                    id,
                    name,
                    status: currentTitle
                        ? player.playback.isPlaying ? "playing" : "paused"
                        : "idle",
                    trackTitle: currentTitle ?? null,
                });
                if (!mounted) return;
                if (response.command) {
                    // Use current controls rather than closures captured at mount.
                    switch (response.command.type) {
                        case "pause":
                            latest.current.controls.pause();
                            break;
                        case "next":
                            if (latest.current.playback.isPlaying && latest.current.state.playbackType === "track") {
                                latest.current.controls.next();
                            }
                            break;
                        case "previous":
                            if (latest.current.playback.isPlaying && latest.current.state.playbackType === "track") {
                                latest.current.controls.previous();
                            }
                            break;
                    }
                }

                // Failed transfer polling must not interrupt ordinary audio playback.
                const [received, sent] = await Promise.allSettled([
                    api.getIncomingConnectHandoff(id),
                    api.getOutgoingConnectHandoff(id),
                ]);
                if (!mounted) return;
                if (received.status === "fulfilled") {
                    const handoff = received.value.handoff;
                    setIncoming(previous => {
                        if (!handoff) return previous?.ownerId === ownerId ? null : previous;
                        if (previous?.ownerId === ownerId && previous.handoff.id === handoff.id) return previous;
                        return { ownerId, handoff, receivedAtMs: Date.now() };
                    });
                }

                if (sent.status === "fulfilled" && sent.value.handoff?.status === "started") {
                    const handoff = sent.value.handoff;
                    const recent = latest.current;
                    if (!handledSourceHandoffs.current.has(handoff.id)) {
                        handledSourceHandoffs.current.add(handoff.id);
                        if (handledSourceHandoffs.current.size > 32) {
                            const first = handledSourceHandoffs.current.values().next().value;
                            if (first) handledSourceHandoffs.current.delete(first);
                        }
                        const expectedTime = handoff.positionSeconds +
                            Math.max(0, (handoff.serverNow - handoff.createdAt) / 1000);
                        const stillOriginalPlayback = recent.playback.isPlaying &&
                            recent.state.playbackType === "track" &&
                            recent.state.currentTrack?.id === handoff.sourceTrackId &&
                            Math.abs(recent.playback.currentTime - expectedTime) <= MAX_SOURCE_DRIFT_SECONDS;
                        if (stillOriginalPlayback) recent.controls.pause();
                    }
                    // Acknowledged even if the source has changed tracks, so no
                    // later request can unexpectedly pause a new listening session.
                    await api.updateConnectHandoff(handoff.id, id, "observed").catch(() => {});
                }
            } catch {
                // API/Redis outages never change local playback.
            } finally {
                inFlight = false;
            }
        };

        void pulse();
        const interval = window.setInterval(() => { void pulse(); }, PULSE_MS);
        return () => {
            mounted = false;
            window.clearInterval(interval);
        };
    }, [user?.id]);

    if (!incoming || incoming.ownerId !== user?.id) return null;
    const deviceId = getConnectDeviceId(incoming.ownerId);
    if (!deviceId) return null;
    return (
        <ConnectHandoffPrompt
            key={incoming.handoff.id}
            handoff={incoming.handoff}
            receivedAtMs={incoming.receivedAtMs}
            deviceId={deviceId}
            onDismiss={() => setIncoming(null)}
        />
    );
}
