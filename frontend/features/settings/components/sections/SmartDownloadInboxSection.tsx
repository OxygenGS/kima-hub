"use client";

import { useState } from "react";
import Link from "next/link";
import { api, type SmartDownloadInbox, type SmartDownloadInboxItem, type SmartImportSuggestion, type SmartImportSuggestionEvidence } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import { SettingsSection } from "../ui";

const statuses: Record<SmartDownloadInboxItem["stage"], TranslationKey> = {
    active: "Downloading",
    failed: "Download failed",
    "awaiting-index": "Not yet indexed",
    indexed: "Indexed",
    review: "Needs review",
    unavailable: "File unavailable",
    unverified: "Older download: not verified",
};

const reasons: Record<SmartDownloadInboxItem["reason"], TranslationKey> = {
    "in-progress": "Transfer is still in progress.",
    "download-failed": "The download did not finish successfully.",
    "legacy-untracked": "This older download has no stored file reference.",
    "not-indexed": "The downloaded file has not been found in the library index.",
    "missing-file": "The last library scan marked this file as missing.",
    "corrupt-file": "The last library scan marked this file as corrupt.",
    "discovery-album": "The imported track is linked to a discovery album.",
    "unknown-artist": "The imported track still has an unknown artist.",
    indexed: "The downloaded file has a non-missing library record.",
};

const evidenceText: Record<SmartImportSuggestionEvidence, TranslationKey> = {
    "folder-artist": "Artist matches the download folder.",
    "existing-library-artist": "Artist has existing playable tracks in the library.",
    "folder-album": "Album name matches the download folder.",
    "same-title-duration": "An indexed track has the same title and a compatible duration.",
};

