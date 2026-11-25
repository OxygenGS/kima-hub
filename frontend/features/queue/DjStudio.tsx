"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Track } from "@/lib/audio-state-context";
import { useLanguage } from "@/lib/i18n/language-context";
import { Button } from "@/components/ui/Button";

type Style = "smooth" | "build" | "cooldown";
type Harmonic = "same" | "neighbor" | "relative" | "different" | "unknown";
interface CueEdge {
    windowMs: number;
    beatsMs: number[];
    tempoBpm: number | null;
    confidence: number | null;
    rmsDb: number[];
}
interface TimingAdvice {
    overlapMs: number;
    incomingFirstBeatMs: number;
    outgoingBeatBeforeEndMs: number;
    matchedBeats: number;
    maxDriftMs: number;
}

/** Only actual measured bins/ticks. No fabricated waveform or beat grid.
 * Tail offsets use the decoded end; intro offsets use the decoded beginning.
 */
function CueStrip({ edge, tail, nl }: { edge: CueEdge | null; tail: boolean; nl: boolean }) {
    const name = tail ? (nl ? "Gemeten outro" : "Measured outro") : (nl ? "Gemeten intro" : "Measured intro");
    if (!edge) return <p className="text-xs text-[var(--text-secondary)]">{name}: {nl ? "onbekend" : "unknown"}</p>;
    const seconds = edge.windowMs / 1000;
    return (
        <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap justify-between gap-1 text-xs">
                <span>{name}</span>
                <span className="tabular-nums text-[var(--text-secondary)]">
                    {edge.tempoBpm === null ? (nl ? "Geen betrouwbare beats" : "No reliable beats") : edge.tempoBpm.toFixed(1) + " BPM"}
                </span>
            </div>
            <svg viewBox="0 0 240 38" className="h-10 w-full rounded bg-[var(--bg-primary)]" role="img"
                aria-label={name + " · " + edge.beatsMs.length + (nl ? " gemeten beats" : " measured beats")}>
                {edge.rmsDb.map((db, index) => {
                    const x = index * 1000 / edge.windowMs * 240;
                    const width = Math.min(1000, edge.windowMs - index * 1000) / edge.windowMs * 240;
                    const height = Math.max(1, Math.max(0, db + 60) / 60 * 34);
                    return <rect key={index} x={x} y={36 - height} width={Math.max(0, width - 0.8)} height={height}
                        className="fill-brand/45" rx="1" />;
                })}
                {edge.beatsMs.map(beat => <line key={beat} x1={beat / edge.windowMs * 240} x2={beat / edge.windowMs * 240}
                    y1={2} y2={36} className="stroke-current opacity-50" strokeWidth={0.6} />)}
            </svg>
            <div className="flex justify-between text-xs text-[var(--text-secondary)] tabular-nums">
                <span>{tail ? "−" + seconds.toFixed(1) + " s" : "0 s"}</span>
                <span>{tail ? (nl ? "Einde" : "End") : seconds.toFixed(1) + " s"}</span>
            </div>
        </div>
    );
}
interface DjEntry {
    track: Track;
    bpm: number | null;
    key: string | null;
    keyScale: string | null;
    energy: number | null;
    transition: { bpmDifference: number | null; harmonic: Harmonic; energyDifference: number | null } | null;
    cue: { version: 1; head: CueEdge | null; tail: CueEdge | null } | null;
    timing: TimingAdvice | null;
}
interface Preview { omittedCount: number; entries: DjEntry[]; }
const MAX_TRACKS = 60;

