"use client";
import { useLanguage } from "@/lib/i18n/language-context";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";

import { SettingsSection, SettingsRow, SettingsInput, SettingsToggle, ConnectionTestButton } from "../ui";
import { ConnectionTestResult, SystemSettings } from "../../types";
import { useConnectionTest } from "../../hooks/useConnectionTest";

interface ArtworkSectionProps {
    settings: SystemSettings;
    onUpdate: (updates: Partial<SystemSettings>) => void;
    onTest: (service: string) => Promise<ConnectionTestResult>;
    isTesting: boolean;
}

export function ArtworkSection({ settings, onUpdate, onTest, isTesting }: ArtworkSectionProps) {
    const { t } = useLanguage();
    const queryClient = useQueryClient();
    const [recovery, setRecovery] = useState<Awaited<ReturnType<typeof api.getMissingArtistArtwork>> | null>(null);
    const [recoveryError, setRecoveryError] = useState<string | null>(null);
    const [isStarting, setIsStarting] = useState(false);
    const wasRunning = useRef(false);
    const fanartTest = useConnectionTest(() => onTest("fanart"), { connected: () => "Connected" });

    const refreshRecovery = useCallback(async () => {
        try {
            const response = await api.getMissingArtistArtwork();
            // A completed job can change images still considered fresh in
            // TanStack Query. Invalidate outside React's state updater.
            if (wasRunning.current && !response.progress.inProgress) {
                void queryClient.invalidateQueries({ queryKey: ["library", "artists"] });
                void queryClient.invalidateQueries({ queryKey: ["artist"] });
            }
            wasRunning.current = response.progress.inProgress;
            setRecovery(response);
            setRecoveryError(null);
        } catch {
            setRecoveryError("Couldn't load missing artwork");
        }
    }, [queryClient]);

    useEffect(() => {
        void refreshRecovery();
    }, [refreshRecovery]);

    useEffect(() => {
        if (!recovery?.progress.inProgress) return;
        const interval = setInterval(() => { void refreshRecovery(); }, 4000);
        return () => clearInterval(interval);
    }, [recovery?.progress.inProgress, refreshRecovery]);

    const startRecovery = async () => {
        if (isStarting || recovery?.progress.inProgress) return;
        setIsStarting(true);
        setRecoveryError(null);
        try {
            const response = await api.retryMissingArtistArtwork();
            wasRunning.current = response.progress.inProgress;
            setRecovery((previous) => previous
                ? { ...previous, progress: response.progress }
                : null);
            await refreshRecovery();
        } catch {
            setRecoveryError("Couldn't start artwork recovery");
        } finally {
            setIsStarting(false);
        }
    };

    return (
        <SettingsSection
            id="artwork"
            title={t("Artwork")}
            description={t("Enhance your library with high-quality artwork")}
        >
            <SettingsRow
                label={t("Enable Fanart.tv")}
                description={t("Enhanced artist and album artwork")}
                htmlFor="fanart-enabled"
            >
                <SettingsToggle
                    id="fanart-enabled"
                    checked={settings.fanartEnabled}
                    onChange={(checked) => onUpdate({ fanartEnabled: checked })}
                />
            </SettingsRow>

            {settings.fanartEnabled && (
                <>
                    <SettingsRow label={t("API Key")}>
                        <SettingsInput
                            type="password"
                            value={settings.fanartApiKey}
                            onChange={(v) => onUpdate({ fanartApiKey: v })}
                            placeholder={t("Enter Fanart.tv API key")}
                            className="w-64"
                        />
                    </SettingsRow>

                    <div className="pt-2">
                        <ConnectionTestButton connection={fanartTest} disabled={isTesting || !settings.fanartApiKey} />
                    </div>
                </>
            )}

            <div className="mt-6 pt-6 border-t border-white/5">
                <SettingsRow
                    label={t("Missing artist photos")}
                    description={t("Retry up to 20 missing artist photos per scan. Local images are checked first; manual artwork is never replaced.")}
                >
                    <span className="text-sm tabular-nums text-white" aria-live="polite">
                        {recovery ? recovery.missingArtists : t("Loading...")}
                    </span>
                </SettingsRow>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Button
                        type="button"
                        onClick={() => { void startRecovery(); }}
                        disabled={isStarting || !recovery || recovery.missingArtists === 0 || recovery.progress.inProgress}
                    >
                        {isStarting || recovery?.progress.inProgress
                            ? t("Searching for artist photos...")
                            : t("Retry missing artist photos")}
                    </Button>
                    {recovery?.progress.startedAt && (
                        <span className="text-xs tabular-nums text-[var(--text-secondary)]" role="status" aria-live="polite">
                            {recovery.progress.recovered} {t("artist photos recovered")};{" "}
                            {recovery.progress.processed}/{recovery.progress.queued} {t("checked")}
                            {recovery.progress.failed > 0 && (
                                <>; {recovery.progress.failed} {t("failed")}</>
                            )}
                        </span>
                    )}
                    {recoveryError && (
                        <p role="alert" className="text-xs text-danger-light">{t(recoveryError)}</p>
                    )}
                </div>
            </div>

            <div className="mt-6 pt-6 border-t border-white/5">
                <div className="mb-4">
                    <p className="text-xs text-[var(--text-muted)]">
                        {t("AcoustID identifies tracks by their audio fingerprint. Add your own API key for higher rate limits.")}
                    </p>
                </div>

                <SettingsRow label={t("AcoustID API Key (Optional)")}>
                    <SettingsInput
                        type="password"
                        value={settings.acoustidApiKey || ""}
                        onChange={(v) => onUpdate({ acoustidApiKey: v })}
                        placeholder={t("Optional: Your AcoustID API key")}
                        className="w-64"
                    />
                </SettingsRow>
            </div>
        </SettingsSection>
    );
}
