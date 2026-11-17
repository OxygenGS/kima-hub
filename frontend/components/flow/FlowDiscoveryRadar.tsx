"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Compass, ExternalLink, LoaderCircle } from "lucide-react";
import { api, type NovaDiscoveryResult } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/language-context";
import { Button } from "@/components/ui/Button";
import { FlowAlbumSpotlight } from "./FlowAlbumSpotlight";

type Saved = { key: string; data: NovaDiscoveryResult };

const COPY = {
    en: {
        title: "Beyond your library",
        explanation: "Find similar artists you don't have playable music from yet.",
        action: "Find new artists",
        again: "Find again",
        loading: "Checking music discovery sources...",
        error: "Discovery is unavailable right now. Your music and queue are unchanged.",
        empty: "No confirmed new artists found for this song. Try another song.",
        partial: "Some discovery sources are unavailable, so these results may be incomplete.",
        open: "Explore albums",
        basedOn: "Based on",
        localOnly: "Read-only suggestions. No automatic downloads.",
        unavailable: "Start Flow or play a song to explore related artists.",
    },
    nl: {
        title: "Buiten je bibliotheek",
        explanation: "Ontdek vergelijkbare artiesten waarvan je nog geen afspeelbare muziek hebt.",
        action: "Ontdek nieuwe artiesten",
        again: "Opnieuw ontdekken",
        loading: "Muziekbronnen worden gecontroleerd...",
        error: "Ontdekken is tijdelijk niet beschikbaar. Je muziek en wachtrij veranderen niet.",
        empty: "Geen nieuwe artiesten bevestigd voor dit nummer. Probeer een ander nummer.",
        partial: "Sommige ontdekbronnen zijn niet beschikbaar. De resultaten kunnen onvolledig zijn.",
        open: "Bekijk albums",
        basedOn: "Gebaseerd op",
        localOnly: "Alleen voorstellen. Geen automatische downloads.",
        unavailable: "Start Flow of speel een nummer af om vergelijkbare artiesten te ontdekken.",
    },
} as const;

export function FlowDiscoveryRadar({
    ownerId,
    seedTrackId,
}: {
    ownerId: string | null;
    seedTrackId: string | null;
}) {
    const { locale } = useLanguage();
    const text = COPY[locale];
    const currentKey = `${ownerId ?? ""}:${seedTrackId ?? ""}`;
    const [saved, setSaved] = useState<Saved | null>(null);
    const [loadingKey, setLoadingKey] = useState<string | null>(null);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const pendingRef = useRef<AbortController | null>(null);

    // Account or seed changes invalidate both pending responses and rendered
    // recommendations. Clicking is the ONLY way to contact remote discovery.
    useEffect(() => {
        return () => {
            pendingRef.current?.abort();
            pendingRef.current = null;
        };
    }, [currentKey]);

    const discovery = saved?.key === currentKey ? saved.data : null;
    const loading = loadingKey === currentKey;
    const failed = errorKey === currentKey;

    const search = async () => {
        if (!seedTrackId || !ownerId || loading) return;
        pendingRef.current?.abort();
        const controller = new AbortController();
        pendingRef.current = controller;
        setLoadingKey(currentKey);
        setErrorKey(null);
        try {
            const data = await api.getNovaDiscovery(seedTrackId, 8, controller.signal);
            if (!controller.signal.aborted) {
                setSaved({ key: currentKey, data });
            }
        } catch {
            if (!controller.signal.aborted) setErrorKey(currentKey);
        } finally {
            if (!controller.signal.aborted) setLoadingKey(null);
            if (pendingRef.current === controller) pendingRef.current = null;
        }
    };

    return (
        <section className="space-y-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] p-5 sm:p-6" aria-label={text.title}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                        <Compass size={20} className="text-brand" aria-hidden="true" />
                        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{text.title}</h2>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)]">{text.explanation}</p>
                </div>
                <Button variant="secondary" size="sm"
                    disabled={!ownerId || !seedTrackId || loading}
                    onClick={() => { void search(); }}>
                    {loading ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Compass size={16} aria-hidden="true" />}
                    {discovery ? text.again : text.action}
                </Button>
            </div>
            {!seedTrackId && <p className="text-sm text-[var(--text-muted)]">{text.unavailable}</p>}
            <div aria-live="polite" className="space-y-3">
                {loading && <p role="status" className="text-sm text-[var(--text-secondary)]">{text.loading}</p>}
                {!loading && failed && <p role="alert" className="text-sm text-[var(--text-secondary)]">{text.error}</p>}
                {!loading && discovery && (
                    <>
                        {discovery.seedArtist && <p className="text-xs text-[var(--text-muted)]">{text.basedOn}: {discovery.seedArtist}</p>}
                        {discovery.sourceFailed && <p className="text-xs text-[var(--text-secondary)]">{text.partial}</p>}
                        {discovery.artists.length === 0 && <p role="status" className="text-sm text-[var(--text-secondary)]">{text.empty}</p>}
                        {discovery.artists.length > 0 && (
                            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {discovery.artists.map(artist => (
                                    <li key={artist.mbid || artist.name} className="rounded-xl border border-[var(--border-subtle)] p-3">
                                        <p className="truncate text-sm font-semibold text-[var(--text-primary)]" title={artist.name}>{artist.name}</p>
                                        <Link className="mt-2 inline-flex min-h-10 items-center gap-2 text-sm text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-brand"
                                            href={`/artist/${encodeURIComponent(artist.mbid || artist.name)}`}>
                                            {text.open} <ExternalLink size={14} aria-hidden="true" />
                                        </Link>
                                        {artist.mbid && ownerId && seedTrackId && (
                                            <FlowAlbumSpotlight
                                                key={currentKey + ":" + artist.mbid}
                                                ownerId={ownerId}
                                                seedTrackId={seedTrackId}
                                                artistMbid={artist.mbid}
                                            />
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </>
                )}
            </div>
            <p className="text-xs text-[var(--text-muted)]">{text.localOnly}</p>
        </section>
    );
}
