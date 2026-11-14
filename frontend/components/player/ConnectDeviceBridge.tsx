"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useAudioState } from "@/lib/audio-state-context";
import { useAudioPlayback } from "@/lib/audio-playback-context";
import { useAudioControls } from "@/lib/audio-controls-context";
import { getConnectDeviceId, getConnectDeviceName } from "@/lib/connect-device-id";

const PULSE_MS = 7_000;

/**
 * Only authenticated Kima browser players participate in Connect.
 * A heartbeat simultaneously refreshes this tab's presence and atomically
 * collects at most one remote instruction. This component renders nothing.
 *
 * Remote auto-play/handoff is intentionally excluded: browsers commonly
 * require a local gesture before a new audio session can start.
 */
export function ConnectDeviceBridge() {
    const { user } = useAuth();
    const state = useAudioState();
    const playback = useAudioPlayback();
    const controls = useAudioControls();
    const latest = useRef({ state, playback, controls });

    useEffect(() => {
        latest.current = { state, playback, controls };
    }, [state, playback, controls]);

    useEffect(() => {
        if (!user?.id) return;
        const id = getConnectDeviceId(user.id);
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
                if (!mounted || !response.command) return;
                // Obtain the CURRENT controls, never closures captured at mount.
                switch (response.command.type) {
                    case "pause":
                        latest.current.controls.pause();
                        break;
                    case "next":
                        // A remote command must not start new audio on a paused tab.
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
            } catch {
                // Kima remains a fully local player during an API/Redis outage.
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

    return null;
}
