"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, type NovaAlbumSpotlightResult } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/language-context";

const COPY = {
    en: {
        action: "Preview albums",
        again: "Refresh albums",
        loading: "Looking up MusicBrainz albums...",
        unavailable: "Album information is unavailable. Try again.",
        empty: "No verified album entries in this sample.",
        view: "Album details",
        note: "Unranked MusicBrainz catalog entries; not local playable music. Album requests remain separate.",
        title: "Album preview",
    },
    nl: {
        action: "Toon albums",
        again: "Albums verversen",
        loading: "MusicBrainz-albums worden opgezocht...",
        unavailable: "Albumgegevens zijn niet beschikbaar. Probeer opnieuw.",
        empty: "Geen bevestigde albums in deze selectie.",
        view: "Album bekijken",
        note: "MusicBrainz-catalogus, niet gerangschikt en niet lokaal afspeelbaar. Aanvragen gebeurt apart.",
        title: "Albumvoorbeeld",
    },
} as const;

/**
 * Phase 6: source-backed album samples are fetched ONLY on this button click.
 * The parent hides the card when its owner/seed changes; responses are also
 * key-guarded in case a transport ignores AbortSignal.
 */
export function FlowAlbumSpotlight({
    ownerId,
    seedTrackId,
    artistMbid,
}: {
    ownerId: string;
    seedTrackId: string;
    artistMbid: string;
}) {
    const { locale } = useLanguage();
    const text = COPY[locale];
    const key = ownerId + ":" + seedTrackId + ":" + artistMbid;
    const [snapshot, setSnapshot] = useState<{ key: string; value: NovaAlbumSpotlightResult } | null>(null);
    const [loadingKey, setLoadingKey] = useState<string | null>(null);
    const [errorKey, setErrorKey] = useState<string | null>(null);
    const controllerRef = useRef<AbortController | null>(null);

    useEffect(() => () => {
        controllerRef.current?.abort();
        controllerRef.current = null;
    }, [key]);

    const data = snapshot?.key === key ? snapshot.value : null;
    const loading = loadingKey === key;
    const failed = errorKey === key;

    const inspect = async () => {
        if (loading || !ownerId || !seedTrackId) return;
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        setLoadingKey(key);
        setErrorKey(null);
        try {
            const value = await api.getNovaAlbumSpotlight(artistMbid, 3, controller.signal);
            if (!controller.signal.aborted) setSnapshot({ key, value });
        } catch {
            if (!controller.signal.aborted) {
                setSnapshot(null);
                setErrorKey(key);
            }
        } finally {
            if (!controller.signal.aborted) setLoadingKey(null);
            if (controllerRef.current === controller) controllerRef.current = null;
        }
    };

    return (
        <div className="mt-2 space-y-2">
            <button type="button" onClick={() => { void inspect(); }}
                disabled={loading}
                className="inline-flex min-h-10 items-center rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-primary)] hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50">
                {loading ? text.loading : data ? text.again : text.action}
            </button>
            {loading && <p role="status" className="text-xs text-[var(--text-secondary)]">{text.loading}</p>}
            {!loading && failed && <p role="alert" className="text-xs text-red-400">{text.unavailable}</p>}
            {!loading && data && (
                <div className="space-y-2 rounded-lg border border-[var(--border-subtle)] p-2"
                    aria-label={text.title}>
                    {data.sourceFailed && <p role="alert" className="text-xs text-[var(--text-secondary)]">{text.unavailable}</p>}
                    {data.albums.length === 0 && !data.sourceFailed &&
                        <p className="text-xs text-[var(--text-secondary)]">{text.empty}</p>}
                    {data.albums.length > 0 && (
                        <ul className="space-y-2">
                            {data.albums.map(album => (
                                <li key={album.id} className="text-xs">
                                    <p className="font-medium text-[var(--text-primary)]">{album.title}</p>
                                    <p className="text-[var(--text-muted)]">{album.type}{album.year ? " · " + album.year : ""}</p>
                                    <Link className="inline-flex min-h-10 items-center text-brand underline-offset-4 hover:underline"
                                        href={"/album/" + encodeURIComponent(album.id)}>
                                        {text.view}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                    <p className="text-xs leading-relaxed text-[var(--text-muted)]">{text.note}</p>
                </div>
            )}
        </div>
    );
}
