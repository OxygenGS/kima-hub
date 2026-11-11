"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import { api } from "@/lib/api";
import type { TranslationKey } from "@/lib/i18n/translations";
import { SettingsInput, SettingsRow, SettingsSection, SettingsToggle } from "../ui";

type DowntifyControls = {
    enabled: boolean;
    spotifyIntentsEnabled: boolean;
    trackSubmissionEnabled: boolean;
    reconciliationEnabled: boolean;
};
type AdminConfig = DowntifyControls & {
    source: "database" | "environment" | "none";
    configured: boolean;
    url: string | null;
    username: string | null;
    ownerMatches: boolean;
    tokenConfigured: boolean;
    fileVerificationManagedInDocker: true;
};
type TestResult = {
    state: string;
    version?: string | null;
    identityVerified?: boolean;
};
type Usage = "off" | "queue" | "requests" | "downloads";
type NativeImportState = "disabled" | "unbound" | "misconfigured" | "music_unavailable" |
    "unavailable" | "unauthorized" | "incompatible" | "no_completed_track" |
    "ambiguous" | "library_unavailable" | "no_library_match" |
    "stream_unavailable" | "header_unverified" | "original_stream_verified";
type NativeImportReadiness = {
    state: NativeImportState;
    serverVerified: boolean;
    accountVerified: boolean;
    musicRootAccessible: boolean;
    originalStreamChecked: boolean;
    autoImportAvailable: false;
    importerCutoverAuthorized: false;
    filesChanged: false;
};
type NativeAutoImportStatus = {
    state: "unpaired" | "other_owner" | "paused" | "enabled";
    enabled: boolean;
    baselineReady: boolean;
    awaitingImport: number;
    processing: number;
    awaitingScan: number;
    imported: number;
    needsReview: number;
    storageReady: boolean;
    target?: "kima" | "lidarr";
    lidarrStageReady?: boolean;
    lidarrDownloads?: string | null;
    lidarrMusic?: string | null;
    lidarrPending?: number;
    lidarrNeedsMatch?: number;
    lidarrImported?: number;
    allowArtistCreation?: boolean;
};
type NativeSourceDiagnosis = {
    state: keyof typeof nativeSourceDiagnosisMessages;
};
const nativeSourceDiagnosisMessages = {
    "ready": "Downtify's original audio response is reachable for this waiting track; file content still needs verification.",
    "not_completed": "This track is no longer in Downtify's completed download queue. Kima cannot prove ownership from a library filename alone.",
    "stream_unavailable": "Downtify could not supply the original audio headers or exact file length for this track.",
    "not_in_library": "The completed Downtify download is missing from the mobile music library.",
    "ambiguous_library": "More than one Downtify library file matches this download; automatic import is blocked.",
    "ambiguous_job": "Multiple completed Downtify jobs match this track; automatic import is blocked.",
    "invalid_metadata": "Downtify returned incomplete or invalid metadata for this audio file.",
    "unavailable": "Downtify's read-only source inspection could not finish. The connection or remote library may be unavailable.",
    "unauthorized": "Downtify rejected the saved account or device identity.",
    "incompatible": "Downtify returned an incompatible server or library response.",
    "disabled": "The Downtify connection is disabled.",
    "unbound": "This Kima account is not bound to the Downtify owner.",
    "misconfigured": "The Downtify pairing is incomplete or invalid.",
    "none": "There is no waiting track to inspect.",
    "paused": "Automatic Downtify importing is paused.",
    "storage_unavailable": "Kima cannot verify the music storage mounted at activation."
} satisfies Record<string, TranslationKey>;

const importMessages: Record<NativeImportState, TranslationKey> = {
    disabled: "Enable the Downtify queue first.",
    unbound: "Only the linked Kima administrator can check import readiness.",
    misconfigured: "Downtify pairing needs attention before import can be checked.",
    music_unavailable: "Kima cannot access its music library mount.",
    unavailable: "Cannot check Downtify right now.",
    unauthorized: "Downtify rejected the linked account.",
    incompatible: "The Downtify server identity or API is incompatible.",
    no_completed_track: "No completed download is available to test the original audio stream.",
    ambiguous: "Multiple remote records match. Manual review is required.",
    library_unavailable: "Downtify's library listing is unavailable or too large for this check.",
    no_library_match: "No exact library file matched an owned completed download.",
    stream_unavailable: "Downtify did not provide the required original audio range.",
    header_unverified: "The remote audio format could not be verified.",
    original_stream_verified: "Original audio transfer is reachable. This check does not import music.",
};

/** Read-only evidence from the API; none of these checks authorizes disk writes. */
const setupChecks: { key: "musicRootAccessible" | "serverVerified" |
    "accountVerified" | "originalStreamChecked"; label: TranslationKey }[] = [
    { key: "musicRootAccessible", label: "Music directory access" },
    { key: "serverVerified", label: "Downtify server identity" },
    { key: "accountVerified", label: "Paired Downtify account" },
    { key: "originalStreamChecked", label: "Original audio sample" },
];


