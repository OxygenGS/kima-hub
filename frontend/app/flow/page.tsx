"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AudioLines, Compass, Disc3, Music2, Play, RefreshCw, SlidersHorizontal } from "lucide-react";
import { api, type NovaFlowPreview, type NovaFlowReason, type NovaFlowStyle } from "@/lib/api";
import { useAudioState } from "@/lib/audio-state-context";
import { useAudioControls } from "@/lib/audio-controls-context";
import { useAudioPlayback } from "@/lib/audio-playback-context";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/i18n/language-context";
import { Button } from "@/components/ui/Button";

type Prepared = { key: string; ownerId: string; preview: NovaFlowPreview };

const COPY = {
    en: {
        title: "Kima Flow", subtitle: "Press play. Let your own music surprise you.",
        note: "A new way to listen, powered by your library and the Vibe engine.",
        familiar: "My favorites", balanced: "A bit of both", adventurous: "Surprise me",
        energy: "Energy", discovery: "Discovery",
        calm: "Relaxed", intense: "Energetic", known: "Familiar", unknown: "More discoveries",
        preview: "Your next listening session", current: "Start with the song you're listening to",
        recent: "Start with recently played or library music",
        preparing: "Finding music that fits...", empty: "No playable library tracks found. Check your music scan.",
        failed: "Flow could not be prepared. Check your library and try again.",
        retry: "Try again", refresh: "Refresh selection", play: "Start Flow",
        continuing: "Keep playing current song with this Flow",
        more: "Preview tracks", tracks: "tracks", library: "Your library only · no automatic downloads",
        advanced: "Explore the Vibe map", already: "Flow queue ready in the player",
        seed: "Starting song", favorite: "A favorite of yours", "new-to-you": "Less familiar to you",
        similar: "Fits the sound", energyReason: "Matches the energy", "library-pick": "From your library",
        note2: "While Flow is active, Kima keeps your queue supplied. Editing the queue or switching modes stops automatic refill; the music keeps playing. Explicit feedback learning is planned next.",
        running: "Continuous Flow is active", stop: "Stop automatic Flow",
    },
    nl: {
        title: "Kima Flow", subtitle: "Druk op afspelen. Laat je eigen muziek je verrassen.",
        note: "Een nieuwe manier om te luisteren, met je bibliotheek en de Vibe-engine.",
        familiar: "Mijn favorieten", balanced: "Van allebei wat", adventurous: "Verras me",
        energy: "Energie", discovery: "Ontdekken",
        calm: "Rustig", intense: "Energiek", known: "Vertrouwd", unknown: "Meer ontdekkingen",
        preview: "Jouw volgende luistersessie", current: "Begin bij het nummer dat je nu luistert",
        recent: "Begin met recent beluisterde muziek of je bibliotheek",
        preparing: "Ik zoek muziek die bij je past...", empty: "Geen afspeelbare nummers gevonden. Controleer je bibliotheekscan.",
        failed: "Flow voorbereiden mislukt. Controleer je bibliotheek en probeer opnieuw.",
        retry: "Opnieuw proberen", refresh: "Andere selectie", play: "Start Flow",
        continuing: "Ga verder met dit nummer en deze Flow",
        more: "Voorproefje van nummers", tracks: "nummers", library: "Alleen je eigen muziek · geen automatische downloads",
        advanced: "Bekijk de Vibe-kaart", already: "Flow-wachtrij staat klaar in de speler",
        seed: "Startnummer", favorite: "Een van je favorieten", "new-to-you": "Nog niet vaak gehoord",
        similar: "Past bij het geluid", energyReason: "Past bij de energie", "library-pick": "Uit je bibliotheek",
        note2: "Zolang Flow actief is, blijft Kima de wachtrij aanvullen. Handmatig bewerken of van modus wisselen stopt het aanvullen; je muziek speelt door. Leren van directe feedback volgt later.",
        running: "Continuous Flow is actief", stop: "Automatisch aanvullen stoppen",
    },
} as const;

function reasonLabel(reason: NovaFlowReason, text: typeof COPY.en | typeof COPY.nl) {
    if (reason === "energy") return text.energyReason;
    return text[reason];
}

