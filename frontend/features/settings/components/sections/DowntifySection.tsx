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
        setAck(false);
        setFeedback(t("Downtify settings saved."));
    });
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
                                    <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                                        {t("Files are not automatically imported into your music library. Your existing importer stays unchanged.")}
                                    </p>
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