/** Only known, sanitized server states may be shown; never display raw errors. */
const nativeSafeMessage: Record<string, TranslationKey> = {
    not_paired: "Connect Downtify before enabling automatic import.",
    unauthorized: "Only the linked administrator can manage automatic import.",
    pairing_disabled: "Enable the Downtify connection before automatic import.",
    confirmation_required: "Confirm the music storage, backup and other-importer checks first.",
    source_unavailable: "Downtify cannot provide a complete initial snapshot. Check the connection and retry.",
    invalid_baseline: "Downtify returned inconsistent historical downloads. Automatic import remains off.",
    changed_during_setup: "Downtify pairing changed during setup. Reload settings and try again.",
    storage_unavailable: "Kima cannot verify the music storage. Check its mount and write permissions.",
};

const targetSafeMessage: Record<string, TranslationKey> = {
    pause_first: "Pause automatic importing before changing the final library.",
    outstanding_work: "Resolve waiting or claimed jobs before changing import ownership.",
    invalid_staging: "The shared downloads or Lidarr music path is invalid or unavailable.",
    stage_not_shared: "Lidarr cannot see Kima's shared download folder. Check both Docker mounts and the Lidarr-side path.",
    lidarr_unavailable: "Lidarr must be connected and its music root verified first.",
    acknowledgment_required: "Confirm the shared downloads volume and backup before switching.",
    changed_during_setup: "Downtify pairing changed during setup. Reload settings and try again.",
    unauthorized: "Only the linked administrator can manage automatic import.",
    unavailable: "Could not update the import destination.",
};
const disabled: DowntifyControls = {
    enabled: false, spotifyIntentsEnabled: false,
    trackSubmissionEnabled: false, reconciliationEnabled: false,
};
const usageOptions: { value: Usage; label: TranslationKey; description: TranslationKey }[] = [
    {
        value: "off",
        label: "Keep Downtify paused",
        description: "Keep this account linked, with all features turned off.",
    },
    {
        value: "queue",
        label: "View download queue",
        description: "View your Downtify jobs. No downloads are started.",
    },
    {
        value: "requests",
        label: "Save Spotify requests",
        description: "Save individual Spotify links without starting downloads.",
    },
    {
        value: "downloads",
        label: "Download tracks manually",
        description: "Save requests and let users confirm each single-track download.",
    },
];
const safeMessage: Record<string, TranslationKey> = {
    invalid_input: "Invalid Downtify URL or device token.",
    incompatible: "This Downtify server or account does not match the expected API.",
    unauthorized: "Downtify rejected the paired device.",
    unavailable: "Downtify is unavailable. Check the server URL and network.",
    environment_managed: "Downtify is managed in Docker. Disable the existing environment integration before pairing here.",
    not_paired: "Pair a Downtify account first.",
    confirmation_required: "Confirm that sending a track starts a remote download.",
};
function errorState(error: unknown): string {
    const value = error as { response?: { data?: { state?: string } } };
    return value?.response?.data?.state || "unavailable";
}
function usageFromControls(value: DowntifyControls): Usage {
    if (!value.enabled) return "off";
    if (value.trackSubmissionEnabled) return "downloads";
    if (value.spotifyIntentsEnabled) return "requests";
    return "queue";
}
function controlsFromUsage(value: Usage, checkCompletedJobs: boolean): DowntifyControls {
    const enabled = value !== "off";
    const spotifyIntentsEnabled = value === "requests" || value === "downloads";
    return {
        enabled,
        spotifyIntentsEnabled,
        trackSubmissionEnabled: value === "downloads",
        reconciliationEnabled: spotifyIntentsEnabled && checkCompletedJobs,
    };
}
function sameControls(a: DowntifyControls, b: DowntifyControls): boolean {
    return a.enabled === b.enabled
        && a.spotifyIntentsEnabled === b.spotifyIntentsEnabled
        && a.trackSubmissionEnabled === b.trackSubmissionEnabled
        && a.reconciliationEnabled === b.reconciliationEnabled;
}
function controlsFromStatus(value: AdminConfig): DowntifyControls {
    return {
        enabled: value.enabled, spotifyIntentsEnabled: value.spotifyIntentsEnabled,
        trackSubmissionEnabled: value.trackSubmissionEnabled,
        reconciliationEnabled: value.reconciliationEnabled,
    };
}

