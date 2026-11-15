"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRightLeft, Cast, Loader2, Pause, RefreshCw, SkipBack, SkipForward, X } from "lucide-react";
import { api, type ConnectDevice, type ConnectCommandType, type ConnectCommandStatus } from "@/lib/api";
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
    const [pendingOffer, setPendingOffer] = useState<{ id: string; sourceDeviceId: string; ownerId: string } | null>(null);
    const [commandReceipt, setCommandReceipt] = useState<{
        ownerId: string; deviceId: string; id: string;
        status: ConnectCommandStatus; sentAt: number;
    } | null>(null);

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

    // Keep the source menu aligned with the short-lived server handoff state.
    // A completed, declined or expired offer must not leave a stale cancel action.
    useEffect(() => {
        const offer = pendingOffer;
        if (!offer || offer.ownerId !== userId) return;
        let active = true;
        let inFlight = false;

        const check = async () => {
            if (!active || inFlight) return;
            inFlight = true;
            try {
                const { handoff } = await api.getOutgoingConnectHandoff(offer.sourceDeviceId);
                if (!active) return;
                if (!handoff || handoff.id !== offer.id) {
                    setPendingOffer(current =>
                        current?.id === offer.id && current.ownerId === offer.ownerId ? null : current);
                    setMessage(nl
                        ? "De overdracht is niet meer actief (afgerond, geweigerd of verlopen)."
                        : "Transfer is no longer active (completed, declined or expired).");
                } else if (handoff.status === "started") {
                    setMessage(nl
                        ? "Het andere apparaat speelt af. De bron controleert de overdracht."
                        : "The other device is playing. The source is verifying the transfer.");
                }
            } catch {
                // Keep the cancel action available during a temporary API outage.
            } finally {
                inFlight = false;
            }
        };

        void check();
        const interval = window.setInterval(() => { void check(); }, 7_000);
        return () => {
            active = false;
            window.clearInterval(interval);
        };
    }, [pendingOffer, userId, nl]);

    // Follow only the latest command, and never show another account's receipt.
    // A temporary network failure leaves the command unconfirmed, not "handled".
    useEffect(() => {
        const tracked = commandReceipt;
        if (!tracked || tracked.ownerId !== userId || tracked.status !== "queued") return;
        let active = true;
        let inFlight = false;
        const check = async () => {
            if (!active || inFlight) return;
            inFlight = true;
            try {
                const { command } = await api.getConnectCommandReceipt(tracked.id);
                if (active) setCommandReceipt(current =>
                    current?.id === tracked.id && current.ownerId === tracked.ownerId &&
                    current.status === "queued" ? { ...current, status: command.status } : current);
            } catch {
                if (active && Date.now() - tracked.sentAt > 25_000) {
                    setCommandReceipt(current =>
                        current?.id === tracked.id && current.ownerId === tracked.ownerId &&
                        current.status === "queued" ? { ...current, status: "expired" } : current);
                }
            } finally {
                inFlight = false;
            }
        };
        void check();
        const interval = window.setInterval(() => { void check(); }, 2_500);
        return () => {
            active = false;
            window.clearInterval(interval);
        };
    }, [commandReceipt, userId]);

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
            const offered = await api.offerConnectHandoff({
                sourceDeviceId, targetDeviceId: targetId,
                trackIds: audio.queue.map(track => track.id),
                currentIndex: audio.currentIndex,
                positionSeconds: Math.min(Math.max(0, playback.currentTime),
                    Math.max(0, (audio.currentTrack?.duration ?? 0) - 0.5)),
            });
            setPendingOffer({ id: offered.id, sourceDeviceId, ownerId: userId! });
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

    const cancelHandoff = async () => {
        if (!pendingOffer || pendingOffer.ownerId !== userId) return;
        setBusy(pendingOffer.id);
        try {
            await api.updateConnectHandoff(pendingOffer.id, pendingOffer.sourceDeviceId, "cancelled");
            setPendingOffer(null);
            setMessage(nl ? "Overdracht geannuleerd." : "Transfer cancelled.");
        } catch {
            setMessage(nl ? "Annuleren niet mogelijk; het verzoek is mogelijk al afgerond." :
                "Cannot cancel; the transfer may have completed already.");
            setPendingOffer(null);
        } finally {
            setBusy(null);
        }
    };

    const send = async (id: string, type: ConnectCommandType) => {
        if (!userId || devicesOwnerId !== userId) return;
        setBusy(id);
        setMessage(null);
        setCommandReceipt(null);
        try {
            const sent = await api.sendConnectCommand(id, type);
            setCommandReceipt({
                id: sent.commandId, deviceId: id, ownerId: userId,
                status: "queued", sentAt: Date.now(),
            });
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
                    {pendingOffer?.ownerId === userId && (
                        <button type="button" onClick={() => { void cancelHandoff(); }} disabled={busy !== null}
                            className="mt-3 w-full rounded-lg border border-white/20 px-3 py-2 text-xs text-white/70 hover:text-white disabled:opacity-40">
                            {nl ? "Openstaande overdracht annuleren" : "Cancel pending transfer"}
                        </button>
                    )}
                    {commandReceipt?.ownerId === userId && (
                        <p role="status" data-testid="connect-command-status" className="mt-3 text-xs text-white/75">
                            {commandReceipt.status === "queued"
                                ? (nl ? "Opdracht in wachtrij; wacht op ontvangstbevestiging." : "Command queued; awaiting browser receipt.")
                                : commandReceipt.status === "handled"
                                  ? (nl ? "Browser heeft de opdracht verwerkt. Afspeelresultaat niet gegarandeerd."
                                      : "Browser handled the command. Playback outcome is not guaranteed.")
                                  : commandReceipt.status === "ignored"
                                    ? (nl ? "Browser heeft de opdracht genegeerd: speler was niet actief."
                                        : "Browser ignored the command: player was not active.")
                                    : (nl ? "Niet bevestigd binnen 20 seconden; apparaat mogelijk offline of opdracht vervangen."
                                        : "Not confirmed within 20 seconds; device may be offline or command replaced.")}
                        </p>
                    )}
                    {message && <p role="status" className="mt-3 text-xs text-white/75">{message}</p>}
                    <p className="mt-3 text-[11px] text-white/50">
                        {nl ? "Alleen apparaten van je eigen account. Overdracht vereist bevestiging op het ontvangende apparaat."
                            : "Your account's devices only. Transfer requires confirmation on the receiving device."}
                    </p>
                </div>
            )}
        </div>
    );
}
