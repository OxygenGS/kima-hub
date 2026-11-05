"use client";

/**
 * v1.18.0 Download Manager preview.
 * Preparation and single-track Downtify submission are separate, opt-in
 * operations. No submission happens automatically when this page loads.
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

interface SavedSpotifyIntent {
    id: string;
    kind: SpotifyLinkPreview["kind"] | "unknown";
    canonicalUrl: string | null;
    requestState: "prepared" | "dispatching" | "dispatch_unknown" |
        "submitted" | "completed" | "failed" | "unknown";
    createdAt: string;
    libraryDuplicateCheck: "not_checked";
    engineStatus: "not_checked";
}
interface SavedSpotifyIntentPage {
    enabled: boolean;
    items: SavedSpotifyIntent[];
    total: number;
    displayed: number;
    hasMore: boolean;
    isDownloadQueue: false;
}
interface PreparedSpotifyIntentResponse {
    id: string;
    status?: SavedSpotifyIntent["requestState"];
    alreadyPrepared: boolean;
    submittedByThisRequest: false;
    downloadStartedByThisRequest: false;
    filesChangedByThisRequest: false;
}

type LibraryEvidenceStatus =
    | "recording_match_on_disk" | "catalog_recording_unverified"
    | "no_verified_match" | "metadata_unavailable"
    | "identity_unavailable" | "not_supported";
interface LibraryEvidence {
    provider: "spotify";
    kind: "track" | "album" | "playlist";
    status: LibraryEvidenceStatus;
    evidence: "isrc_duration_and_file" | "not_proven";
    recordingMatch: boolean;
    audioDecoded: false;
    albumEditionVerified: false;
    matchedTrackId: string | null;
    downloadStarted: false;
}
interface DispatchCapabilityResponse {
    state: "disabled" | "unbound" | "misconfigured" | "available";
    canSubmit: boolean;
    singleTrackOnly: true;
}
type DispatchState = "submitted" | "already_in_remote_queue" | "dispatch_unknown";
interface DispatchResponse {
    state: DispatchState;
    remotePostSent: boolean;
    libraryVerified: false;
    downloadInKimaVerified: false;
}

type ReconciliationState = "disabled" | "unbound" | "misconfigured" | "available" |
    "not_found" | "not_attempted" | "invalid_intent" | "unavailable" |
    "unauthorized" | "incompatible" | "no_verified_job" | "ambiguous" | "verified";
type RemoteTransferPhase = "not_checked" | "queued" | "processing" |
    "downloaded" | "failed" | "unknown";
interface ReconciliationCapability {
    state: "disabled" | "unbound" | "misconfigured" | "available";
    canCheck: boolean;
    singleTrackOnly: true;
}
interface RemoteIntentVerification {
    state: ReconciliationState;
    remotePhase: RemoteTransferPhase;
    remoteOwnershipVerified: boolean;
    libraryVerification: "not_checked";
    playbackVerified: false;
    filesChanged: false;
    retryAllowed: false;
}
type SourceFileState =
    | "disabled" | "unbound" | "misconfigured" | "not_found"
    | "storage_unavailable" | "remote_unverified" | "not_downloaded"
    | "source_path_unavailable" | "external_source_unsupported"
    | "unsafe_source_path" | "source_unavailable" | "candidate_present_unverified";
interface SourceFileCapability {
    state: "disabled" | "unbound" | "misconfigured" | "available";
    canCheck: boolean;
    singleTrackOnly: true;
}
interface SourceFileEvidence {
    state: SourceFileState;
    remotePhase: RemoteTransferPhase;
    regularFileObserved: boolean;
    recordingVerified: false;
    audioDecoded: false;
    stableMountVerified: false;
    libraryImportVerified: false;
    filesChanged: false;
    retryAllowed: false;
}
const sourceFileLabel: Record<SourceFileState, TranslationKey> = {
    disabled: "Downtify integration is disabled.",
    unbound: "No Downtify account is linked to this user.",
    misconfigured: "Downtify connection settings are incomplete.",
    not_found: "Request state not independently verified",
    storage_unavailable: "Staging storage is unavailable or unsafe.",
    remote_unverified: "Remote task ownership could not be verified.",
    not_downloaded: "The remote download is not yet complete.",
    source_path_unavailable: "Downtify did not provide a source filename.",
    external_source_unsupported: "This source is outside the configured download folder.",
    unsafe_source_path: "Unsafe source path or mount. Manual review required.",
    source_unavailable: "Source file not found. It may already have been moved.",
    candidate_present_unverified: "Staging file observed; recording and import are unverified.",
};

const reconciliationLabel: Record<Exclude<ReconciliationState, "verified">, TranslationKey> = {
    disabled: "Downtify integration is disabled.",
    unbound: "No Downtify account is linked to this user.",
    misconfigured: "Downtify connection settings are incomplete.",
    available: "Remote transfer status is unknown.",
    not_found: "Request state not independently verified",
    not_attempted: "Prepared only — not sent for download",
    invalid_intent: "Recording identity could not be verified.",
    unavailable: "Downtify is unavailable. Try refreshing.",
    unauthorized: "Downtify device pairing could not be verified.",
    incompatible: "This Downtify API version is not supported.",
    no_verified_job: "No owned Downtify job verified. Do not retry automatically.",
    ambiguous: "Multiple owned Downtify jobs matched. Manual review required.",
};
const remoteTransferLabel: Record<RemoteTransferPhase, TranslationKey> = {
    not_checked: "Unknown status",
    queued: "Queued",
    processing: "Processing",
    downloaded: "Download complete (index not checked)",
    failed: "Failed",
    unknown: "Unknown status",
};
const savedRequestLabel: Record<SavedSpotifyIntent["requestState"], TranslationKey> = {
    prepared: "Prepared only — not sent for download",
    dispatching: "Dispatch started; do not send again until verified.",
    dispatch_unknown: "Remote submission uncertain. Do not retry automatically.",
    submitted: "Sent to Downtify; Kima library import not verified.",
    completed: "Request marked complete; local file not verified.",
    failed: "Request marked failed; review before resending.",
    unknown: "Request state not independently verified",
};

const evidenceLabels: Record<LibraryEvidenceStatus, TranslationKey> = {
    recording_match_on_disk: "Recording match found in indexed local file (audio not decoded).",
    catalog_recording_unverified: "Catalog recording match exists, but its audio file was not verified.",
    no_verified_match: "No proven local recording match. This does not prove the song is absent.",
    metadata_unavailable: "Spotify metadata is unavailable. Local presence is unknown.",
    identity_unavailable: "Recording identity could not be verified.",
    not_supported: "Library evidence currently supports individual tracks only.",
};

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
                eyebrow={t("Preview and preparation")}
                title={t("Download Manager")}
                description={t("Follow downloads and manage staged Spotify requests.")}
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
 * Link checking stays read-only. A separate opt-in "Save prepared request"
 * action persists an owner-scoped intent but never contacts an engine,
 * imports a file or claims that Spotify media exists in the library.
 */
