"use client";
import { useLanguage } from "@/lib/i18n/language-context";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api, type AlbumCoverRecoveryStatus } from "@/lib/api";

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
    const { user } = useAuth();
    const isAdmin = user?.role === "admin";
    const [recovery, setRecovery] = useState<AlbumCoverRecoveryStatus | null>(null);
    const [isStarting, setIsStarting] = useState(false);
    const [repairError, setRepairError] = useState<"load" | "start" | null>(null);

    const refreshRecovery = useCallback(async () => {
        try {
            const state = await api.getAlbumCoverRecoveryStatus();
            setRecovery(state);
            setRepairError(null);
        } catch {
            setRepairError("load");
        }
    }, []);

    useEffect(() => {
        if (!isAdmin) return;
        void refreshRecovery();
    }, [isAdmin, refreshRecovery]);

    useEffect(() => {
        if (!isAdmin || !recovery?.inProgress) return;
        const timer = window.setInterval(() => { void refreshRecovery(); }, 3000);
        return () => window.clearInterval(timer);
    }, [isAdmin, recovery?.inProgress, refreshRecovery]);

    const startRecovery = async () => {
        setIsStarting(true);
        setRepairError(null);
        try {
            await api.startAlbumCoverRecovery();
            await refreshRecovery();
        } catch {
            setRepairError("start");
        } finally {
            setIsStarting(false);
        }
    };
    const fanartTest = useConnectionTest(() => onTest("fanart"), { connected: () => "Connected" });

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

            {isAdmin && (
                <div className="mt-6 pt-6 border-t border-white/5">
                    <SettingsRow
                        label={t("Repair missing album covers")}
                        description={t("Repair covers for albums already in your library, without rescanning music or replacing existing artwork.")}
                    >
                        <button
                            type="button"
                            onClick={() => { void startRecovery(); }}
                            disabled={isStarting || recovery?.inProgress === true}
                            className="rounded-lg border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isStarting || recovery?.inProgress
                                ? t("Repairing covers...")
                                : recovery?.hasMore
                                    ? t("Continue cover repair")
                                    : t("Start cover repair")}
                        </button>
                    </SettingsRow>
                    {recovery && (
                        <div role="status" aria-live="polite" className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
                            <p>{t("Albums checked")}: {recovery.processed} / {recovery.total}</p>
                            <p>{t("Local covers recovered")}: {recovery.recoveredLocal} · {t("Online covers recovered")}: {recovery.recoveredExternal}</p>
                            <p>{t("Albums skipped")}: {recovery.skipped} · {t("Repair failures")}: {recovery.failed}</p>
                            {recovery.hasMore && !recovery.inProgress && (
                                <p>{t("More albums remain; continue to process the next batch.")}</p>
                            )}
                            {recovery.error && <p className="text-red-400">{t("Artwork repair stopped. Check the server logs.")}</p>}
                        </div>
                    )}
                    {repairError && (
                        <p role="alert" className="mt-2 text-xs text-red-400">
                            {repairError === "load"
                                ? t("Could not load cover repair status")
                                : t("Could not start cover repair")}
                        </p>
                    )}
                </div>
            )}

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