/** Admin-only pairing controls; never send the saved device token back to the browser. */
export function DowntifySection() {
    const { t } = useLanguage();
    const [status, setStatus] = useState<AdminConfig | null>(null);
    const [controls, setControls] = useState<DowntifyControls>(disabled);
    const [url, setUrl] = useState("");
    const [token, setToken] = useState("");
    const [showPairing, setShowPairing] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [ack, setAck] = useState(false);
    const [pending, setPending] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [feedback, setFeedback] = useState("");
    const [error, setError] = useState(false);
    const [importChecking, setImportChecking] = useState(false);
    const [importFeedback, setImportFeedback] = useState<TranslationKey | null>(null);
    const [importReadiness, setImportReadiness] = useState<NativeImportReadiness | null>(null);
    const [nativeStatus, setNativeStatus] = useState<NativeAutoImportStatus | null>(null);
    const [nativeAck, setNativeAck] = useState(false);
    const [nativeBusy, setNativeBusy] = useState(false);
    const [nativeRefreshing, setNativeRefreshing] = useState(false);
    const [nativeFeedback, setNativeFeedback] = useState<TranslationKey | null>(null);
    const [nativeError, setNativeError] = useState(false);
    const [sourceDiagnosticBusy, setSourceDiagnosticBusy] = useState(false);
    const [sourceDiagnosticFeedback, setSourceDiagnosticFeedback] = useState<TranslationKey | null>(null);
    const [targetChoice, setTargetChoice] = useState<"kima" | "lidarr">("kima");
    const [lidarrDownloads, setLidarrDownloads] = useState("/downloads");
    const [lidarrMusic, setLidarrMusic] = useState("/music");
    const [allowArtistCreation, setAllowArtistCreation] = useState(false);
    const [targetAck, setTargetAck] = useState(false);
    const [targetFeedback, setTargetFeedback] = useState<TranslationKey | null>(null);

    useEffect(() => {
        let active = true;
        void api.get<AdminConfig>("/downtify-integration").then(cfg => {
            if (!active) return;
            setStatus(cfg);
            setControls(controlsFromStatus(cfg));
            setUrl(cfg.source === "database" ? cfg.url || "" : "");
        }).catch(() => {
            if (active) { setError(true); setFeedback(t("Could not load Downtify settings.")); }
        }).finally(() => { if (active) setLoaded(true); });
        return () => { active = false; };
    }, [t]);

    useEffect(() => {
        if (status?.source !== "database" || !status.ownerMatches) {
            setNativeStatus(null);
            return;
        }
        let active = true;
        void api.get<NativeAutoImportStatus>("/downtify-integration/native-import")
            .then(result => {
                if (!active) return;
                setNativeStatus(result);
                setTargetChoice(result.target === "lidarr" ? "lidarr" : "kima");
                setLidarrDownloads(result.lidarrDownloads || "/downloads");
                setLidarrMusic(result.lidarrMusic || "/music");
                setAllowArtistCreation(result.allowArtistCreation === true);
            })
            .catch(() => {
                if (active) setNativeFeedback("Could not load automatic import settings.");
            });
        return () => { active = false; };
    }, [status?.source, status?.ownerMatches, status?.enabled]);

    const reportError = (err: unknown) => {
        setError(true);
        setFeedback(t(safeMessage[errorState(err)] || safeMessage.unavailable));
    };
    const run = async (action: () => Promise<void>) => {
        if (pending) return;
        setPending(true);
        setFeedback("");
        setError(false);
        try { await action(); }
        catch (err) { reportError(err); }
        finally { setPending(false); }
    };
    const candidate = () => ({ baseUrl: url.trim(), deviceToken: token.trim() });
    const isDatabase = status?.source === "database";
    const legacyEnv = status?.source === "environment";
    const ownerMatches = Boolean(isDatabase && status?.ownerMatches);
    const usage = usageFromControls(controls);
    const changed = isDatabase && status !== null && !sameControls(controls, controlsFromStatus(status));
    const needsSubmissionConsent = controls.trackSubmissionEnabled && !status?.trackSubmissionEnabled;

    const test = () => run(async () => {
        // An existing pairing is tested by the backend using its encrypted token.
        const payload = token.trim() ? candidate() : {};
        const result = await api.post<TestResult>("/downtify-integration/test", payload);
        if (result.state !== "connected" || result.identityVerified !== true) {
            setError(true);
            setFeedback(t("Downtify connection could not be verified."));
            return;
        }
        setFeedback(t("Downtify connection verified.") +
            (result.version ? " (" + result.version + ")" : ""));
    });
    const pair = () => run(async () => {
        const result = await api.post<AdminConfig>("/downtify-integration/pair", candidate());
        setStatus(result);
        setControls(controlsFromStatus(result));
        setToken("");
        setShowPairing(false);
        setImportReadiness(null);
        setImportFeedback(null);
        setAck(false);
        setFeedback(t("Downtify account paired. All features remain disabled."));
    });
    const save = () => run(async () => {
        const result = await api.post<AdminConfig>("/downtify-integration/controls", {
            ...controls,
            acknowledgeTrackSubmission: ack,
        });
        setStatus(result);
        setControls(controlsFromStatus(result));
        setImportReadiness(null);
        setImportFeedback(null);
        setAck(false);
        setFeedback(t("Downtify settings saved."));
    });
    const checkNativeImport = async () => {
        if (importChecking || pending || !ownerMatches) return;
        setImportChecking(true);
        setImportReadiness(null);
        setImportFeedback(null);
        try {
            const result = await api.get<NativeImportReadiness>("/downtify-integration/import-readiness");
            // Even a successful 64-byte audio probe is NOT a file import or
            // approval to shut down a different writer on the music volume.
            setImportReadiness(result);
            setImportFeedback(importMessages[result.state] || importMessages.unavailable);
        } catch {
            setImportFeedback(importMessages.unavailable);
        } finally {
            setImportChecking(false);
        }
    };
    const refreshNativeStatus = async () => {
        if (nativeRefreshing || nativeBusy || pending || !ownerMatches) return;
        setNativeRefreshing(true);
        setNativeError(false);
        setNativeFeedback(null);
        try {
            // Database aggregates and local volume check only; no Downtify polling,
            // new claim, scanner request or media write.
            const current = await api.get<NativeAutoImportStatus>(
                "/downtify-integration/native-import",
            );
            setNativeStatus(current);
        } catch {
            setNativeError(true);
            setNativeFeedback("Could not refresh import status.");
        } finally {
            setNativeRefreshing(false);
        }
    };

    const toggleNativeAutoImport = async (enabled: boolean) => {
        if (nativeBusy || nativeRefreshing || !ownerMatches || !nativeStatus || pending) return;
        if (enabled && !nativeAck) {
            setNativeError(true);
            setNativeFeedback("Confirm the music storage, backup and other-importer checks first.");
            return;
        }
        setNativeBusy(true);
        setNativeError(false);
        setNativeFeedback(null);
        try {
            const updated = await api.post<NativeAutoImportStatus>(
                "/downtify-integration/native-import",
                { enabled, acknowledgeSingleWriter: enabled && nativeAck },
            );
            setNativeStatus(updated);
            setNativeAck(false);
            setNativeFeedback(
                enabled ? "Automatic importing enabled." : "Automatic importing paused.",
            );
        } catch (err) {
            setNativeError(true);
            setNativeFeedback(nativeSafeMessage[errorState(err)] ||
                "Could not change automatic import settings.");
        } finally {
            setNativeBusy(false);
        }
    };

    const diagnoseWaitingSource = async () => {
        if (sourceDiagnosticBusy || nativeBusy || nativeRefreshing || pending ||
            !ownerMatches || !nativeStatus?.enabled || !nativeStatus.storageReady ||
            nativeStatus.awaitingImport < 1) return;
        setSourceDiagnosticBusy(true);
        setSourceDiagnosticFeedback(null);
        try {
            const result = await api.get<NativeSourceDiagnosis>(
                "/downtify-integration/native-import/source-diagnostic",
            );
            setSourceDiagnosticFeedback(
                nativeSourceDiagnosisMessages[result.state] ||
                nativeSourceDiagnosisMessages.unavailable,
            );
        } catch {
            setSourceDiagnosticFeedback(nativeSourceDiagnosisMessages.unavailable);
        } finally {
            setSourceDiagnosticBusy(false);
        }
    };

    const saveNativeTarget = async () => {
        if (nativeBusy || nativeRefreshing || pending || !ownerMatches ||
            !nativeStatus || nativeStatus.enabled || !targetAck) return;
        setNativeBusy(true);
        setTargetFeedback(null);
        try {
            await api.post("/downtify-integration/native-import/target", {
                target: targetChoice,
                lidarrDownloads: targetChoice === "lidarr" ? lidarrDownloads.trim() : null,
                lidarrMusic: targetChoice === "lidarr" ? lidarrMusic.trim() : null,
                allowArtistCreation: targetChoice === "lidarr" && allowArtistCreation,
                acknowledge: true,
            });
            const fresh = await api.get<NativeAutoImportStatus>(
                "/downtify-integration/native-import",
            );
            setNativeStatus(fresh);
            setTargetChoice(fresh.target === "lidarr" ? "lidarr" : "kima");
            setLidarrDownloads(fresh.lidarrDownloads || "/downloads");
            setLidarrMusic(fresh.lidarrMusic || "/music");
            setAllowArtistCreation(fresh.allowArtistCreation === true);
            setTargetAck(false);
            setTargetFeedback("Import destination saved. Automatic importing remains off.");
        } catch (err) {
            setTargetFeedback(targetSafeMessage[errorState(err)] ||
                targetSafeMessage.unavailable);
        } finally {
            setNativeBusy(false);
        }
    };

    const retrySafeMetadata = async () => {
        if (nativeBusy || nativeRefreshing || pending || !ownerMatches ||
            !nativeStatus?.enabled || !nativeStatus.storageReady ||
            nativeStatus.needsReview < 1) return;
        setNativeBusy(true);
        setNativeFeedback(null);
        setNativeError(false);
        try {
            const result = await api.post<{state: "requeued" | "none" | "blocked"}>(
                "/downtify-integration/native-import/retry-identity",
                { acknowledgeSafeRetry: true },
            );
            const fresh = await api.get<NativeAutoImportStatus>(
                "/downtify-integration/native-import",
            );
            setNativeStatus(fresh);
            setNativeFeedback(result.state === "requeued"
                ? "One verified unwritten Spotify lookup was released for safe retry."
                : result.state === "none"
                    ? "No safely retryable Spotify lookup was found."
                    : "The claimed download cannot be safely retried.");
            setNativeError(result.state === "blocked");
        } catch (err) {
            setNativeError(true);
            setNativeFeedback(nativeSafeMessage[errorState(err)] ||
                "The claimed download cannot be safely retried.");
        } finally {
            setNativeBusy(false);
        }
    };

    const chooseUsage = (value: Usage) => {
        setFeedback("");
        setAck(false);
        setControls(previous => controlsFromUsage(value, previous.reconciliationEnabled));
    };
    const showConnectionForm = !isDatabase || (ownerMatches && showPairing);

    return (
        <SettingsSection
            id="integrations"
            title={t("Integrations")}
            description={t("Manage optional services without changing your existing music importer.")}
        >
            {!loaded && <p role="status" className="py-3 text-sm text-[var(--text-muted)]">{t("Loading...")}</p>}
            {loaded && status === null && (
                <p role="alert" className="py-2 text-sm text-red-300">{feedback || t("Could not load Downtify settings.")}</p>
            )}
            {loaded && status !== null && (
                <div className="space-y-5">
                    {legacyEnv ? (
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                            <h3 className="text-base font-semibold text-white">Downtify</h3>
                            <p className="mt-2 text-sm text-[var(--text-secondary)]">
                                {t("Downtify is already configured through Docker environment variables. Existing settings take priority until you migrate them explicitly.")}
                            </p>
                        </div>
                    ) : (
                        <>
                            {isDatabase ? (
                                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <h3 className="text-base font-semibold text-white">{t("Downtify account linked")}</h3>
                                            <p className="mt-1 text-sm text-[var(--text-secondary)]">
                                                {t("Account")}: <span className="font-medium text-white">{status?.username || "—"}</span>
                                                {" · "}{status?.enabled ? t("Features active") : t("Features paused")}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <button type="button" onClick={test} disabled={pending || !ownerMatches}
                                                className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-40">
                                                {t("Test connection")}
                                            </button>
                                            {ownerMatches && (
                                                <button type="button" onClick={() => {
                                                    setShowPairing(value => !value);
                                                    setToken("");
                                                    setImportReadiness(null);
                                                    setImportFeedback(null);
                                                }} disabled={pending}
                                                    aria-expanded={showPairing}
                                                    aria-controls="downtify-pairing-form"
                                                    className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-40">
                                                    {showPairing ? t("Close connection settings") : t("Change connection")}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {!ownerMatches && (
                                        <p className="mt-3 text-sm text-[var(--text-secondary)]">
                                            {t("This pairing belongs to another Kima administrator.")}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <h3 className="text-base font-semibold text-white">{t("Connect Downtify")}</h3>
                                    <p className="text-sm text-[var(--text-secondary)]">
                                        {t("Link your Downtify account once. You can choose what to enable afterwards.")}
                                    </p>
                                </div>
                            )}

                            {showConnectionForm && (
                                <div id="downtify-pairing-form" className="rounded-xl border border-white/10 p-4">
                                    {isDatabase && <h4 className="mb-2 text-sm font-semibold text-white">{t("Replace saved connection")}</h4>}
                                    <SettingsRow label={t("Downtify server URL")} htmlFor="downtify-url"
                                        description={t("Enter a trusted Docker or LAN URL reachable from the Kima backend.")}>
                                        <SettingsInput id="downtify-url" type="url" value={url} onChange={setUrl}
                                            placeholder="http://downtify:8000" disabled={pending}
                                            className="w-full sm:w-72" />
                                    </SettingsRow>
                                    <SettingsRow label={t("Downtify device token")} htmlFor="downtify-token"
                                        description={t("Use a paired-device token, not your Downtify password. The token is never displayed again.")}>
                                        <SettingsInput id="downtify-token" type="password"
                                            value={token} onChange={setToken}
                                            placeholder="dtfy_..."
                                            disabled={pending} className="w-full sm:w-72" />
                                    </SettingsRow>
                                    <div className="flex flex-wrap gap-3 pt-3">
                                        <button type="button" onClick={test} disabled={pending || !token.trim() || !url.trim()}
                                            className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-40">
                                            {t("Test Downtify connection")}
                                        </button>
                                        <button type="button" onClick={pair}
                                            disabled={pending || !url.trim() || !token.trim()}
                                            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40">
                                            {isDatabase ? t("Replace Downtify pairing") : t("Pair Downtify account")}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {isDatabase && (
                                <div className="space-y-4">
                                    <fieldset disabled={!ownerMatches || pending} className="space-y-3">
                                        <legend className="text-base font-semibold text-white">
                                            {t("What do you want to do with Downtify?")}
                                        </legend>
                                        <p className="text-xs text-[var(--text-muted)]">
                                            {t("Choose one option. Nothing changes until you save.")}
                                        </p>
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            {usageOptions.map(option => (
                                                <label key={option.value}
                                                    className={"flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors " +
                                                        (usage === option.value
                                                            ? "border-brand bg-brand/10"
                                                            : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]")}>
                                                    <input type="radio" name="downtify-usage" value={option.value}
                                                        checked={usage === option.value}
                                                        onChange={() => chooseUsage(option.value)}
                                                        disabled={!ownerMatches || pending}
                                                        className="mt-1 accent-[var(--brand)]" />
                                                    <span className="space-y-1">
                                                        <span className="block text-sm font-medium text-white">{t(option.label)}</span>
                                                        <span className="block text-xs leading-relaxed text-[var(--text-muted)]">
                                                            {t(option.description)}
                                                        </span>
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    </fieldset>

                                    {usage === "downloads" && needsSubmissionConsent && (
                                        <label className="flex items-start gap-3 rounded-lg border border-white/10 p-3 text-sm text-[var(--text-secondary)]">
                                            <input type="checkbox" id="downtify-dispatch-ack"
                                                checked={ack} onChange={e => setAck(e.target.checked)}
                                                disabled={!ownerMatches || pending} className="mt-0.5" />
                                            {t("I understand that submitting a track starts a remote download and never verifies a library import.")}
                                        </label>
                                    )}

                                    {(usage === "requests" || usage === "downloads" || showAdvanced) && (
                                        <div className="rounded-lg border border-white/10 px-3 py-2">
                                            <button type="button" onClick={() => setShowAdvanced(value => !value)}
                                                disabled={pending}
                                                aria-expanded={showAdvanced}
                                                aria-controls="downtify-advanced"
                                                className="w-full py-1 text-left text-sm text-[var(--text-secondary)]">
                                                {showAdvanced ? "− " : "+ "}{t("More options")}
                                            </button>
                                            {showAdvanced && (
                                                <div id="downtify-advanced" className="pt-2">
                                                    <SettingsRow label={t("Check completed Downtify jobs")}
                                                        description={t("Allow a manual read-only check of your own completed jobs.")}>
                                                        <SettingsToggle id="downtify-reconciliation"
                                                            checked={controls.reconciliationEnabled}
                                                            onChange={value => setControls(previous => ({
                                                                ...previous,
                                                                reconciliationEnabled: value,
                                                            }))}
                                                            disabled={!ownerMatches || pending || !controls.spotifyIntentsEnabled} />
                                                    </SettingsRow>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="flex flex-wrap items-center gap-3">
                                        <button type="button" onClick={save}
                                            disabled={!ownerMatches || pending || !changed || (needsSubmissionConsent && !ack)}
                                            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40">
                                            {pending ? t("Saving...") : t("Save choice")}
                                        </button>
                                        {changed && <span role="status" className="text-xs text-[var(--text-muted)]">
                                            {t("Unsaved changes")}
                                        </span>}
                                        {status?.enabled && (
                                            <a href="/downloads" className="text-sm text-brand hover:underline">
                                                {t("Open Downloads")}
                                            </a>
                                        )}
                                    </div>
                                    <div className="rounded-xl border border-white/10 p-4 space-y-3">
                                        <SettingsRow label={t("Automatically add downloaded music")}
                                            description={t("Kima verifies new Downtify downloads and indexes them locally or hands them to Lidarr when configured. Existing downloads are skipped.")}>
                                            <SettingsToggle id="downtify-native-auto-import"
                                                checked={nativeStatus?.enabled === true}
                                                disabled={!ownerMatches || !status?.enabled ||
                                                    !nativeStatus || nativeBusy || nativeRefreshing || pending ||
                                                    (!nativeStatus.enabled && !nativeAck)}
                                                onChange={toggleNativeAutoImport} />
                                        </SettingsRow>
                                        {nativeStatus && !nativeStatus.enabled && (
                                            <p className="text-xs text-[var(--text-muted)]">
                                                {t("New installation: no previous importer to stop. Existing installation: stop other importers writing to this library before enabling.")}
                                            </p>
                                        )}
                                        {nativeStatus && !nativeStatus.enabled && (
                                            <div className="space-y-3 rounded-lg border border-white/10 p-3">
                                                <p className="text-xs font-semibold text-white">
                                                    {t("Choose who manages downloaded music")}
                                                </p>
                                                <p className="text-xs text-[var(--text-muted)]">
                                                    {t("Kima can index music independently, or send verified downloads to Lidarr to organise artists and albums. Switching never migrates existing songs.")}
                                                </p>
                                                <div className="flex flex-col gap-2 text-xs text-[var(--text-secondary)]">
                                                    <label className="flex items-center gap-2">
                                                        <input type="radio" name="downtify-final-owner" value="kima"
                                                            checked={targetChoice === "kima"}
                                                            onChange={() => { setTargetChoice("kima"); setTargetAck(false); }}
                                                            disabled={nativeBusy || pending} />
                                                        {t("Kima manages music (no Lidarr required)")}
                                                    </label>
                                                    <label className="flex items-center gap-2">
                                                        <input type="radio" name="downtify-final-owner" value="lidarr"
                                                            checked={targetChoice === "lidarr"}
                                                            onChange={() => { setTargetChoice("lidarr"); setTargetAck(false); }}
                                                            disabled={nativeBusy || pending} />
                                                        {t("Lidarr manages artists, albums and files")}
                                                    </label>
                                                </div>
                                                {targetChoice === "lidarr" && (
                                                    <div className="space-y-2">
                                                        <SettingsRow label={t("Shared downloads path inside Lidarr")}
                                                            description={t("This must point to the same shared downloads filesystem Kima uses, but from Lidarr's container.")}>
                                                            <SettingsInput id="downtify-lidarr-downloads"
                                                                value={lidarrDownloads} onChange={setLidarrDownloads}
                                                                disabled={nativeBusy || pending} />
                                                        </SettingsRow>
                                                        <SettingsRow label={t("Lidarr-managed music root")}
                                                            description={t("Select Lidarr's existing music root, not a staging folder. Kima verifies its own music mount separately.")}>
                                                            <SettingsInput id="downtify-lidarr-music"
                                                                value={lidarrMusic} onChange={setLidarrMusic}
                                                                disabled={nativeBusy || pending} />
                                                        </SettingsRow>
                                                                                                            <label className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                                                            <input type="checkbox" id="downtify-lidarr-autoartist"
                                                                checked={allowArtistCreation}
                                                                onChange={e=>{setAllowArtistCreation(e.target.checked);setTargetAck(false);}}
                                                                disabled={nativeBusy || pending}/>
                                                            {t("Allow Kima to add one uniquely matched unmonitored MusicBrainz artist in Lidarr when needed. Never search for missing albums.")}
                                                        </label>
                                                    </div>
                                                )}
                                                <label className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
                                                    <input type="checkbox" id="downtify-lidarr-target-ack"
                                                        checked={targetAck} onChange={e=>setTargetAck(e.target.checked)}
                                                        disabled={nativeBusy || pending} />
                                                    {t("I have verified both mounts, existing music backups, and that only Lidarr will manage the final library.")}
                                                </label>
                                                <button type="button" onClick={saveNativeTarget}
                                                    disabled={!targetAck || nativeBusy || nativeRefreshing || pending ||
                                                        !ownerMatches || targetChoice === (nativeStatus.target || "kima") &&
                                                        (targetChoice === "kima" ||
                                                            (lidarrDownloads === nativeStatus.lidarrDownloads &&
                                                             lidarrMusic === nativeStatus.lidarrMusic &&
                                                             allowArtistCreation === (nativeStatus.allowArtistCreation === true)))}
                                                    className="rounded-lg border border-white/20 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-40">
                                                    {t("Save import destination")}
                                                </button>
                                                {targetFeedback && <p role="status" className="text-xs text-[var(--text-muted)]">
                                                    {t(targetFeedback)}
                                                </p>}
                                            </div>
                                        )}

                                        {nativeStatus && !nativeStatus.enabled && (
                                            <label className="flex items-start gap-3 rounded-lg border border-white/10 p-3 text-xs text-[var(--text-secondary)]">
                                                <input type="checkbox" id="downtify-native-cutover-ack"
                                                    checked={nativeAck}
                                                    onChange={e => setNativeAck(e.target.checked)}
                                                    disabled={nativeBusy || pending || !status?.enabled}
                                                    className="mt-0.5" />
                                                {t("I verified the music storage is mounted and writable, a backup is available for existing libraries, and no other importer writes to this library.")}
                                            </label>
                                        )}
                                        {nativeStatus && (
                                            <>
                                                <p className="text-xs text-[var(--text-muted)]">
                                                    {nativeStatus.enabled
                                                        ? nativeStatus.storageReady
                                                            ? t("Automatic import is active.")
                                                            : t("Automatic import is paused because the verified music storage is unavailable.")
                                                        : t("Automatic import is currently off.")}
                                                </p>
                                                <dl aria-label={t("Downtify import activity")}
                                                    className="grid grid-cols-2 gap-3 rounded-lg border border-white/10 p-3 text-xs sm:grid-cols-3">
                                                    {([
                                                        ["Waiting", nativeStatus.awaitingImport],
                                                        ["Claimed / unresolved", nativeStatus.processing],
                                                        ["Waiting for library scan", nativeStatus.awaitingScan],
                                                        ["Added to Kima library", nativeStatus.imported],
                                                        ...(nativeStatus.target === "lidarr"
                                                            ? [
                                                                ["Waiting for Lidarr", nativeStatus.lidarrPending ?? 0],
                                                                ["Lidarr import confirmed", nativeStatus.lidarrImported ?? 0],
                                                            ] as const : []),
                                                        ["Needs review", nativeStatus.needsReview],
                                                    ] as const).map(([label, value]) => (
                                                        <div key={label} className="space-y-1">
                                                            <dt className="text-[var(--text-muted)]">{t(label)}</dt>
                                                            <dd className="font-semibold text-white">{value}</dd>
                                                        </div>
                                                    ))}
                                                </dl>
                                                {nativeStatus.imported > 0 && nativeStatus.target !== "lidarr" && (
                                                    <p className="text-xs text-[var(--text-muted)]"
                                                        role="note">
                                                        {t("This confirms indexing in Kima only. Native Downtify imports are not automatically registered in Lidarr. Do not manually move indexed files: their paths and hashes are verified by Kima.")}
                                                    </p>
                                                )}
                                                {nativeStatus.target === "lidarr" &&
                                                    (nativeStatus.lidarrNeedsMatch ?? 0) > 0 && (
                                                    <p role="status" className="text-xs text-[var(--text-muted)]">
                                                        {t("Some staged tracks need a unique MusicBrainz artist/album match in Lidarr. No duplicate import will be started.")}
                                                    </p>
                                                )}
                                                <button type="button" onClick={refreshNativeStatus}
                                                    disabled={!ownerMatches || nativeRefreshing || nativeBusy || pending}
                                                    className="rounded-lg border border-white/20 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-40">
                                                    {nativeRefreshing ? t("Refreshing import status...") : t("Refresh import status")}
                                                </button>
                                                {nativeStatus.enabled && nativeStatus.storageReady &&
                                                    nativeStatus.awaitingImport > 0 && (
                                                    <div className="space-y-2">
                                                        <button type="button" onClick={diagnoseWaitingSource}
                                                            disabled={sourceDiagnosticBusy || nativeBusy || nativeRefreshing || pending || !ownerMatches}
                                                            className="rounded-lg border border-white/20 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-40">
                                                            {sourceDiagnosticBusy
                                                                ? t("Checking the waiting Downtify source...")
                                                                : t("Diagnose waiting Downtify source")}
                                                        </button>
                                                        {sourceDiagnosticFeedback && (
                                                            <p role="status" className="text-xs text-[var(--text-secondary)]">
                                                                {t(sourceDiagnosticFeedback)}
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                                {nativeStatus.enabled && nativeStatus.storageReady &&
                                                    nativeStatus.needsReview > 0 && (
                                                    <div className="space-y-2">
                                                        <p className="text-xs text-[var(--text-muted)]">
                                                            {t("Only legacy Spotify lookup failures with proof that no audio was written can be retried. Other review items stay blocked.")}
                                                        </p>
                                                        <button type="button" onClick={retrySafeMetadata}
                                                            disabled={nativeBusy || nativeRefreshing || pending || !ownerMatches}
                                                            className="rounded-lg border border-white/20 px-3 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-40">
                                                            {t("Retry one safely unwritten Spotify lookup")}
                                                        </button>
                                                    </div>
                                                )}
                                                {nativeStatus.processing > 0 && (
                                                    <p className="text-xs text-[var(--text-muted)]">
                                                        {t("Claimed downloads may still be processing or need reconciliation after an interruption; Kima never blindly retries uncertain writes.")}
                                                    </p>
                                                )}
                                            </>
                                        )}
                                        {nativeStatus?.baselineReady && nativeStatus.storageReady === false && (
                                            <p role="alert" className="text-xs text-amber-300">
                                                {t("Music storage is unavailable. Automatic importing is paused until the correct disk returns.")}
                                            </p>
                                        )}
                                        {nativeFeedback && (
                                            <p role={nativeError ? "alert" : "status"}
                                                className={"text-xs " + (nativeError ? "text-red-300" : "text-[var(--text-secondary)]")}>
                                                {t(nativeFeedback)}
                                            </p>
                                        )}
                                        <button type="button" onClick={checkNativeImport}
                                            disabled={!ownerMatches || importChecking || pending || !status?.enabled}
                                            className="rounded-lg border border-white/20 px-3 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-40">
                                            {importChecking ? t("Checking Downtify setup...") : t("Check Downtify setup")}
                                        </button>
                                        {importFeedback && (
                                            <p role="status" className="text-xs text-[var(--text-secondary)]">
                                                {t(importFeedback)}
                                            </p>
                                        )}
                                        {importReadiness && (
                                            <div className="space-y-2" aria-label={t("Read-only setup checks")}>
                                                <p className="text-xs text-[var(--text-muted)]">
                                                    {t("These checks do not import music or confirm that another importer is stopped.")}
                                                    {" "}{t("Music folder access does not prove that the correct disk is mounted.")}
                                                </p>
                                                <ul className="space-y-1 text-xs">
                                                    {setupChecks.map(check => (
                                                        <li key={check.key} className="flex flex-wrap items-center justify-between gap-2">
                                                            <span className="text-[var(--text-secondary)]">{t(check.label)}</span>
                                                            <span className={importReadiness[check.key] === true
                                                                ? "text-green-300" : "text-[var(--text-muted)]"}>
                                                                {t(importReadiness[check.key] === true ? "Verified" : "Not verified")}
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                    {feedback && (
                        <p role={error ? "alert" : "status"}
                            className={"py-2 text-sm " + (error ? "text-red-300" : "text-[var(--text-secondary)]")}>
                            {feedback}
                        </p>
                    )}
                </div>
            )}
        </SettingsSection>
    );
}
