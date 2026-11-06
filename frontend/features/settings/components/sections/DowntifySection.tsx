"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import { api } from "@/lib/api";
import {
    SettingsInput, SettingsRow, SettingsSection, SettingsToggle,
} from "../ui";

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
const disabled: DowntifyControls = {
    enabled: false, spotifyIntentsEnabled: false,
    trackSubmissionEnabled: false, reconciliationEnabled: false,
};
const safeMessage: Record<string, string> = {
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

/** Own save cycle: never pushes secrets through the general Settings form. */
export function DowntifySection() {
    const { t } = useLanguage();
    const [status, setStatus] = useState<AdminConfig | null>(null);
    const [controls, setControls] = useState<DowntifyControls>(disabled);
    const [url, setUrl] = useState("");
    const [token, setToken] = useState("");
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
            setControls({
                enabled: cfg.enabled, spotifyIntentsEnabled: cfg.spotifyIntentsEnabled,
                trackSubmissionEnabled: cfg.trackSubmissionEnabled,
                reconciliationEnabled: cfg.reconciliationEnabled,
            });
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
    const test = () => run(async () => {
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
        setControls(disabled);
        setToken("");
        setAck(false);
        setFeedback(t("Downtify account paired. All features remain disabled."));
    });
    const save = () => run(async () => {
        const result = await api.post<AdminConfig>("/downtify-integration/controls", {
            ...controls,
            acknowledgeTrackSubmission: ack,
        });
        setStatus(result);
        setControls({
            enabled: result.enabled, spotifyIntentsEnabled: result.spotifyIntentsEnabled,
            trackSubmissionEnabled: result.trackSubmissionEnabled,
            reconciliationEnabled: result.reconciliationEnabled,
        });
        setAck(false);
        setFeedback(t("Downtify settings saved."));
    });

    const isDatabase = status?.source === "database";
    const legacyEnv = status?.source === "environment";
    const editable = isDatabase && status?.ownerMatches && !pending;
    const set = (field: keyof DowntifyControls, checked: boolean) => {
        setFeedback("");
        setControls(previous => {
            const next = { ...previous, [field]: checked };
            if (!next.enabled) {
                next.spotifyIntentsEnabled = false;
                next.trackSubmissionEnabled = false;
                next.reconciliationEnabled = false;
            }
            if (!next.spotifyIntentsEnabled) next.trackSubmissionEnabled = false;
            return next;
        });
    };

    return (
        <SettingsSection
            id="integrations"
            title={t("Integrations")}
            description={t("Manage optional services without changing your existing music importer.")}
        >
            <div className="py-2">
                <h3 className="text-base font-semibold text-white">Downtify</h3>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {t("Link one Downtify device to the current Kima administrator. Secrets are stored encrypted.")}
                </p>
            </div>
            {!loaded && <p role="status" className="py-2 text-sm text-[var(--text-muted)]">{t("Loading...")}</p>}
            {loaded && (
                <>
                    {legacyEnv && (
                        <p role="status" className="py-3 text-sm text-[var(--text-secondary)]">
                            {t("Downtify is already configured through Docker environment variables. Existing settings take priority until you migrate them explicitly.")}
                        </p>
                    )}
                    {isDatabase && (
                        <p role="status" className="py-2 text-sm text-[var(--text-secondary)]">
                            {t("Paired Downtify account")}: {status?.username || "—"}
                            {" · "}{status?.enabled ? t("Enabled") : t("Disabled")}
                            {!status?.ownerMatches && " · " + t("This pairing belongs to another Kima administrator.")}
                        </p>
                    )}
                    {!legacyEnv && (
                        <>
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
                                    placeholder={status?.tokenConfigured ? t("Saved token — enter a new token to replace it") : "dtfy_..."}
                                    disabled={pending} className="w-full sm:w-72" />
                            </SettingsRow>
                            <div className="flex flex-wrap gap-3 py-3">
                                <button type="button" onClick={test}
                                    disabled={pending || (!token && !isDatabase) || (!isDatabase && !url)}
                                    className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-40">
                                    {t("Test Downtify connection")}
                                </button>
                                <button type="button" onClick={pair}
                                    disabled={pending || !url || !token}
                                    className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40">
                                    {isDatabase ? t("Replace Downtify pairing") : t("Pair Downtify account")}
                                </button>
                            </div>
                        </>
                    )}
                    {isDatabase && (
                        <>
                            <SettingsRow label={t("Enable Downtify connection")}
                                description={t("Show the owner-verified Downtify queue. This does not start downloads.")}>
                                <SettingsToggle id="downtify-enabled" checked={controls.enabled}
                                    onChange={v => set("enabled", v)} disabled={!editable} />
                            </SettingsRow>
                            <SettingsRow label={t("Save Spotify track requests")}
                                description={t("Allow download-permitted users to save Spotify links without downloading.")}>
                                <SettingsToggle id="downtify-intents" checked={controls.spotifyIntentsEnabled}
                                    onChange={v => set("spotifyIntentsEnabled", v)}
                                    disabled={!editable || !controls.enabled} />
                            </SettingsRow>
                            <SettingsRow label={t("Enable manual Downtify track submission")}
                                description={t("Submitting one prepared track starts a download remotely. No automatic retry.")}>
                                <SettingsToggle id="downtify-submission" checked={controls.trackSubmissionEnabled}
                                    onChange={v => set("trackSubmissionEnabled", v)}
                                    disabled={!editable || !controls.enabled || !controls.spotifyIntentsEnabled} />
                            </SettingsRow>
                            {controls.trackSubmissionEnabled && !status?.trackSubmissionEnabled && (
                                <label className="flex items-start gap-2 py-3 text-xs text-[var(--text-secondary)]">
                                    <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)}
                                        disabled={!editable} />
                                    {t("I understand that submitting a track starts a remote download and never verifies a library import.")}
                                </label>
                            )}
                            <SettingsRow label={t("Enable manual remote job checks")}
                                description={t("Read the exact owner's completed Downtify jobs without changing files.")}>
                                <SettingsToggle id="downtify-reconciliation" checked={controls.reconciliationEnabled}
                                    onChange={v => set("reconciliationEnabled", v)}
                                    disabled={!editable || !controls.enabled} />
                            </SettingsRow>
                            <div className="py-3">
                                <button type="button" onClick={save}
                                    disabled={!editable || (controls.trackSubmissionEnabled &&
                                        !status?.trackSubmissionEnabled && !ack)}
                                    className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40">
                                    {pending ? t("Saving...") : t("Save Downtify settings")}
                                </button>
                            </div>
                            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                                {t("Advanced audio and staging verification still requires a separately approved read-only Docker mount. Automatic DAS import and Importer v5 replacement are not enabled.")}
                            </p>
                        </>
                    )}
                    {feedback && (
                        <p role={error ? "alert" : "status"}
                            className={"py-2 text-sm " + (error ? "text-red-300" : "text-[var(--text-secondary)]")}>
                            {feedback}
                        </p>
                    )}
                </>
            )}
        </SettingsSection>
    );
}