export function DjStudio({ queue, currentIndex, onPlay }: {
    queue: readonly Track[];
    currentIndex: number;
    onPlay: (tracks: Track[]) => void;
}) {
    const { locale } = useLanguage();
    const nl = locale === "nl";
    const [open, setOpen] = useState(false);
    const [style, setStyle] = useState<Style>("smooth");
    const [preview, setPreview] = useState<{ source: string; style: Style; result: Preview } | null>(null);
    const [pending, setPending] = useState(false);
    const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
    const [failed, setFailed] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const ids = queue.slice(Math.max(0, currentIndex), Math.max(0, currentIndex) + MAX_TRACKS).map(track => track.id);
    const source = JSON.stringify(ids);
    const valid = preview?.source === source && preview.style === style ? preview.result : null;
    useEffect(() => () => { abortRef.current?.abort(); }, []);
    const harmonicLabels: Record<Harmonic, string> = nl
        ? { same: "Zelfde toonsoort", neighbor: "Kwintverwant", relative: "Parallelle majeur/mineur", different: "Andere toonsoort", unknown: "Onbekend" }
        : { same: "Same key", neighbor: "Fifth-related", relative: "Relative major/minor", different: "Different key", unknown: "Unknown" };

    async function prepare() {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setPending(true);
        setFailed(false);
        setPreview(null);
        setExpandedIndex(null);
        try {
            const result = await api.request<Preview>("/vibe/dj/preview", {
                method: "POST",
                body: JSON.stringify({ trackIds: ids, style }),
                signal: controller.signal,
            });
            if (!controller.signal.aborted) setPreview({ source, style, result });
        } catch {
            if (!controller.signal.aborted) setFailed(true);
        } finally {
            if (!controller.signal.aborted) setPending(false);
        }
    }

    return (
        <section className="mb-4 rounded-xl border border-brand/20 bg-[var(--bg-secondary)] p-4" aria-label="DJ Studio">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold">DJ Studio</h2>
                    <p className="text-sm text-[var(--text-secondary)]">
                        {nl ? "Bereid een set voor op basis van tempo, toonsoort en energie." : "Prepare a set using tempo, key and energy."}
                    </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setOpen(v => !v)} aria-expanded={open}>
                    {open ? (nl ? "Sluiten" : "Close") : (nl ? "Set voorbereiden" : "Prepare set")}
                </Button>
            </div>
            {open && <div className="mt-4 space-y-4">
                <p className="text-sm text-[var(--text-secondary)]">
                    {nl ? "Gebruikt maximaal 60 nummers vanaf het geselecteerde nummer. Voorbereiden verandert niets aan de huidige wachtrij. Bekijk hier de metingen. Activeer beatgestuurde crossfade in Sound Lab om tijdens het afspelen een actueel timingadvies te gebruiken. Geen tempo- of frasesynchronisatie." : "Uses up to 60 tracks from the selected track onward. Preparing does not change your queue. Review measurements here. Enable beat-guided crossfade in Sound Lab to use fresh timing advice during playback. No tempo or phrase synchronization."}
                </p>
                <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col gap-1 text-sm">
                        {nl ? "Energieverloop" : "Energy profile"}
                        <select value={style} disabled={pending} onChange={e => setStyle(e.target.value as Style)}
                            className="rounded-lg border border-white/10 bg-[var(--bg-primary)] px-3 py-2">
                            <option value="smooth">{nl ? "Vloeiend" : "Smooth"}</option>
                            <option value="build">{nl ? "Opbouwen" : "Build energy"}</option>
                            <option value="cooldown">{nl ? "Afbouwen" : "Cool down"}</option>
                        </select>
                    </label>
                    <Button variant="secondary" size="sm" disabled={pending || ids.length < 2} onClick={() => void prepare()}>
                        {pending ? (nl ? "Voorbereiden…" : "Preparing…") : (nl ? "Bekijk set" : "Preview set")}
                    </Button>
                </div>
                {ids.length < 2 && <p className="text-sm">{nl ? "Voeg minstens twee nummers toe aan de wachtrij." : "Add at least two tracks to the queue."}</p>}
                {failed && <p role="alert" className="text-sm text-red-400">{nl ? "Set voorbereiden mislukt." : "Could not prepare the set."}</p>}
                {preview && !valid && <p className="text-sm">{nl ? "De selectie of stijl is gewijzigd. Maak een nieuw voorbeeld." : "Selection or style changed. Create a new preview."}</p>}
                {valid && <>
                    <p className="text-sm" role="status">{valid.entries.length} {nl ? "nummers" : "tracks"} · {valid.omittedCount} {nl ? "overgeslagen" : "omitted"}</p>
                    <ol className="max-h-96 space-y-2 overflow-y-auto">
                        {valid.entries.map(({ track, bpm, key, keyScale, transition, cue, timing }, i) =>
                            <li key={track.id + "-" + i} className="rounded-lg border border-white/10 px-3 py-2">
                                <div className="flex flex-wrap justify-between gap-2">
                                    <span className="font-medium">{i + 1}. {track.displayTitle || track.title} — {track.artist.name}</span>
                                    <span className="text-sm tabular-nums text-[var(--text-secondary)]">
                                        {typeof bpm === "number" && Number.isFinite(bpm) && bpm >= 30 && bpm <= 300 ? Math.round(bpm) + " BPM" : "— BPM"} · {key && keyScale ? key + " " + keyScale : "—"}
                                    </span>
                                </div>
                                {transition && <p className="mt-1 text-xs text-[var(--text-secondary)]">
                                    {transition.bpmDifference === null ? (nl ? "Tempo onbekend" : "Unknown tempo") : "Δ " + transition.bpmDifference + " BPM"} · {harmonicLabels[transition.harmonic]}
                                </p>}
                                {i > 0 && <p className="mt-1 text-xs" data-dj-timing={timing ? "measured" : "unknown"}>
                                    {timing
                                        ? (nl ? "Gemeten overlapadvies: " : "Measured overlap advice: ") +
                                            (timing.overlapMs / 1000).toFixed(2) + " s · " + timing.matchedBeats +
                                            (nl ? " passende beats · afwijking maximaal " : " matching beats · drift at most ") + timing.maxDriftMs + " ms"
                                        : (nl ? "Geen betrouwbaar beatadvies — gewone overgang." : "No reliable beat advice — regular transition.")}
                                </p>}
                                <div className="mt-2">
                                    {cue ? <Button size="sm" variant="ghost" aria-expanded={expandedIndex === i}
                                        onClick={() => setExpandedIndex(index => index === i ? null : i)}>
                                        {expandedIndex === i ? (nl ? "Metingen sluiten" : "Close measurements") : (nl ? "Bekijk gemeten intro en outro" : "View measured intro and outro")}
                                    </Button> : <span className="text-xs text-[var(--text-secondary)]">
                                        {nl ? "Nog geen actueel cueprofiel. Wordt aangevuld bij analyse." : "No current cue profile yet. Added during analysis."}
                                    </span>}
                                    {cue && expandedIndex === i && <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <CueStrip edge={cue.head} tail={false} nl={nl} />
                                        <CueStrip edge={cue.tail} tail={true} nl={nl} />
                                        <p className="text-xs text-[var(--text-secondary)] sm:col-span-2">
                                            {nl ? "Balken: gemeten RMS-signaalsterkte per seconde. Lijnen: gedetecteerde beatposities. Geen maat- of frasegrenzen." : "Bars: measured RMS signal level per second. Lines: detected beat positions. Not bar or phrase boundaries."}
                                        </p>
                                    </div>}
                                </div>
                            </li>
                        )}
                    </ol>
                    <Button disabled={valid.entries.length < 2 || pending} onClick={() => onPlay(valid.entries.map(e => e.track))}>
                        {nl ? "Speel deze set vanaf het begin" : "Play this set from the start"}
                    </Button>
                    <p className="text-xs text-[var(--text-secondary)]">{nl ? "Dit vervangt de huidige wachtrij en start de set met de normale speler." : "This replaces your current queue and starts the set in the regular player."}</p>
                </>}
            </div>}
        </section>
    );
}
