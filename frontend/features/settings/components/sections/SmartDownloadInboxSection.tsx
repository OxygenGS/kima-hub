"use client";

import { useState } from "react";
import Link from "next/link";
import { api, type SmartDownloadInbox, type SmartDownloadInboxItem, type SmartImportSuggestion, type SmartImportSuggestionEvidence, type ConfirmSmartImportRepair } from "@/lib/api";
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
    relinked: "Manually linked",
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
    "manual-relink": "This album link was approved manually and can be undone.",
    "repair-inconsistent": "The stored repair no longer matches this track; do not change it without review.",
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
    const [mutatingId, setMutatingId] = useState<string | null>(null);
    const [mutationErrors, setMutationErrors] = useState<Record<string, string>>({});
    const [resultNotice, setResultNotice] = useState<string | null>(null);

    const inspect = async () => {
        if (busy) return;
        setBusy(true);
        setError(false);
        try {
            setInbox(await api.getSmartDownloadInbox());
            setSuggestions({});
            setSuggestionErrors({});
            setMutationErrors({});
            setResultNotice(null);
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

    const refreshAfterMutation = async () => {
        try {
            setInbox(await api.getSmartDownloadInbox());
            setSuggestions({});
            setSuggestionErrors({});
        } catch {
            // A completed write is not failed just because the fresh report
            // could not be fetched. Preserve the success notice.
            setError(true);
        }
    };

    const applyRepair = async (jobId: string, confirmation: ConfirmSmartImportRepair) => {
        if (mutatingId || busy) return;
        setMutatingId(jobId);
        setMutationErrors((prev) => ({ ...prev, [jobId]: "" }));
        try {
            await api.confirmSmartImportRepair(jobId, confirmation);
        } catch (err) {
            setMutationErrors((prev) => ({ ...prev, [jobId]:
                err instanceof Error ? err.message : t("Album link failed. Refresh the proposal and retry.") }));
            setMutatingId(null);
            return;
        }
        setResultNotice(t("Album link updated. You can undo it from this inbox."));
        await refreshAfterMutation();
        setMutatingId(null);
    };

    const undoRepair = async (jobId: string, repairId: string) => {
        if (mutatingId || busy) return;
        setMutatingId(jobId);
        setMutationErrors((prev) => ({ ...prev, [jobId]: "" }));
        try {
            await api.undoSmartImportRepair(jobId, repairId);
        } catch (err) {
            setMutationErrors((prev) => ({ ...prev, [jobId]:
                err instanceof Error ? err.message : t("Undo failed. Refresh the inbox and retry.") }));
            setMutatingId(null);
            return;
        }
        setResultNotice(t("Original album link restored."));
        await refreshAfterMutation();
        setMutatingId(null);
    };

    const stats = inbox && [
        { label: t("Indexed"), count: inbox.items.filter((i) => i.stage === "indexed").length },
        { label: t("Needs review"), count: inbox.items.filter((i) => i.stage === "review").length },
        { label: t("Not yet indexed"), count: inbox.items.filter((i) => i.stage === "awaiting-index").length },
        { label: t("Download failed"), count: inbox.items.filter((i) => i.stage === "failed").length },
        { label: t("Manually linked"), count: inbox.items.filter((i) => i.stage === "relinked").length },
    ];

    return (
        <SettingsSection
            id="smart-download-inbox"
            title={t("Smart Download Inbox")}
            description={t("Check the indexing status of your own Soulseek downloads.")}
        >
            <div className="space-y-4 rounded-lg border border-white/10 bg-white/[0.02] p-4">
                <button type="button" onClick={() => { void inspect(); }} disabled={busy || mutatingId !== null}
                    className="rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50">
                    {busy ? t("Checking imports...") : t("Check Soulseek imports")}
                </button>
                <p className="text-xs text-[var(--text-muted)]">
                    {t("Reviewing does not change files. Album links are changed only after explicit confirmation, and can be undone.")}
                </p>
                {busy && <p role="status" className="text-xs text-[var(--text-secondary)]">{t("Checking imports...")}</p>}
                {error && <p role="alert" className="text-xs text-red-400">{t("Import check failed. Try again.")}</p>}
                {resultNotice && <p role="status" className="text-xs text-emerald-300">{resultNotice}</p>}
                {inbox && <div className="space-y-4" aria-live="polite">
                    <p className="text-xs text-[var(--text-muted)]">
                        {t("Showing")} {inbox.displayed} {t("of")} {inbox.total} {t("Soulseek downloads")}.
                        {inbox.total > inbox.limit ? " " + t("Only the latest 25 are inspected.") : ""}
                    </p>
                    {stats && <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
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
                                            disabled={checkingId !== null || mutatingId !== null}
                                            onClick={() => { void checkSuggestion(item.id); }}
                                            className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/10 disabled:opacity-50">
                                            {checkingId === item.id ? t("Finding match...") : t("Find possible match")}
                                        </button>
                                        {suggestionErrors[item.id] && <p role="alert" className="mt-2 text-xs text-red-400">
                                            {t("Suggestion check failed. Try again.")}
                                        </p>}
                                        {suggestions[item.id] && <div className="mt-3 space-y-2 rounded-md border border-white/10 bg-white/[0.03] p-3">
                                            <SuggestionDetails proposal={suggestions[item.id]} />
                                            <RepairConfirmation
                                                proposal={suggestions[item.id]}
                                                isMutating={mutatingId !== null}
                                                onApply={(confirmation) => { void applyRepair(item.id, confirmation); }}
                                            />
                                            <p className="text-xs text-[var(--text-muted)]">
                                                {t("Only the database album link changes after confirmation. Files and tags stay intact.")}
                                            </p>
                                        </div>}
                                    </div>}
                                    {item.stage === "relinked" && item.repairId && (
                                        <UndoConfirmation
                                            repairId={item.repairId}
                                            isMutating={mutatingId !== null}
                                            onUndo={() => { void undoRepair(item.id, item.repairId!); }}
                                        />
                                    )}
                                    {mutationErrors[item.id] && <p role="alert" className="mt-2 text-xs text-red-400">
                                        {mutationErrors[item.id]}
                                    </p>}
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

function SuggestionDetails({ proposal }: { proposal: SmartImportSuggestion }) {
    const { t } = useLanguage();
    if (proposal.status !== "suggested" || !proposal.proposedArtist) {
        return <p className="text-xs text-[var(--text-muted)]">
            {proposal.status === "conflict"
                ? t("Artist metadata conflicts with the download folder. No suggestion is made.")
                : proposal.status === "no-match"
                    ? t("No reliable match found in the indexed library.")
                    : t("This import is not eligible for a suggestion.")}
        </p>;
    }

    // Narrow nullable fields once, rather than re-indexing a state dictionary.
    const artist = proposal.proposedArtist;
    const album = proposal.proposedAlbum;
    return <>
        <p className="text-xs font-semibold text-white">{t("Possible match (not verified)")}</p>
        {proposal.current && <p className="text-xs text-[var(--text-muted)]">
            {t("Current import")}: {proposal.current.artist} · {proposal.current.album}
        </p>}
        <p className="text-xs text-[var(--text-secondary)]">{t("Suggested artist")}: {artist.name}</p>
        {album && <p className="text-xs text-[var(--text-secondary)]">
            {t("Suggested album")}: {album.title}
        </p>}
        <ul className="list-disc space-y-1 pl-4 text-xs text-[var(--text-muted)]">
            {proposal.evidence.map((evidence) => <li key={evidence}>{t(evidenceText[evidence])}</li>)}
        </ul>
        <div className="flex flex-wrap gap-3 text-xs">
            <Link className="text-brand hover:underline"
                href={"/artist/" + encodeURIComponent(artist.id)}>{t("Compare artist")}</Link>
            {album && <Link className="text-brand hover:underline"
                href={"/album/" + encodeURIComponent(album.id)}>{t("Compare album")}</Link>}
        </div>
    </>;
}


function RepairConfirmation({
    proposal, isMutating, onApply,
}: {
    proposal: SmartImportSuggestion;
    isMutating: boolean;
    onApply: (input: ConfirmSmartImportRepair) => void;
}) {
    const { t } = useLanguage();
    const [isConfirming, setIsConfirming] = useState(false);
    if (proposal.status !== "suggested" || !proposal.current || !proposal.proposedAlbum ||
        proposal.current.albumId === proposal.proposedAlbum.id) {
        return null;
    }

    const source = proposal.current;
    const target = proposal.proposedAlbum;
    const confirmation: ConfirmSmartImportRepair = {
        trackId: source.trackId,
        previousAlbumId: source.albumId,
        newAlbumId: target.id,
        fileModified: source.fileModified,
        fileSize: source.fileSize,
    };

    if (!isConfirming) return (
        <button type="button" onClick={() => setIsConfirming(true)}
            disabled={isMutating}
            className="rounded-md border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/10 disabled:opacity-50">
            {t("Prepare album link")}
        </button>
    );

    return <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <p className="text-xs font-medium text-white">{t("Confirm album link change?")}</p>
        <p className="break-words text-xs text-[var(--text-secondary)]">
            {source.artist} · {source.album} → {proposal.proposedArtist?.name} · {target.title}
        </p>
        <p className="text-xs text-[var(--text-muted)]">
            {t("This changes one indexed track's album assignment, not its audio file or tags. Confirm only after comparing the proposed album.")}
        </p>
        <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onApply(confirmation)} disabled={isMutating}
                className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500/20 disabled:opacity-50">
                {isMutating ? t("Applying...") : t("Confirm album link")}
            </button>
            <button type="button" onClick={() => setIsConfirming(false)} disabled={isMutating}
                className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-white/10">
                {t("Cancel")}
            </button>
        </div>
    </div>;
}

function UndoConfirmation({
    repairId, isMutating, onUndo,
}: {
    repairId: string;
    isMutating: boolean;
    onUndo: () => void;
}) {
    const { t } = useLanguage();
    const [isConfirming, setIsConfirming] = useState(false);

    if (!isConfirming) return (
        <button type="button" disabled={isMutating}
            onClick={() => setIsConfirming(true)}
            className="mt-3 rounded-md border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/10 disabled:opacity-50">
            {t("Undo album link")}
        </button>
    );

    return <div className="mt-3 space-y-2 rounded-md border border-amber-500/30 p-3">
        <p className="text-xs text-[var(--text-secondary)]">
            {t("Restore the original indexed album link? The audio file and tags will not change.")}
        </p>
        <p className="sr-only">{repairId}</p>
        <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onUndo} disabled={isMutating}
                className="rounded-md border border-amber-500/40 px-3 py-1.5 text-xs text-white hover:bg-amber-500/10 disabled:opacity-50">
                {isMutating ? t("Restoring...") : t("Confirm undo")}
            </button>
            <button type="button" onClick={() => setIsConfirming(false)} disabled={isMutating}
                className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-white/10">
                {t("Cancel")}
            </button>
        </div>
    </div>;
}
