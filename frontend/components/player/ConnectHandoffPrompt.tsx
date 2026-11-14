"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, Loader2, Play, X } from "lucide-react";
import { api, type ConnectHandoff } from "@/lib/api";
import { useAudioControls } from "@/lib/audio-controls-context";
import { useAudioController } from "@/lib/audio-controller-context";
import type { Track } from "@/lib/audio-state-context";
import { useLanguage } from "@/lib/i18n/language-context";

const FETCH_BATCH_SIZE = 5;
const START_TIMEOUT_MS = 20_000;

/**
 * The destination opts in with a real click. Tracks are prefetched BEFORE the
 * click, so the audio engine can start synchronously in that user gesture.
 * A server acknowledgement is sent ONLY after a new engine generation reports
 * status=playing for the requested track. The source keeps playing otherwise.
 */
export function ConnectHandoffPrompt({
    handoff, receivedAtMs, deviceId, onDismiss,
}: {
    handoff: ConnectHandoff;
    receivedAtMs: number;
    deviceId: string;
    onDismiss: () => void;
}) {
    const { locale } = useLanguage();
    const nl = locale === "nl";
    const controls = useAudioControls();
    const controller = useAudioController();
    const [tracks, setTracks] = useState<Track[] | null>(null);
    const [preparing, setPreparing] = useState(true);
    const [starting, setStarting] = useState(false);
    const [startedLocally, setStartedLocally] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const attempt = useRef<{ unsubscribe: () => void; timeout: number } | null>(null);

    useEffect(() => {
        let mounted = true;
        const prefetch = async () => {
            try {
                const found: Track[] = [];
                for (let i = 0; i < handoff.trackIds.length; i += FETCH_BATCH_SIZE) {
                    const ids = handoff.trackIds.slice(i, i + FETCH_BATCH_SIZE);
                    const batch = await Promise.all(ids.map(id => api.getTrack(id)));
                    for (let j = 0; j < batch.length; j++) {
                        const track = batch[j] as unknown as Track;
                        if (!track || track.id !== ids[j] ||
                            !track.title || !track.artist || !track.album ||
                            !Number.isFinite(track.duration)) {
                            throw new Error("Track unavailable");
                        }
                        found.push(track);
                    }
                }
                if (mounted) setTracks(found);
            } catch {
                if (mounted) setMessage(nl
                    ? "De wachtrij is niet volledig beschikbaar. Overdracht is geblokkeerd."
                    : "The complete queue could not be loaded. Transfer is blocked.");
            } finally {
                if (mounted) setPreparing(false);
            }
        };
        void prefetch();
        return () => { mounted = false; };
    }, [handoff.id, handoff.trackIds, nl]);

    useEffect(() => () => {
        if (attempt.current) {
            attempt.current.unsubscribe();
            window.clearTimeout(attempt.current.timeout);
            attempt.current = null;
        }
    }, []);

    // Use the server clock captured at receipt to avoid different clock settings
    // on a phone and a home server invalidating an otherwise live offer.
    const expired = () => Date.now() - receivedAtMs >= handoff.expiresAt - handoff.serverNow;

    const acknowledge = async () => {
        if (!controller || expired()) {
            setMessage(nl ? "Overdracht verlopen." : "Transfer expired.");
            setStarting(false);
            return;
        }
        const track = tracks?.[handoff.currentIndex];
        // Never tell the source to pause unless the correct destination audio
        // is in the playing state, even on an acknowledgement retry.
        const snap = controller.getSnapshot();
        if (!track || snap.status !== "playing" ||
            snap.src?.split("?")[0] !== api.getStreamUrl(track.id).split("?")[0]) {
            setMessage(nl ? "Afspelen is niet bevestigd." : "Playback has not been confirmed.");
            setStarting(false);
            return;
        }
        try {
            await api.updateConnectHandoff(handoff.id, deviceId, "started");
            onDismiss();
        } catch {
            setMessage(nl
                ? "Muziek speelt hier, maar bevestiging mislukte. De bron kan nog afspelen. Probeer opnieuw."
                : "Audio started here, but confirmation failed. The source may still play. Retry acknowledgement.");
            setStarting(false);
        }
    };

    const startHere = () => {
        if (starting || !controller || !tracks || !tracks[handoff.currentIndex]) return;
        if (expired()) {
            setMessage(nl ? "Overdracht verlopen." : "Transfer expired.");
            return;
        }
        setMessage(null);
        setStarting(true);
        const track = tracks[handoff.currentIndex];
        // Advance the offered position by the time the original player has
        // continued playing while the receiver considered the transfer.
        const elapsed = Math.max(0, (handoff.serverNow - handoff.createdAt +
            Date.now() - receivedAtMs) / 1000);
        const position = Math.min(handoff.positionSeconds + elapsed, Math.max(0, track.duration - 0.5));
        const initialGeneration = controller.getSnapshot().generation;
        const expectedPath = api.getStreamUrl(track.id).split("?")[0];
        let handled = false;
        let unsubscribe = () => {};
        let timeout = 0;
        const onSnapshot = (snap: ReturnType<typeof controller.getSnapshot>) => {
            if (handled || snap.generation <= initialGeneration || snap.status !== "playing" ||
                snap.src?.split("?")[0] !== expectedPath) return;
            handled = true;
            unsubscribe();
            window.clearTimeout(timeout);
            attempt.current = null;
            setStartedLocally(true);
            void acknowledge();
        };
        unsubscribe = controller.subscribe(onSnapshot);
        timeout = window.setTimeout(() => {
            if (handled) return;
            handled = true;
            unsubscribe();
            attempt.current = null;
            setStarting(false);
            setMessage(nl
                ? "Dit apparaat heeft het afspelen niet bevestigd. De bron blijft spelen."
                : "This player did not confirm playback. The source keeps playing.");
        }, START_TIMEOUT_MS);
        attempt.current = { unsubscribe, timeout };
        // Synchronous with the actual user click: never remotely auto-play.
        controls.playTracks(tracks, handoff.currentIndex, { seekTo: position });
    };

    const decline = async () => {
        if (starting) return;
        setStarting(true);
        try {
            await api.updateConnectHandoff(handoff.id, deviceId, "declined");
            onDismiss();
        } catch {
            setStarting(false);
            setMessage(nl ? "Weigeren mislukt. Probeer opnieuw." : "Could not decline the transfer.");
        }
    };

    return (
        <div className="fixed inset-x-3 bottom-24 z-[100] mx-auto max-w-sm rounded-2xl border border-amber-400/30 bg-[#171b26] p-4 text-white shadow-2xl"
            role="dialog" aria-label={nl ? "Overdracht van afspelen" : "Playback transfer"}>
            <div className="flex items-start gap-3">
                <ArrowRightLeft size={19} className="mt-1 shrink-0 text-amber-300" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold">{nl ? "Muziek hier overnemen?" : "Play music on this device?"}</h2>
                    <p className="mt-1 text-xs text-white/70">
                        {handoff.sourceName} {nl ? "biedt een overdracht aan." : "offered a playback transfer."}
                    </p>
                    {handoff.trackTitle && <p className="mt-1 truncate text-xs text-amber-200">{handoff.trackTitle}</p>}
                    <p className="mt-1 text-[11px] text-white/55">
                        {handoff.trackIds.length} {nl ? "nummers in de wachtrij" : "tracks in the queue"}
                    </p>
                </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={startHere}
                    disabled={!tracks || preparing || starting || startedLocally || !controller}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-400 px-3 py-2 text-xs font-semibold text-black disabled:opacity-40">
                    {preparing || starting ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                    {preparing
                        ? (nl ? "Wachtrij voorbereiden" : "Preparing queue")
                        : (nl ? "Hier afspelen" : "Play here")}
                </button>
                {startedLocally ? (
                    <button type="button" disabled={starting} onClick={() => { void acknowledge(); }}
                        className="rounded-lg border border-white/25 px-3 py-2 text-xs disabled:opacity-40">
                        {nl ? "Bevestiging opnieuw" : "Retry confirmation"}
                    </button>
                ) : (
                    <button type="button" disabled={starting} onClick={() => { void decline(); }}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/25 px-3 py-2 text-xs disabled:opacity-40">
                        <X size={14} aria-hidden="true" />
                        {nl ? "Weigeren" : "Decline"}
                    </button>
                )}
            </div>
            {message && <p role="status" className="mt-3 text-xs text-white/75">{message}</p>}
            <p className="mt-3 text-[11px] text-white/45">
                {nl
                    ? "De bron stopt pas nadat dit apparaat daadwerkelijk muziek afspeelt en de bevestiging ontvangt."
                    : "The source pauses only after this device starts playback and the receipt is delivered."}
            </p>
        </div>
    );
}
