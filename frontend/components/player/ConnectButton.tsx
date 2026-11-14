"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRightLeft, Cast, Loader2, Pause, RefreshCw, SkipBack, SkipForward, X } from "lucide-react";
import { api, type ConnectDevice, type ConnectCommandType } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/i18n/language-context";
import { getConnectDeviceId } from "@/lib/connect-device-id";
import { useAudioState } from "@/lib/audio-state-context";
import { useAudioPlayback } from "@/lib/audio-playback-context";

/** A small account-scoped remote-control surface. Playback stays on the target browser. */
export function ConnectButton({ className = "", placement = "above" }: { className?: string; placement?: "above" | "below" }) {
    const { locale } = useLanguage();
    const { user } = useAuth();
    const audio = useAudioState();
    const playback = useAudioPlayback();
    const [open, setOpen] = useState(false);
    const [devices, setDevices] = useState<ConnectDevice[]>([]);
    const [devicesOwnerId, setDevicesOwnerId] = useState<string | null>(null);
    const [ownId, setOwnId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const nl = locale === "nl";
    const userId = user?.id ?? null;
    const refresh = useCallback(async () => {
        if (!userId) return;
        try {
            const response = await api.getConnectDevices();
            setDevices(response.devices);
            setDevicesOwnerId(userId);
        } catch {
            setDevices([]);
            setDevicesOwnerId(null);
            setMessage(nl ? "Apparaten niet bereikbaar." : "Unable to reach devices.");
        } finally {
            setLoading(false);
        }
    }, [nl, userId]);

    useEffect(() => {
        if (!open || !userId) return;
        setOwnId(getConnectDeviceId(userId));
        setLoading(true);
        void refresh();
        const interval = window.setInterval(() => { void refresh(); }, 10_000);
        return () => window.clearInterval(interval);
    }, [open, refresh, userId]);

    const canHandoff = playback.isPlaying && audio.playbackType === "track" &&
        audio.queue.length > 0 && audio.queue.length <= 50 &&
        audio.currentIndex >= 0 && audio.currentIndex < audio.queue.length &&
        audio.currentTrack?.id === audio.queue[audio.currentIndex]?.id;

    const offerHandoff = async (targetId: string) => {
        const sourceDeviceId = userId ? getConnectDeviceId(userId) : null;
        if (!canHandoff || !sourceDeviceId || sourceDeviceId === targetId || devicesOwnerId !== userId) return;
        setBusy(targetId);
        setMessage(null);
        try {
            await api.offerConnectHandoff({
                sourceDeviceId, targetDeviceId: targetId,
                trackIds: audio.queue.map(track => track.id),
                currentIndex: audio.currentIndex,
                positionSeconds: Math.min(Math.max(0, playback.currentTime),
                    Math.max(0, (audio.currentTrack?.duration ?? 0) - 0.5)),
            });
            setMessage(nl
                ? "Overdracht aangeboden. Bevestig afspelen op het andere apparaat."
                : "Transfer offered. Confirm playback on the other device.");
        } catch {
            setMessage(nl
                ? "Overdracht niet mogelijk. Controleer of beide spelers actief zijn en er geen verzoek openstaat."
                : "Transfer unavailable. Check both players are online and no other request is pending.");
        } finally {
            setBusy(null);
        }
    };

    const send = async (id: string, type: ConnectCommandType) => {
        if (!userId || devicesOwnerId !== userId) return;
        setBusy(id);
        setMessage(null);
        try {
            await api.sendConnectCommand(id, type);
            setMessage(nl ? "Opdracht verstuurd; uitvoering volgt op het andere apparaat." : "Command queued for the other player.");
        } catch {
            setMessage(nl ? "Bediening mislukt. Vernieuw de apparatenlijst." : "Command failed. Refresh the device list.");
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="relative shrink-0">
            <button
                type="button"
                className={className || "inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:text-[var(--color-brand)]"}
                aria-label="Kima Connect"
                title="Kima Connect"
                aria-expanded={open}
                onClick={() => setOpen(v => !v)}
            >
                <Cast size={18} aria-hidden="true" />
            </button>
            {open && userId && (
                <div
                    role="dialog"
                    aria-label="Kima Connect"
                    className={`z-[80] w-[min(350px,90vw)] rounded-2xl border border-white/15 bg-[#171b26] p-4 text-white shadow-2xl ${placement === "below" ? "fixed left-1/2 top-[calc(var(--topbar-h,56px)+var(--standalone-safe-area-top,0px)+8px)] -translate-x-1/2" : "absolute bottom-full right-0 mb-3"}`}
                >
                    <div className="mb-3 flex items-start justify-between gap-2">
                        <div>
                            <h3 className="text-sm font-semibold">Kima Connect</h3>
                            <p className="mt-1 text-xs text-white/60">
                                {nl ? "Bedien je andere actieve Kima-spelers." : "Control your other active Kima players."}
                            </p>
                        </div>
                        <div className="flex items-center">
                            <button
                                type="button"
                                onClick={() => { setLoading(true); void refresh(); }}
                                aria-label={nl ? "Vernieuw apparaten" : "Refresh devices"}
                                title={nl ? "Vernieuwen" : "Refresh"}
                                className="rounded-lg p-1.5 text-white/70 hover:text-white"
                            >
                                {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                            </button>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                aria-label={nl ? "Sluiten" : "Close"}
                                className="rounded-lg p-1.5 text-white/70 hover:text-white"
                            >
                                <X size={15} />
                            </button>
                        </div>
                    </div>
                    {(devicesOwnerId === userId ? devices : []).length === 0 ? (
                        <p className="rounded-lg bg-white/5 p-3 text-xs text-white/70">
                            {loading
                                ? (nl ? "Apparaten laden..." : "Loading devices...")
                                : (nl ? "Nog geen actieve Kima-spelers gevonden." : "No active Kima players found.")}
                        </p>
                    ) : (
                        <ul className="max-h-60 space-y-2 overflow-y-auto">
                            {devicesOwnerId === userId && devices.map(device => {
                                const local = device.id === ownId;
                                return (
                                    <li key={device.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate text-sm font-medium">{device.name}</span>
                                            <span className="shrink-0 text-[11px] text-amber-300">
                                                {local ? (nl ? "Dit apparaat" : "This device")
                                                    : device.status === "playing" ? (nl ? "Speelt af" : "Playing")
                                                    : device.status === "paused" ? (nl ? "Gepauzeerd" : "Paused")
                                                    : (nl ? "Gereed" : "Ready")}
                                            </span>
                                        </div>
                                        {device.trackTitle && <p className="mt-1 truncate text-xs text-white/65" title={device.trackTitle}>{device.trackTitle}</p>}
                                        {!local && (
                                            <div className="mt-3 flex gap-2" aria-label={nl ? "Bediening op afstand" : "Remote controls"}>
                                                {([
                                                    ["previous", SkipBack, nl ? "Vorige nummer" : "Previous track"],
                                                    ["pause", Pause, nl ? "Pauzeren" : "Pause"],
                                                    ["next", SkipForward, nl ? "Volgende nummer" : "Next track"],
                                                ] as const).map(([type, Icon, label]) => (
                                                    <button
                                                        key={type}
                                                        type="button"
                                                        title={label}
                                                        aria-label={label + " - " + device.name}
                                                        disabled={busy !== null || device.status !== "playing"}
                                                        onClick={() => { void send(device.id, type); }}
                                                        className="flex flex-1 items-center justify-center rounded-lg border border-white/15 py-2 text-white/80 hover:border-amber-400/50 hover:text-amber-300 disabled:opacity-40"
                                                    >
                                                        <Icon size={16} aria-hidden="true" />
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {!local && (
                                            <button
                                                type="button"
                                                onClick={() => { void offerHandoff(device.id); }}
                                                disabled={busy !== null || !canHandoff}
                                                title={nl ? "Bied overdracht van muziek aan op dit apparaat" : "Offer playback transfer to this device"}
                                                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2 py-2 text-xs font-medium text-amber-200 hover:bg-amber-400/20 disabled:opacity-40"
                                            >
                                                <ArrowRightLeft size={15} aria-hidden="true" />
                                                {nl ? "Muziek hierheen overzetten" : "Transfer playback here"}
                                            </button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {audio.queue.length > 50 && playback.isPlaying && (
                        <p className="mt-3 text-[11px] text-white/60">
                            {nl ? "Overdracht ondersteunt maximaal 50 nummers per wachtrij." :
                                "Transfer currently supports queues of up to 50 tracks."}
                        </p>
                    )}
                    {message && <p role="status" className="mt-3 text-xs text-white/75">{message}</p>}
                    <p className="mt-3 text-[11px] text-white/50">
                        {nl ? "Alleen apparaten van je eigen account. Afspelen overnemen volgt in een volgende bouwfase."
                            : "Your account's devices only. Playback handoff is a later phase."}
                    </p>
                </div>
            )}
        </div>
    );
}
