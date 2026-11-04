"use client";

/**
 * v1.18.0 Download Manager preview.
 * Read-only: no download submission, file moves, imports or remote mutations.
 * Account-keyed subtree prevents previous-user results being displayed after
 * logout/login; the backend independently enforces ownership for both feeds.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, Download, RefreshCw, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getMusicPermissions } from "@/lib/music-permissions";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";

type Phase = "queued" | "processing" | "downloaded" | "failed" | "cancelled" | "unknown";
type Source = "soulseek" | "lidarr" | "unknown";

interface KimaJob {
    id: string;
    subject: string;
    engine: Source;
    phase: Phase;
    progress: null;
    libraryVerification: "not_checked";
    createdAt: string;
}

interface KimaJobs {
    items: KimaJob[];
    total: number;
    displayed: number;
    hasMore: boolean;
    downtifyJobsIncluded: false;
}

type DowntifyState = "disabled" | "unbound" | "misconfigured" | "unauthorized" |
    "unavailable" | "incompatible" | "ready";

interface RemoteJob {
    id: string;
    subject: string;
    engine: "downtify";
    phase: Exclude<Phase, "cancelled">;
    progress: number | null;
    libraryVerification: "not_checked";
}

interface RemoteJobs {
    state: DowntifyState;
    items: RemoteJob[];
    displayed: number;
    hasMore: boolean;
}

const phaseLabel: Record<Phase, TranslationKey> = {
    queued: "Queued",
    processing: "Processing",
    downloaded: "Download complete (index not checked)",
    failed: "Failed",
    cancelled: "Cancelled",
    unknown: "Unknown status",
};
const remoteLabel: Record<Exclude<DowntifyState, "ready">, TranslationKey> = {
    disabled: "Downtify integration is disabled.",
    unbound: "No Downtify account is linked to this user.",
    misconfigured: "Downtify connection settings are incomplete.",
    unauthorized: "Downtify device pairing could not be verified.",
    unavailable: "Downtify is unavailable. Try refreshing.",
    incompatible: "This Downtify API version is not supported.",
};

interface SpotifyLinkPreview {
    provider: "spotify";
    kind: "track" | "album" | "playlist";
    canonicalUrl: string;
    intentKey: string;
    duplicateCheck: "not_checked";
    downloadStarted: false;
    libraryVerification: "not_checked";
    submissionEnabled: false;
}

const POLL_MS = 10_000;

export default function DownloadsPage() {
    const { isAuthenticated, isLoading, user } = useAuth();

    if (isLoading || !isAuthenticated || !user) return null;

    // React unmounts the previous account's data as soon as the user changes.
    return <AccountDownloads key={user.id} canPrepareSpotify={getMusicPermissions(user).canDownloadTracks} />;
}

function AccountDownloads({ canPrepareSpotify }: { canPrepareSpotify: boolean }) {
    const { t, locale } = useLanguage();
    const [kima, setKima] = useState<KimaJobs | null>(null);
    const [downtify, setDowntify] = useState<RemoteJobs | null>(null);
    const [kimaError, setKimaError] = useState(false);
    const [remoteError, setRemoteError] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        let inFlight = false;

        const refresh = async () => {
            if (cancelled || inFlight) return;
            inFlight = true;
            setRefreshing(true);
            // Each section can succeed independently, without obscuring
            // already loaded rows when the other engine fails.
            const [local, remote] = await Promise.allSettled([
                api.get<KimaJobs>("/download-manager/jobs?limit=50&offset=0"),
                api.get<RemoteJobs>("/download-manager/downtify/jobs"),
            ]);
            if (!cancelled) {
                if (local.status === "fulfilled") {
                    setKima(local.value);
                    setKimaError(false);
                } else {
                    setKima(null);
                    setKimaError(true);
                }
                if (remote.status === "fulfilled") {
                    setDowntify(remote.value);
                    setRemoteError(false);
                } else {
                    setDowntify(null);
                    setRemoteError(true);
                }
                setRefreshing(false);
            }
            inFlight = false;
        };

        void refresh();
        const refreshWhenVisible = () => {
            if (document.visibilityState === "visible") void refresh();
        };
        const interval = window.setInterval(refreshWhenVisible, POLL_MS);
        document.addEventListener("visibilitychange", refreshWhenVisible);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
            document.removeEventListener("visibilitychange", refreshWhenVisible);
        };
    }, [reloadKey]);

    const formatTime = (value: string) => {
        const time = new Date(value);
        return Number.isFinite(time.valueOf())
            ? time.toLocaleString(locale === "nl" ? "nl-NL" : "en-GB", {
                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
            })
            : "";
    };

    return (
        <div className="pb-24">
            <PageHeader
                eyebrow={t("Read-only preview")}
                title={t("Download Manager")}
                description={t("Follow your downloads. No downloads, imports or files are changed here.")}
                actions={
                    <button
                        type="button"
                        onClick={() => setReloadKey((n) => n + 1)}
                        disabled={refreshing}
                        className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-50"
                        aria-label={t("Refresh download status")}
                    >
                        <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
                        {t("Refresh")}
                    </button>
                }
            />
            <div className="page-shell space-y-6">
                <p className="flex items-start gap-2 text-sm text-[var(--text-muted)]">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    {t("Only your own jobs are shown. Completed transfers still need library verification.")}
                </p>

                {canPrepareSpotify && <SpotifyLinkIntake />}

                <section aria-labelledby="kima-downloads-title" className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-6">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <h2 id="kima-downloads-title" className="text-lg font-semibold text-white">{t("Kima downloads")}</h2>
                        <span className="text-xs text-[var(--text-muted)]">{kima ? kima.total : ""}</span>
                    </div>
                    {kimaError ? (
                        <StatusMessage text={t("Could not load Kima downloads.")} error />
                    ) : kima === null ? (
                        <StatusMessage text={t("Loading...")} />
                    ) : kima.items.length === 0 ? (
                        <StatusMessage text={t("No recent Kima downloads.")} />
                    ) : (
                        <div className="space-y-2">
                            {kima.items.map((job) => (
                                <DownloadRow
                                    key={job.id} subject={job.subject}
                                    source={job.engine === "soulseek" ? "Soulseek" : job.engine === "lidarr" ? "Lidarr" : t("Unknown source")}
                                    phase={job.phase} date={formatTime(job.createdAt)}
                                />
                            ))}
                            {kima.hasMore && <p className="pt-2 text-xs text-[var(--text-muted)]">{t("Showing the newest 50 jobs.")}</p>}
                        </div>
                    )}
                </section>

                <section aria-labelledby="downtify-downloads-title" className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-6">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <h2 id="downtify-downloads-title" className="text-lg font-semibold text-white">{t("Downtify queue")}</h2>
                        {downtify?.state === "ready" && <span className="text-xs text-[var(--text-muted)]">{downtify.displayed}</span>}
                    </div>
                    {remoteError ? (
                        <StatusMessage text={t("Could not load Downtify status.")} error />
                    ) : downtify === null ? (
                        <StatusMessage text={t("Loading...")} />
                    ) : downtify.state !== "ready" ? (
                        <StatusMessage text={t(remoteLabel[downtify.state])} />
                    ) : downtify.items.length === 0 ? (
                        <StatusMessage text={t("No Downtify jobs for this account.")} />
                    ) : (
                        <div className="space-y-2">
                            {downtify.items.map((job) => (
                                <DownloadRow
                                    key={job.id} subject={job.subject} source="Downtify"
                                    phase={job.phase} progress={job.progress}
                                />
                            ))}
                            {downtify.hasMore && <p className="pt-2 text-xs text-[var(--text-muted)]">{t("Showing up to 100 Downtify jobs.")}</p>}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}

function StatusMessage({ text, error = false }: { text: string; error?: boolean }) {
    return (
        <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-4 py-5 text-sm text-[var(--text-secondary)]" role="status">
            {error ? <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Download className="h-4 w-4 shrink-0" aria-hidden="true" />}
            {text}
        </div>
    );
}

function DownloadRow({ subject, source, phase, date, progress }: {
    subject: string; source: string; phase: Phase; date?: string; progress?: number | null;
}) {
    const { t } = useLanguage();
    const validProgress = typeof progress === "number" && Number.isFinite(progress) && progress >= 0 && progress <= 100;
    return (
        <article className="rounded-xl border border-white/[0.06] bg-black/10 px-4 py-3" aria-label={subject}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-white" title={subject}>{subject}</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {source}{date ? ` · ${date}` : ""}
                    </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-xs text-[var(--text-secondary)]">
                    {phase === "downloaded" ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                    {t(phaseLabel[phase])}
                </span>
            </div>
            {validProgress && (
                <div className="mt-3 flex items-center gap-3">
                    <div
                        role="progressbar" aria-label={t("Transfer progress")}
                        aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}
                        className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"
                    >
                        <div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="min-w-10 text-right text-xs tabular-nums text-[var(--text-muted)]">
                        {Math.round(progress)}%
                    </span>
                </div>
            )}
        </article>
    );
}


/**
 * Preparatory validation only. The backend does NOT look up metadata, query
 * the library or submit the link to Downtify; there is intentionally no
 * action button to trigger a download until dedupe and job ownership exist.
 */
