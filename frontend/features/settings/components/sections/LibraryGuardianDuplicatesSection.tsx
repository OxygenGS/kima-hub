"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/i18n/language-context";
import { api, type GuardianEvidence, type LibraryGuardianDuplicateReport } from "@/lib/api";

const COPY = {
    en: {
        title: "Library Guardian — potential duplicate recordings",
        description: "Compare tracks with the same MusicBrainz recording ID. These may be different album editions, so do not delete anything based only on this report.",
        action: "Inspect possible duplicates",
        refresh: "Check again",
        inspecting: "Checking indexed recording evidence...",
        failed: "Duplicate check failed. Nothing in the library was changed.",
        empty: "No repeated MusicBrainz recording IDs found among available local tracks.",
        candidates: "recording groups to review",
        copies: "indexed copies",
        more: "Additional groups exist. Only the strongest candidates are shown.",
        sample: "Examples",
        album: "Review album",
        duration: "Duration",
        path: "Indexed file path",
        warning: "Read-only. A matching recording ID or acoustic fingerprint does not prove files are byte-identical or safe to remove.",
        basis: "Based on the last index. No new disk scan was performed.",
        evidence: {
            "matching-acoustic-fingerprint": "Matching acoustic signature and similar duration",
            "same-recording-close-duration": "Same recording ID, title and similar duration",
            "shared-recording-id": "Same recording ID; versions may differ",
        },
    },
    nl: {
        title: "Library Guardian — mogelijke dubbele opnames",
        description: "Vergelijk nummers met dezelfde MusicBrainz-opname-ID. Verschillende albumuitgaven kunnen terecht naast elkaar bestaan; verwijder niets alleen op basis van dit rapport.",
        action: "Mogelijke dubbelen controleren",
        refresh: "Opnieuw controleren",
        inspecting: "Geïndexeerde opnames worden vergeleken...",
        failed: "Controle mislukt. Er is niets aan de bibliotheek gewijzigd.",
        empty: "Geen herhaalde MusicBrainz-opname-ID's gevonden bij beschikbare lokale nummers.",
        candidates: "groepen om te controleren",
        copies: "geïndexeerde exemplaren",
        more: "Er zijn meer groepen. Alleen de meest voorkomende worden getoond.",
        sample: "Voorbeelden",
        album: "Album bekijken",
        duration: "Speelduur",
        path: "Geïndexeerd bestandspad",
        warning: "Alleen-lezen. Dezelfde opname-ID of akoestische vingerafdruk bewijst niet dat bestanden byte-identiek zijn of veilig verwijderd kunnen worden.",
        basis: "Gebaseerd op de laatste indexering. Er is geen nieuwe schijfscan uitgevoerd.",
        evidence: {
            "matching-acoustic-fingerprint": "Gelijke akoestische kenmerken en vergelijkbare speelduur",
            "same-recording-close-duration": "Dezelfde opname-ID, titel en vergelijkbare speelduur",
            "shared-recording-id": "Dezelfde opname-ID; uitvoeringen kunnen verschillen",
        },
    },
} satisfies Record<"en" | "nl", {
    title: string; description: string; action: string; refresh: string;
    inspecting: string; failed: string; empty: string; candidates: string;
    copies: string; more: string; sample: string; album: string;
    duration: string; path: string; warning: string; basis: string;
    evidence: Record<GuardianEvidence, string>;
}>;