export function SmartDownloadInboxSection() {
    const { t, locale } = useLanguage();
    const [inbox, setInbox] = useState<SmartDownloadInbox | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [suggestions, setSuggestions] = useState<Record<string, SmartImportSuggestion>>({});
    const [checkingId, setCheckingId] = useState<string | null>(null);
    const [suggestionErrors, setSuggestionErrors] = useState<Record<string, boolean>>({});

    const inspect = async () => {
        if (busy) return;
        setBusy(true);
        setError(false);
        try {
            setInbox(await api.getSmartDownloadInbox());
            setSuggestions({});
            setSuggestionErrors({});
        } catch {
            setInbox(null);
            setError(true);
        } finally {
            setBusy(false);
        }
    };

    const checkSuggestion = async (jobId: string) => {
        if (checkingId) return;
        setCheckingId(jobId);
        setSuggestionErrors((previous) => ({ ...previous, [jobId]: false }));
        try {
            const proposal = await api.getSmartImportSuggestion(jobId);
            setSuggestions((previous) => ({ ...previous, [jobId]: proposal }));
        } catch {
            setSuggestionErrors((previous) => ({ ...previous, [jobId]: true }));
        } finally {
            setCheckingId(null);
        }
    };

    const stats = inbox && [
        { label: t("Indexed"), count: inbox.items.filter((i) => i.stage === "indexed").length },
        { label: t("Needs review"), count: inbox.items.filter((i) => i.stage === "review").length },
        { label: t("Not yet indexed"), count: inbox.items.filter((i) => i.stage === "awaiting-index").length },
        { label: t("Download failed"), count: inbox.items.filter((i) => i.stage === "failed").length },
    ];

    return (
        <SettingsSection
            id="smart-download-inbox"
            title={t("Smart Download Inbox")}
            description={t("Check the indexing status of your own Soulseek downloads.")}
        >
            <div className="space-y-4 rounded-lg border border-white/10 bg-white/[0.02] p-4">
                <button type="button" onClick={() => { void inspect(); }} disabled={busy}
                    className="rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50">
                    {busy ? t("Checking imports...") : t("Check Soulseek imports")}
                </button>
                <p className="text-xs text-[var(--text-muted)]">
                    {t("Read-only: shows up to 25 recent downloads. No files are moved, retagged or rescanned.")}
                </p>
                {busy && <p role="status" className="text-xs text-[var(--text-secondary)]">{t("Checking imports...")}</p>}
                {error && <p role="alert" className="text-xs text-red-400">{t("Import check failed. Try again.")}</p>}
                {inbox && <div className="space-y-4" aria-live="polite">
                    <p className="text-xs text-[var(--text-muted)]">
                        {t("Showing")} {inbox.displayed} {t("of")} {inbox.total} {t("Soulseek downloads")}.
                        {inbox.total > inbox.limit ? " " + t("Only the latest 25 are inspected.") : ""}
                    </p>
                    {stats && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {stats.map((metric) => (
                            <div key={metric.label} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                <p className="text-xl font-semibold tabular-nums text-white">{metric.count}</p>
                                <p className="mt-1 text-xs text-[var(--text-muted)]">{metric.label}</p>
                            </div>
                        ))}
                    </div>}
                    {inbox.items.length === 0
                        ? <p className="text-sm text-[var(--text-secondary)]">{t("No recent Soulseek downloads found.")}</p>
                        : <ul className="max-h-96 space-y-2 overflow-y-auto">
                            {inbox.items.map((item) => (
                                <li key={item.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                                        <p className="min-w-0 break-words text-sm font-medium text-white">{item.subject}</p>
                                        <time dateTime={item.createdAt} className="text-xs text-[var(--text-muted)]">
                                            {new Date(item.createdAt).toLocaleString(locale)}
                                        </time>
                                    </div>
                                    <p className="mt-1 text-xs font-medium text-[var(--text-secondary)]">
                                        {t(statuses[item.stage])}
                                    </p>
                                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                                        {t(reasons[item.reason])}
                                    </p>
                                    {item.track && <p className="mt-1 break-words text-xs text-[var(--text-muted)]">
                                        {item.track.artist} · {item.track.album}
                                    </p>}
                                    {item.filePath && <p className="mt-1 break-all text-xs text-[var(--text-muted)]">
                                        {item.filePath}
                                    </p>}
                                    {item.stage === "review" && <div className="mt-3 border-t border-white/10 pt-3">
                                        <button type="button"
                                            disabled={checkingId !== null}
                                            onClick={() => { void checkSuggestion(item.id); }}
                                            className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/10 disabled:opacity-50">
                                            {checkingId === item.id ? t("Finding match...") : t("Find possible match")}
                                        </button>
                                        {suggestionErrors[item.id] && <p role="alert" className="mt-2 text-xs text-red-400">
                                            {t("Suggestion check failed. Try again.")}
                                        </p>}
                                        {suggestions[item.id] && <div className="mt-3 space-y-2 rounded-md border border-white/10 bg-white/[0.03] p-3">
                                            {suggestions[item.id].status === "suggested" && suggestions[item.id].proposedArtist ? <>
                                                <p className="text-xs font-semibold text-white">{t("Possible match (not verified)")}</p>
                                                <p className="text-xs text-[var(--text-secondary)]">
                                                    {t("Suggested artist")}: {suggestions[item.id].proposedArtist.name}
                                                </p>
                                                {suggestions[item.id].proposedAlbum && <p className="text-xs text-[var(--text-secondary)]">
                                                    {t("Suggested album")}: {suggestions[item.id].proposedAlbum.title}
                                                </p>}
                                                <ul className="list-disc space-y-1 pl-4 text-xs text-[var(--text-muted)]">
                                                    {suggestions[item.id].evidence.map((evidence) =>
                                                        <li key={evidence}>{t(evidenceText[evidence])}</li>
                                                    )}
                                                </ul>
                                                <div className="flex flex-wrap gap-3 text-xs">
                                                    <Link className="text-brand hover:underline"
                                                        href={"/artist/" + encodeURIComponent(suggestions[item.id].proposedArtist.id)}>
                                                        {t("Compare artist")}
                                                    </Link>
                                                    {suggestions[item.id].proposedAlbum && <Link className="text-brand hover:underline"
                                                        href={"/album/" + encodeURIComponent(suggestions[item.id].proposedAlbum.id)}>
                                                        {t("Compare album")}
                                                    </Link>}
                                                </div>
                                            </> : <p className="text-xs text-[var(--text-muted)]">
                                                {suggestions[item.id].status === "conflict"
                                                    ? t("Artist metadata conflicts with the download folder. No suggestion is made.")
                                                    : suggestions[item.id].status === "no-match"
                                                        ? t("No reliable match found in the indexed library.")
                                                        : t("This import is not eligible for a suggestion.")}
                                            </p>}
                                            <p className="text-xs text-[var(--text-muted)]">
                                                {t("Review only. No change is applied to the file or library.")}
                                            </p>
                                        </div>}
                                    </div>}

                                </li>
                            ))}
                        </ul>}
                    <p className="text-xs text-[var(--text-muted)]">
                        {t("Indexed means present in the last library index, not a fresh disk check or verified artist match.")}
                    </p>
                </div>}
            </div>
        </SettingsSection>
    );
}