function SpotifyLinkIntake() {
    const { t } = useLanguage();
    const [link, setLink] = useState("");
    const [result, setResult] = useState<SpotifyLinkPreview | null>(null);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState(false);
    const requestEpoch = useRef(0);

    useEffect(() => () => { requestEpoch.current++; }, []);

    const kindLabel: Record<SpotifyLinkPreview["kind"], TranslationKey> = {
        track: "Spotify track",
        album: "Spotify album",
        playlist: "Spotify playlist",
    };

    const check = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!link.trim() || checking) return;

        const epoch = ++requestEpoch.current;
        setChecking(true);
        setResult(null);
        setError(false);
        try {
            const response = await api.post<SpotifyLinkPreview>(
                "/download-manager/spotify/preview", { url: link }
            );
            if (requestEpoch.current === epoch) setResult(response);
        } catch {
            // The server never echoes the invalid link or an upstream secret.
            if (requestEpoch.current === epoch) setError(true);
        } finally {
            if (requestEpoch.current === epoch) setChecking(false);
        }
    };

    return (
        <section aria-labelledby="spotify-intake-title" className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-6">
            <h2 id="spotify-intake-title" className="text-lg font-semibold text-white">
                {t("Check Spotify link")}
            </h2>
            <p className="mb-4 mt-1 text-sm text-[var(--text-muted)]">
                {t("Preview a track, album or playlist link. Downloads are not available yet.")}
            </p>
            <form onSubmit={(event) => { void check(event); }} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                    <label htmlFor="spotify-intake-link" className="mb-2 block text-xs font-medium text-[var(--text-secondary)]">
                        {t("Spotify track, album or playlist link")}
                    </label>
                    <input
                        id="spotify-intake-link"
                        type="text"
                        inputMode="url"
                        autoComplete="off"
                        maxLength={2048}
                        value={link}
                        onChange={(event) => {
                            requestEpoch.current++;
                            setLink(event.target.value);
                            setResult(null);
                            setError(false);
                            setChecking(false);
                        }}
                        placeholder="https://open.spotify.com/track/..."
                        className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-[var(--text-muted)] focus:border-brand focus:outline-none"
                    />
                </div>
                <button
                    type="submit"
                    disabled={!link.trim() || checking}
                    className="rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {checking ? t("Checking link...") : t("Check link")}
                </button>
            </form>
            <div className="mt-3" role="status" aria-live="polite">
                {error ? (
                    <p className="text-sm text-[var(--text-secondary)]">{t("Could not validate this Spotify link.")}</p>
                ) : result ? (
                    <div className="space-y-1 rounded-xl border border-white/10 bg-black/10 p-3 text-sm">
                        <p className="font-medium text-white">{t("Valid Spotify link")}: {t(kindLabel[result.kind])}</p>
                        <p className="break-all text-xs text-[var(--text-secondary)]">{result.canonicalUrl}</p>
                        <p className="text-xs text-[var(--text-muted)]">
                            {t("No download started. Library duplicate detection has not been performed.")}
                        </p>
                    </div>
                ) : null}
            </div>
        </section>
    );
}