function durationLabel(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "—";
    const mins = Math.floor(seconds / 60);
    return `${mins}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function LibraryGuardianDuplicatesSection() {
    const { user } = useAuth();
    const { locale } = useLanguage();
    const text = COPY[locale];
    const ownerId = user?.id ?? null;
    const [snapshot, setSnapshot] = useState<{ ownerId: string; data: LibraryGuardianDuplicateReport } | null>(null);
    const [pending, setPending] = useState<{ ownerId: string; controller: AbortController } | null>(null);
    const [failedOwner, setFailedOwner] = useState<string | null>(null);
    const pendingRef = useRef<AbortController | null>(null);

    useEffect(() => () => {
        pendingRef.current?.abort();
        pendingRef.current = null;
    }, [ownerId]);

    const report = snapshot?.ownerId === ownerId ? snapshot.data : null;
    const loading = !!ownerId && pending?.ownerId === ownerId && !pending.controller.signal.aborted;
    const failed = !!ownerId && failedOwner === ownerId;

    const inspect = async () => {
        if (!ownerId || loading) return;
        pendingRef.current?.abort();
        const controller = new AbortController();
        pendingRef.current = controller;
        setPending({ ownerId, controller });
        setFailedOwner(null);
        try {
            const result = await api.getLibraryGuardianDuplicates(8, controller.signal);
            if (!controller.signal.aborted) setSnapshot({ ownerId, data: result });
        } catch {
            if (!controller.signal.aborted) {
                setSnapshot(null);
                setFailedOwner(ownerId);
            }
        } finally {
            if (!controller.signal.aborted) setPending(null);
            if (pendingRef.current === controller) pendingRef.current = null;
        }
    };

    const format = (n: number) => new Intl.NumberFormat(locale).format(n);

    return (
        <section className="space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-4" aria-label={text.title}>
            <div className="space-y-1">
                <h3 className="text-base font-semibold text-white">{text.title}</h3>
                <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{text.description}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => { void inspect(); }}
                    disabled={!ownerId || loading}
                    className="min-h-10 rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50">
                    {loading ? text.inspecting : report ? text.refresh : text.action}
                </button>
                {report && <time dateTime={report.generatedAt} className="text-xs text-[var(--text-muted)]">
                    {new Date(report.generatedAt).toLocaleString(locale)}
                </time>}
            </div>
            {loading && <p role="status" className="text-xs text-[var(--text-secondary)]">{text.inspecting}</p>}
            {failed && <p role="alert" className="text-xs text-red-400">{text.failed}</p>}
            {report && (
                <div className="space-y-3" aria-live="polite">
                    <p className="text-sm text-white">
                        {format(report.candidates.length)} {text.candidates}
                    </p>
                    {report.candidates.length === 0 && <p className="text-xs text-[var(--text-secondary)]">{text.empty}</p>}
                    {report.hasMore && <p className="text-xs text-[var(--text-secondary)]">{text.more}</p>}
                    <div className="space-y-2">
                        {report.candidates.map(candidate => (
                            <details key={candidate.recordingMbid} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                                <summary className="cursor-pointer space-y-1 text-sm">
                                    <span className="block font-semibold text-white">
                                        {candidate.tracks[0]?.artistName} — {candidate.tracks[0]?.title}
                                    </span>
                                    <span className="block text-xs text-[var(--text-secondary)]">
                                        {format(candidate.indexedCopies)} {text.copies} · {text.evidence[candidate.evidence]}
                                    </span>
                                </summary>
                                <ul className="mt-3 space-y-2">
                                    {candidate.tracks.map(track => (
                                        <li key={track.id} className="rounded-md bg-white/[0.03] p-3">
                                            <p className="text-sm font-medium text-white">{track.title}</p>
                                            <p className="text-xs text-[var(--text-secondary)]">{track.artistName} · {track.albumTitle}</p>
                                            <p className="mt-1 text-xs text-[var(--text-muted)]">{text.duration}: {durationLabel(track.duration)}</p>
                                            <p className="break-all text-xs text-[var(--text-muted)]">{text.path}: {track.filePath}</p>
                                            <Link href={`/album/${encodeURIComponent(track.albumId)}`}
                                                className="mt-2 inline-flex min-h-10 items-center text-sm text-brand underline-offset-4 hover:underline">
                                                {text.album}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                                <p className="mt-2 break-all text-xs text-[var(--text-muted)]">
                                    MusicBrainz: {candidate.recordingMbid}
                                </p>
                            </details>
                        ))}
                    </div>
                </div>
            )}
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">{text.warning}</p>
            <p className="text-xs text-[var(--text-muted)]">{text.basis}</p>
        </section>
    );
}