function SpotifyLinkIntake() {
    const { t } = useLanguage();
    const [link, setLink] = useState("");
    const [result, setResult] = useState<SpotifyLinkPreview | null>(null);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState(false);
    const [savedList, setSavedList] = useState<SavedSpotifyIntentPage | null>(null);
    const [listError, setListError] = useState(false);
    const [listReload, setListReload] = useState(0);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(false);
    const [savedResult, setSavedResult] = useState<PreparedSpotifyIntentResponse | null>(null);
    const [libraryEvidence, setLibraryEvidence] = useState<LibraryEvidence | null>(null);
    const [libraryChecking, setLibraryChecking] = useState(false);
    const [libraryError, setLibraryError] = useState(false);
    const [dispatchCapability, setDispatchCapability] = useState<DispatchCapabilityResponse | null>(null);
    const [reconciliationCapability, setReconciliationCapability] = useState<ReconciliationCapability | null>(null);
    const [remoteResults, setRemoteResults] = useState<Record<string, RemoteIntentVerification>>({});
    const [remoteErrors, setRemoteErrors] = useState<Record<string, boolean>>({});
    const [remoteCheckingId, setRemoteCheckingId] = useState<string | null>(null);
    const [sourceCapability, setSourceCapability] = useState<SourceFileCapability | null>(null);
    const [sourceResults, setSourceResults] = useState<Record<string, SourceFileEvidence>>({});
    const [sourceErrors, setSourceErrors] = useState<Record<string, boolean>>({});
    const [sourceCheckingId, setSourceCheckingId] = useState<string | null>(null);
    const sourceCheckInFlight = useRef(false);
    const sourceCheckEpoch = useRef(0);
    const remoteCheckInFlight = useRef(false);
    const remoteCheckEpoch = useRef(0);
    const [ackUnverified, setAckUnverified] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitAttempted, setSubmitAttempted] = useState(false);
    const [submission, setSubmission] = useState<DispatchResponse | null>(null);
    const [submissionError, setSubmissionError] = useState(false);
    const attemptedIntentIds = useRef(new Set<string>());
    const requestEpoch = useRef(0);

    useEffect(() => () => {
        requestEpoch.current++;
        remoteCheckEpoch.current++;
        sourceCheckEpoch.current++;
    }, []);

    useEffect(() => {
        let active = true;
        void api.get<DispatchCapabilityResponse>("/download-manager/spotify/dispatch-capability")
            .then(data => { if (active) setDispatchCapability(data); })
            .catch(() => { if (active) setDispatchCapability(null); });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        let active = true;
        void api.get<ReconciliationCapability>("/download-manager/spotify/reconciliation-capability")
            .then(data => { if (active) setReconciliationCapability(data); })
            .catch(() => { if (active) setReconciliationCapability(null); });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        let active = true;
        void api.get<SourceFileCapability>("/download-manager/spotify/source-file-capability")
            .then(data => { if (active) setSourceCapability(data); })
            .catch(() => { if (active) setSourceCapability(null); });
        return () => { active = false; };
    }, []);

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const response = await api.get<SavedSpotifyIntentPage>(
                    "/download-manager/spotify/intents?limit=20&offset=0"
                );
                if (active) {
                    setSavedList(response);
                    setListError(false);
                }
            } catch {
                if (active) {
                    setSavedList(null);
                    setListError(true);
                }
            }
        };
        void load();
        return () => { active = false; };
    }, [listReload]);

    const kindLabel: Record<SpotifyLinkPreview["kind"], TranslationKey> = {
        track: "Spotify track",
        album: "Spotify album",
        playlist: "Spotify playlist",
    };

    const check = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!link.trim() || checking || saving || libraryChecking || submitting) return;

        const epoch = ++requestEpoch.current;
        setChecking(true);
        setResult(null);
        setError(false);
        setSavedResult(null);
        setSaveError(false);
        setLibraryEvidence(null);
        setLibraryError(false);
        setAckUnverified(false);
        setSubmission(null);
        setSubmissionError(false);
        setSubmitAttempted(false);
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

    const save = async () => {
        if (!savedList?.enabled || !result || saving || libraryChecking || submitting) return;
        const epoch = ++requestEpoch.current;
        setSaving(true);
        setSaveError(false);
        setSavedResult(null);
        try {
            const prepared = await api.post<PreparedSpotifyIntentResponse>(
                "/download-manager/spotify/intents",
                { url: result.canonicalUrl }
            );
            if (requestEpoch.current === epoch) {
                setSavedResult(prepared);
                setListReload((n) => n + 1);
            }
        } catch {
            if (requestEpoch.current === epoch) setSaveError(true);
        } finally {
            if (requestEpoch.current === epoch) setSaving(false);
        }
    };

    const verifyLibrary = async () => {
        if (!result || result.kind !== "track" || libraryChecking || saving || checking || submitting) return;
        const epoch = ++requestEpoch.current;
        setLibraryChecking(true);
        setLibraryEvidence(null);
        setLibraryError(false);
        setAckUnverified(false);
        setSubmission(null);
        setSubmissionError(false);
        setSubmitAttempted(false);
        try {
            const evidence = await api.post<LibraryEvidence>(
                "/download-manager/spotify/check-library",
                { url: result.canonicalUrl }
            );
            if (requestEpoch.current === epoch) setLibraryEvidence(evidence);
        } catch {
            if (requestEpoch.current === epoch) setLibraryError(true);
        } finally {
            if (requestEpoch.current === epoch) setLibraryChecking(false);
        }
    };


    // A prepared request is not a job. The server rechecks all identities,
    // proof and permissions immediately before any external submission.
    const preparedOnPage = savedList?.items.find(item =>
        item.kind === "track" && item.canonicalUrl === result?.canonicalUrl &&
        item.requestState === "prepared"
    );
    const preparedId = savedResult
        ? (savedResult.status === "prepared" ? savedResult.id : null)
        : preparedOnPage?.id ?? null;
    const canDispatch = dispatchCapability?.canSubmit === true &&
        result?.kind === "track" && libraryEvidence?.status === "no_verified_match" &&
        !!preparedId && !submitAttempted && !attemptedIntentIds.current.has(preparedId);

    const submitTrack = async () => {
        if (!canDispatch || !ackUnverified || !preparedId || submitting ||
            saving || checking || libraryChecking) return;
        const epoch = ++requestEpoch.current;
        setSubmitting(true);
        attemptedIntentIds.current.add(preparedId);
        setSubmitAttempted(true); // lost HTTP reply must never auto-retry
        setSubmission(null);
        setSubmissionError(false);
        try {
            const response = await api.post<DispatchResponse>(
                "/download-manager/spotify/intents/" + encodeURIComponent(preparedId) + "/submit",
                { acknowledgeUnverified: true }
            );
            if (requestEpoch.current === epoch) {
                setSubmission(response);
                setListReload(n => n + 1);
            }
        } catch {
            if (requestEpoch.current === epoch) {
                setSubmissionError(true);
                setListReload(n => n + 1);
            }
        } finally {
            if (requestEpoch.current === epoch) setSubmitting(false);
        }
    };


    const remoteStatusText = (value: RemoteIntentVerification) =>
        value.state === "verified"
            ? t("Remote status") + ": " + t(remoteTransferLabel[value.remotePhase])
            : t(reconciliationLabel[value.state]);

    // Only a deliberate click reads an intent's remote queue state.
    // A missing or failed check NEVER resets the saved request for retry.
    const checkRemote = async (id: string) => {
        if (!reconciliationCapability?.canCheck || remoteCheckInFlight.current) return;
        remoteCheckInFlight.current = true;
        const epoch = remoteCheckEpoch.current;
        // Any prior source-file observation is stale after a new remote check.
        sourceCheckEpoch.current++;
        setSourceResults(previous => {
            const next = { ...previous };
            delete next[id];
            return next;
        });
        setRemoteCheckingId(id);
        setRemoteErrors(previous => ({ ...previous, [id]: false }));
        setRemoteResults(previous => {
            const next = { ...previous };
            delete next[id];
            return next;
        });
        try {
            const result = await api.get<RemoteIntentVerification>(
                "/download-manager/spotify/intents/" + encodeURIComponent(id) + "/remote-status"
            );
            if (epoch === remoteCheckEpoch.current) {
                setRemoteResults(previous => ({ ...previous, [id]: result }));
            }
        } catch {
            if (epoch === remoteCheckEpoch.current) {
                setRemoteErrors(previous => ({ ...previous, [id]: true }));
            }
        } finally {
            remoteCheckInFlight.current = false;
            if (epoch === remoteCheckEpoch.current) setRemoteCheckingId(null);
        }
    };

    // A D3 confirmed 'done' row unlocks a deliberate D5 file probe.
    // The server rechecks owner, server identity, job and staging root again.
    const checkSourceFile = async (id: string) => {
        const verified = remoteResults[id];
        if (!sourceCapability?.canCheck || sourceCheckInFlight.current ||
            verified?.state !== "verified" || verified.remotePhase !== "downloaded") return;
        sourceCheckInFlight.current = true;
        const epoch = ++sourceCheckEpoch.current;
        setSourceCheckingId(id);
        setSourceErrors(previous => ({ ...previous, [id]: false }));
        setSourceResults(previous => {
            const next = { ...previous };
            delete next[id];
            return next;
        });
        try {
            const evidence = await api.get<SourceFileEvidence>(
                "/download-manager/spotify/intents/" + encodeURIComponent(id) + "/source-file"
            );
            if (epoch === sourceCheckEpoch.current) {
                setSourceResults(previous => ({ ...previous, [id]: evidence }));
            }
        } catch {
            if (epoch === sourceCheckEpoch.current) {
                setSourceErrors(previous => ({ ...previous, [id]: true }));
            }
        } finally {
            sourceCheckInFlight.current = false;
            if (epoch === sourceCheckEpoch.current) setSourceCheckingId(null);
        }
    };

    return (
        <section aria-labelledby="spotify-intake-title" className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-6">
            <h2 id="spotify-intake-title" className="text-lg font-semibold text-white">
                {t("Check Spotify link")}
            </h2>
            <p className="mb-4 mt-1 text-sm text-[var(--text-muted)]">
                {t("Preview Spotify links. Track submission requires an explicitly configured Downtify connection.")}
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
                        disabled={saving || libraryChecking || submitting}
                        value={link}
                        onChange={(event) => {
                            requestEpoch.current++;
                            setLink(event.target.value);
                            setResult(null);
                            setError(false);
                            setSavedResult(null);
                            setSaveError(false);
                            setLibraryEvidence(null);
                            setLibraryError(false);
                            setAckUnverified(false);
                            setSubmission(null);
                            setSubmissionError(false);
                            setSubmitAttempted(false);
                            setChecking(false);
                        }}
                        placeholder="https://open.spotify.com/track/..."
                        className="w-full rounded-xl border border-white/15 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-[var(--text-muted)] focus:border-brand focus:outline-none"
                    />
                </div>
                <button
                    type="submit"
                    disabled={!link.trim() || checking || saving || libraryChecking || submitting}
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
                        {result.kind === "track" && (
                            <button
                                type="button"
                                disabled={libraryChecking || saving || checking || submitting}
                                onClick={() => { void verifyLibrary(); }}
                                className="mt-2 rounded-lg border border-white/20 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-50"
                            >
                                {libraryChecking ? t("Checking library recording...") : t("Check local recording")}
                            </button>
                        )}
                        {libraryEvidence && (
                            <p role="status" className="mt-2 text-xs text-[var(--text-secondary)]">
                                {t(evidenceLabels[libraryEvidence.status])}
                            </p>
                        )}
                        {libraryError && (
                            <p role="alert" className="mt-2 text-xs text-[var(--text-secondary)]">
                                {t("Library check failed. Presence remains unknown.")}
                            </p>
                        )}
                        {savedList?.enabled && (
                            <button
                                type="button"
                                disabled={saving || checking || libraryChecking || submitting}
                                onClick={() => { void save(); }}
                                className="mt-2 rounded-lg border border-white/20 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-50"
                            >
                                {saving ? t("Saving prepared request...") : t("Save prepared request (no download)")}
                            </button>
                        )}
                        {savedResult && (
                            <p role="status" className="text-xs text-[var(--text-secondary)]">
                                {savedResult.alreadyPrepared
                                    ? t("Request already saved. No new download started.")
                                    : t("Request saved. No download started.")}
                            </p>
                        )}
                        {saveError && (
                            <p role="alert" className="text-xs text-[var(--text-secondary)]">
                                {t("Could not save the prepared request.")}
                            </p>
                        )}
                        {canDispatch && (
                            <div className="mt-3 space-y-3 rounded-lg border border-white/15 p-3">
                                <p className="text-xs text-[var(--text-secondary)]">
                                    {t("No verified match was found; this does not prove the track is absent.")}
                                </p>
                                <label className="flex cursor-pointer items-start gap-2 text-xs text-[var(--text-secondary)]">
                                    <input
                                        type="checkbox"
                                        checked={ackUnverified}
                                        onChange={event => setAckUnverified(event.target.checked)}
                                        className="mt-0.5"
                                    />
                                    <span>{t("I understand a duplicate may exist and want to request this track.")}</span>
                                </label>
                                <button
                                    type="button"
                                    disabled={!ackUnverified || submitting}
                                    onClick={() => { void submitTrack(); }}
                                    className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                                >
                                    {submitting ? t("Submitting to Downtify...") : t("Submit track to Downtify")}
                                </button>
                            </div>
                        )}
                        {submission && (
                            <p role="status" className="mt-2 text-xs text-[var(--text-secondary)]">
                                {submission.state === "submitted"
                                    ? t("Downtify accepted the track. Library import is not yet verified.")
                                    : submission.state === "already_in_remote_queue"
                                        ? t("Track already belongs to your Downtify queue; no new request sent.")
                                        : t("Submission is uncertain. Do not resend until the queue is checked.")}
                            </p>
                        )}
                        {submissionError && (
                            <p role="alert" className="mt-2 text-xs text-[var(--text-secondary)]">
                                {t("Submission could not be verified. Do not retry automatically.")}
                            </p>
                        )}
                    </div>
                ) : null}
            </div>
            <div className="mt-5 border-t border-white/10 pt-4">
                <h3 className="mb-2 text-sm font-semibold text-white">{t("Saved Spotify requests")}</h3>
                {listError ? (
                    <p role="status" className="text-sm text-[var(--text-muted)]">
                        {t("Could not load saved requests.")}
                    </p>
                ) : savedList === null ? (
                    <p role="status" className="text-sm text-[var(--text-muted)]">{t("Loading...")}</p>
                ) : !savedList.enabled ? (
                    <p className="text-sm text-[var(--text-muted)]">
                        {t("Saving requests is disabled on this server.")}
                    </p>
                ) : savedList.items.length === 0 ? (
                    <p className="text-sm text-[var(--text-muted)]">{t("No prepared Spotify requests yet.")}</p>
                ) : (
                    <ul className="space-y-2" aria-label={t("Saved Spotify requests")}>
                        {savedList.items.map((item) => (
                            <li key={item.id} className="rounded-lg border border-white/10 bg-black/10 p-3 text-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="font-medium text-white">
                                        {item.kind === "unknown" ? t("Unknown source") : t(kindLabel[item.kind])}
                                    </span>
                                    <span className="text-xs text-[var(--text-muted)]">
                                        {t(savedRequestLabel[item.requestState])}
                                    </span>
                                </div>
                                <p className="mt-1 break-all text-xs text-[var(--text-secondary)]">
                                    {item.canonicalUrl ?? t("Invalid stored link")}
                                </p>
                                {reconciliationCapability?.canCheck === true &&
                                    item.kind === "track" &&
                                    (item.requestState === "submitted" ||
                                        item.requestState === "dispatching" ||
                                        item.requestState === "dispatch_unknown") && (
                                        <div className="mt-3 space-y-2">
                                            <button
                                                type="button"
                                                disabled={remoteCheckingId !== null}
                                                onClick={() => { void checkRemote(item.id); }}
                                                className="rounded-lg border border-white/20 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-50"
                                            >
                                                {remoteCheckingId === item.id
                                                    ? t("Checking Downtify job...")
                                                    : t("Check Downtify job")}
                                            </button>
                                            {remoteResults[item.id] && (
                                                <div role="status" className="space-y-1 text-xs text-[var(--text-secondary)]">
                                                    <p>
                                                        {remoteStatusText(remoteResults[item.id])}
                                                    </p>
                                                    <p>{t("A remote transfer does not confirm Kima library import or playable audio.")}</p>
                                                </div>
                                            )}
                                            {remoteErrors[item.id] && (
                                                <p role="alert" className="text-xs text-[var(--text-secondary)]">
                                                    {t("The remote status check failed. Do not retry automatically.")}
                                                </p>
                                            )}
                                            {sourceCapability?.canCheck === true &&
                                                remoteResults[item.id]?.state === "verified" &&
                                                remoteResults[item.id]?.remotePhase === "downloaded" && (
                                                    <div className="space-y-2">
                                                        <button
                                                            type="button"
                                                            disabled={sourceCheckingId !== null || remoteCheckingId !== null}
                                                            onClick={() => { void checkSourceFile(item.id); }}
                                                            className="rounded-lg border border-white/20 px-3 py-2 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-50"
                                                        >
                                                            {sourceCheckingId === item.id
                                                                ? t("Checking downloaded source file...")
                                                                : t("Check downloaded source file")}
                                                        </button>
                                                        {sourceResults[item.id] && (
                                                            <p role="status" className="text-xs text-[var(--text-secondary)]">
                                                                {t(sourceFileLabel[sourceResults[item.id].state])}
                                                            </p>
                                                        )}
                                                        {sourceErrors[item.id] && (
                                                            <p role="alert" className="text-xs text-[var(--text-secondary)]">
                                                                {t("Source file check failed. Do not retry the download.")}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                        </div>
                                    )}
                            </li>
                        ))}
                        {savedList.hasMore && (
                            <li className="text-xs text-[var(--text-muted)]">
                                {t("Showing up to 20 prepared requests.")}
                            </li>
                        )}
                    </ul>
                )}
                <p className="mt-3 text-xs text-[var(--text-muted)]">
                    {t("Prepared requests do not confirm a library match or start Downtify.")}
                </p>
            </div>
        </section>
    );
}