export default function FlowPage() {
    const { locale } = useLanguage();
    const text = COPY[locale];
    const { user } = useAuth();
    const { playbackType, currentTrack, queue, currentIndex, activeOperation, setActiveOperation, setIsShuffle, setRepeatMode } = useAudioState();
    const { isPlaying } = useAudioPlayback();
    const { playTracks, setUpcoming, resumeWithGesture } = useAudioControls();

    const [style, setStyle] = useState<NovaFlowStyle>("balanced");
    const [energy, setEnergy] = useState(55);
    const [discovery, setDiscovery] = useState(35);
    const [generation, setGeneration] = useState(0);
    const [prepared, setPrepared] = useState<Prepared | null>(null);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);
    const [startedKey, setStartedKey] = useState<string | null>(null);

    const seedTrackId = playbackType === "track" ? currentTrack?.id : undefined;
    const requestKey = `${user?.id ?? ""}:${seedTrackId ?? ""}:${style}:${energy}:${discovery}:${generation}`;
    const preview = prepared && prepared.ownerId === user?.id && prepared.key === requestKey
        ? prepared.preview : null;

    useEffect(() => {
        if (!user?.id) return;
        const ctrl = new AbortController();
        const timer = window.setTimeout(() => {
            setLoading(true);
            setFailed(false);
            void api.getNovaFlowPreview({
                seedTrackId, style, energy, discovery, limit: 25,
            }, ctrl.signal).then(result => {
                if (!ctrl.signal.aborted) setPrepared({ key: requestKey, ownerId: user.id, preview: result });
            }).catch(() => {
                if (!ctrl.signal.aborted) setFailed(true);
            }).finally(() => {
                if (!ctrl.signal.aborted) setLoading(false);
            });
        }, 260);
        return () => {
            window.clearTimeout(timer);
            ctrl.abort();
        };
    }, [user?.id, seedTrackId, style, energy, discovery, generation, requestKey]);

    // Never play in an async response callback: browser autoplay rules require
    // a deliberate user gesture. Reuse the one canonical audio engine.
    const startFlow = () => {
        if (!preview?.tracks.length || !user?.id) return;
        const tracks = preview.tracks.map(({ reason: _reason, ...track }) => ({
            ...track, album: { ...track.album, coverArt: track.album.coverArt ?? undefined },
        }));
        const canContinue = playbackType === "track" && currentTrack?.id === tracks[0]?.id
            && queue[currentIndex]?.id === currentTrack?.id;
        setIsShuffle(false); // Keep the music journey's intentional sequence.
        setRepeatMode("off"); // Never let a previous repeat-one setting trap the Flow.
        if (canContinue) {
            setUpcoming(tracks.slice(1), true);
            if (!isPlaying) resumeWithGesture();
        } else {
            playTracks(tracks, 0);
        }
        const sessionTracks = canContinue ? [currentTrack!, ...tracks.slice(1)] : tracks;
        // The session exists only in this authenticated browser. Switching
        // accounts or editing the generated queue cancels background refill.
        setActiveOperation({
            type: "flow",
            ownerId: user.id,
            sessionId: typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
            sourceTrackId: tracks[0].id,
            style,
            energy,
            discovery,
            trackIds: sessionTracks.map(track => track.id),
            recentTrackIds: sessionTracks.map(track => track.id),
        });
        setStartedKey(requestKey);
    };

    const isFlowActive = activeOperation.type === "flow" && activeOperation.ownerId === user?.id;

    const modes = useMemo(() => [
        { value: "familiar" as const, label: text.familiar },
        { value: "balanced" as const, label: text.balanced },
        { value: "adventurous" as const, label: text.adventurous },
    ], [text]);

    return (
        <div className="min-h-full space-y-6 pb-24 animate-rise">
            <div className="relative overflow-hidden rounded-3xl border border-brand/20 bg-[var(--bg-secondary)] p-6 sm:p-8">
                <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-brand/10 blur-3xl" />
                <div className="relative flex items-start justify-between gap-4">
                    <div className="space-y-3">
                        <div className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
                            <AudioLines size={14} aria-hidden="true" /> Project NOVA
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl">{text.title}</h1>
                        <p className="max-w-2xl text-base text-[var(--text-secondary)]">{text.subtitle}</p>
                        <p className="max-w-2xl text-sm text-[var(--text-muted)]">{text.note}</p>
                    </div>
                    <Disc3 size={50} strokeWidth={1} className="hidden shrink-0 text-brand/50 sm:block" aria-hidden="true" />
                </div>
            </div>

            <section aria-label={text.title} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                <div className="space-y-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5 sm:p-6">
                    <div className="flex items-center gap-2 text-base font-semibold">
                        <SlidersHorizontal size={18} className="text-brand" aria-hidden="true" />
                        {text.title}
                    </div>
                    <fieldset className="space-y-2">
                        <legend className="mb-2 text-sm text-[var(--text-secondary)]">
                            {locale === "nl" ? "Wat wil je horen?" : "What would you like to hear?"}
                        </legend>
                        <div className="grid grid-cols-3 gap-2">
                            {modes.map((mode) => (
                                <button type="button" key={mode.value} onClick={() => setStyle(mode.value)}
                                    aria-pressed={style === mode.value}
                                    className={`min-h-12 rounded-xl border px-2 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-brand ${style === mode.value
                                        ? "border-brand bg-brand/15 text-brand"
                                        : "border-white/10 bg-white/5 text-[var(--text-secondary)] hover:bg-white/10"}`}>
                                    {mode.label}
                                </button>
                            ))}
                        </div>
                    </fieldset>
                    <div className="space-y-2">
                        <label htmlFor="flow-energy" className="flex justify-between gap-3 text-sm font-medium">
                            <span>{text.energy}</span><span className="tabular-nums text-brand">{energy}%</span>
                        </label>
                        <input id="flow-energy" type="range" min="0" max="100" step="5" value={energy}
                            onChange={(e) => setEnergy(Number(e.target.value))}
                            className="w-full accent-brand" />
                        <div className="flex justify-between text-xs text-[var(--text-muted)]"><span>{text.calm}</span><span>{text.intense}</span></div>
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="flow-discovery" className="flex justify-between gap-3 text-sm font-medium">
                            <span>{text.discovery}</span><span className="tabular-nums text-brand">{discovery}%</span>
                        </label>
                        <input id="flow-discovery" type="range" min="0" max="100" step="5" value={discovery}
                            onChange={(e) => setDiscovery(Number(e.target.value))}
                            className="w-full accent-brand" />
                        <div className="flex justify-between text-xs text-[var(--text-muted)]"><span>{text.known}</span><span>{text.unknown}</span></div>
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">
                        {seedTrackId ? text.current : text.recent}
                    </p>
                    <Button variant="secondary" className="w-full" disabled={loading}
                        onClick={() => setGeneration(n => n + 1)}>
                        <RefreshCw size={16} aria-hidden="true" /> {text.refresh}
                    </Button>
                    <Link href="/vibe" className="inline-flex min-h-11 items-center gap-2 text-sm text-[var(--text-secondary)] underline-offset-4 hover:text-brand hover:underline">
                        <Compass size={16} aria-hidden="true" /> {text.advanced}
                    </Link>
                </div>

                <div className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5 sm:p-6" aria-live="polite">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-semibold">{text.preview}</h2>
                            <p className="text-xs text-[var(--text-muted)]">{text.library}</p>
                        </div>
                        <Music2 className="shrink-0 text-brand" size={24} aria-hidden="true" />
                    </div>
                    {loading && <p role="status" className="py-5 text-sm text-[var(--text-secondary)]">{text.preparing}</p>}
                    {!loading && failed && (
                        <div role="alert" className="space-y-3">
                            <p className="text-sm text-[var(--text-secondary)]">{text.failed}</p>
                            <Button size="sm" onClick={() => setGeneration(n => n + 1)}>{text.retry}</Button>
                        </div>
                    )}
                    {!loading && !failed && preview && preview.tracks.length === 0 && (
                        <p role="status" className="py-5 text-sm text-[var(--text-secondary)]">{text.empty}</p>
                    )}
                    {!loading && !failed && preview && preview.tracks.length > 0 && (
                        <>
                            <p className="text-xs font-semibold text-brand">{preview.tracks.length} {text.tracks}</p>
                            <ol className="space-y-1">
                                {preview.tracks.slice(0, 8).map((track, index) => (
                                    <li key={track.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5">
                                        <span className="w-5 shrink-0 text-xs tabular-nums text-[var(--text-muted)]">{index + 1}</span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium text-[var(--text-primary)]">{track.title}</p>
                                            <p className="truncate text-xs text-[var(--text-secondary)]">{track.artist.name}</p>
                                        </div>
                                        <span className="hidden max-w-28 text-right text-xs text-[var(--text-muted)] sm:block">{reasonLabel(track.reason, text)}</span>
                                    </li>
                                ))}
                            </ol>
                            {preview.tracks.length > 8 && <p className="text-xs text-[var(--text-muted)]">+ {preview.tracks.length - 8} {text.tracks}</p>}
                            <Button variant="primary" size="lg" className="w-full" onClick={startFlow}>
                                <Play size={17} fill="currentColor" aria-hidden="true" />
                                {playbackType === "track" && currentTrack?.id === preview.tracks[0].id && isPlaying
                                    ? text.continuing : text.play}
                            </Button>
                            {startedKey === requestKey && <p role="status" className="text-center text-xs text-[var(--text-secondary)]">{text.already}</p>}
                        </>
                    )}
                </div>
            </section>
            {isFlowActive && (
                <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/25 bg-[var(--bg-secondary)] p-4">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{text.running}</p>
                    <Button size="sm" variant="secondary" onClick={() => setActiveOperation({ type: "idle" })}>
                        {text.stop}
                    </Button>
                </div>
            )}
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">{text.note2}</p>
        </div>
    );
}
