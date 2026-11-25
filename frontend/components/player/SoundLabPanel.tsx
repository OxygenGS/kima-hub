"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { useAudioController } from "@/lib/audio-controller-context";
import { useLanguage } from "@/lib/i18n/language-context";
import { DEFAULT_SOUND_LAB, supportsSoundLab } from "@/lib/sound-lab-session";
import { SOUND_PRESETS, sanitizeSoundLab, type SoundLabSettings, type SoundPreset } from "@/lib/sound-lab-policy";

const noopSubscribe = () => () => {};
const defaultSnapshot = () => DEFAULT_SOUND_LAB;
const serverSupport = () => false;
const PRESETS: SoundPreset[] = ["flat", "bass", "voice", "warm", "custom"];
const BANDS = ["lowDb", "midDb", "highDb"] as const;

/** Device sound settings, shared by the queue and Playback settings. No server
 * preferences, account data or original audio files are modified.
 */
export function SoundLabPanel() {
    const controller = useAudioController();
    const session = controller?.soundLab;
    const { locale } = useLanguage();
    const nl = locale === "nl";
    const supported = useSyncExternalStore(noopSubscribe, supportsSoundLab, serverSupport);
    const { settings, status } = useSyncExternalStore(session?.subscribe ?? noopSubscribe, session?.getSnapshot ?? defaultSnapshot, defaultSnapshot);
    const [open, setOpen] = useState(false);
    const [peak, setPeak] = useState(0);
    const measuring = open && (status === "active" || status === "bypass");

    useEffect(() => {
        if (!measuring || !session) return;
        const timer = setInterval(() => {
            if (document.visibilityState !== "hidden") setPeak(session.readPeak());
        }, 250);
        return () => clearInterval(timer);
    }, [measuring, session]);

    const apply = (patch: Partial<SoundLabSettings>) => {
        void session?.apply(sanitizeSoundLab({ ...settings, ...patch }));
    };
    const presetLabels: Record<SoundPreset, string> = {
        flat: nl ? "Neutraal" : "Flat",
        bass: "Bass",
        voice: nl ? "Stem" : "Voice",
        warm: nl ? "Warm" : "Warm",
        custom: nl ? "Eigen instelling" : "Custom",
    };
    const bandLabels = nl ? ["Laag · 120 Hz", "Midden · 1 kHz", "Hoog · 6 kHz"] : ["Low · 120 Hz", "Mid · 1 kHz", "High · 6 kHz"];
    const statusLabels = nl ? {
        off: "Uit — originele speler",
        starting: "Audioketen activeren…",
        active: "Sound Lab actief",
        bypass: "Bypass actief",
        unsupported: "Niet beschikbaar op dit apparaat",
        interrupted: "Audio onderbroken — hervat handmatig",
        failed: "Audioketen niet beschikbaar — herlaad de pagina indien nodig",
    } : {
        off: "Off — original player",
        starting: "Activating audio chain…",
        active: "Sound Lab active",
        bypass: "Bypass active",
        unsupported: "Unavailable on this device",
        interrupted: "Audio interrupted — resume manually",
        failed: "Audio chain unavailable — reload the page if needed",
    };
    const level = measuring ? peak : 0;
    const db = level > 0 ? Math.max(-90, 20 * Math.log10(level)) : -90;
    const busy = status === "starting";
    const disabled = !supported || !session || busy;

    return (
        <section className="my-3 rounded-xl border border-brand/20 bg-[var(--bg-secondary)] p-4" aria-label="Sound Lab" data-sound-lab>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold">Sound Lab</h2>
                    <p className="text-sm text-[var(--text-secondary)]" role="status" data-sound-status={status}>
                        {!supported ? statusLabels.unsupported : statusLabels[status]}
                    </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setOpen(v => !v)} aria-expanded={open}>
                    {open ? (nl ? "Sluiten" : "Close") : (nl ? "Geluid instellen" : "Sound controls")}
                </Button>
            </div>
            {open && <div className="mt-4 space-y-4">
                <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                    {nl ? "Experimentele desktopfunctie. Geldt alleen voor de Kima-webspeler. Je geluidsprofiel blijft lokaal bewaard; activeren doe je per browsersessie. Bypass gebruikt na activatie dezelfde audioketen zonder effecten. Herlaad de pagina voor volledig origineel afspelen." : "Experimental desktop feature. Applies only to Kima web playback. Your sound profile stays on this device; activation is per browser session. After activation, bypass uses the same audio chain without effects. Reload the page for the original native route."}
                </p>
                <Button size="sm" variant={settings.enabled ? "secondary" : "primary"}
                    disabled={!supported || !session} onClick={() => apply({ enabled: !settings.enabled })}>
                    {busy ? (nl ? "Annuleren" : "Cancel activation") : settings.enabled ? (nl ? "Sound Lab omzeilen" : "Bypass Sound Lab") : (nl ? "Sound Lab activeren" : "Enable Sound Lab")}
                </Button>
                <label className="flex flex-col gap-1 text-sm">
                    {nl ? "Geluidsprofiel" : "Sound profile"}
                    <select value={settings.preset} disabled={disabled} onChange={event => {
                        const preset = event.target.value as SoundPreset;
                        apply(preset === "custom" ? { preset } : { preset, ...SOUND_PRESETS[preset] });
                    }} className="w-full rounded-lg border border-white/10 bg-[var(--bg-primary)] px-3 py-2">
                        {PRESETS.map(preset => <option key={preset} value={preset}>{presetLabels[preset]}</option>)}
                    </select>
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {BANDS.map((band, index) => <label key={band} className="min-w-0 space-y-1 text-sm">
                        <span className="flex flex-wrap justify-between gap-1">{bandLabels[index]}<span className="tabular-nums">{settings[band] > 0 ? "+" : ""}{settings[band]} dB</span></span>
                        <input type="range" aria-label={bandLabels[index]} className="w-full accent-brand" min={-6} max={6} step={1}
                            value={settings[band]} disabled={disabled} onChange={event => apply({ preset: "custom", [band]: Number(event.target.value) })} />
                    </label>)}
                </div>
                <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={settings.nightMode} disabled={disabled} onChange={event => apply({ nightMode: event.target.checked })} />
                    {nl ? "Nachtmodus (kleiner dynamisch bereik)" : "Night mode (reduced dynamic range)"}
                </label>
                <div className="space-y-1">
                    <div className="flex justify-between text-xs text-[var(--text-secondary)]">
                        <span>{nl ? "Uitgangssignaal" : "Output signal"}</span>
                        <span data-sound-peak={level.toFixed(6)} className="tabular-nums">{level > 0 ? Math.round(db) + " dBFS" : "—"}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                        <div className="h-full rounded-full bg-brand" style={{ width: Math.max(0, (db + 90) / 90) * 100 + "%" }} />
                    </div>
                </div>
            </div>}
        </section>
    );
}
