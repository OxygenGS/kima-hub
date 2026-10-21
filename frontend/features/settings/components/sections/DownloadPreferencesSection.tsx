"use client";
import { useLanguage } from "@/lib/i18n/language-context";

import { SettingsSection, SettingsRow, SettingsSelect } from "../ui";
import { SystemSettings, soulseekConfigured } from "../../types";

interface DownloadPreferencesSectionProps {
    settings: SystemSettings;
    onUpdate: (updates: Partial<SystemSettings>) => void;
}

export function DownloadPreferencesSection({
    settings,
    onUpdate,
}: DownloadPreferencesSectionProps) {
    const { t } = useLanguage();
    const isLidarrConfigured =
        settings.lidarrEnabled === true &&
        settings.lidarrUrl.trim() !== "" &&
        settings.lidarrApiKey.trim() !== "";

    const isSoulseekConfigured = soulseekConfigured(settings);

    const areBothServicesConfigured = isLidarrConfigured && isSoulseekConfigured;
    const isDisabled = !areBothServicesConfigured;

    const getFallbackOptions = () => {
        if (settings.downloadSource === "soulseek") {
            return [
                { value: "none", label: t("Skip track") },
                { value: "lidarr", label: t("Download full album via Lidarr") },
            ];
        } else {
            return [
                { value: "none", label: t("Skip album") },
                { value: "soulseek", label: t("Try Soulseek for individual tracks") },
            ];
        }
    };

    return (
        <SettingsSection
            id="download-preferences"
            title={t("Download Preferences")}
            description={t("Configure how music is downloaded for playlists and discovery")}
        >
            <SettingsRow
                label={t("Primary Download Source")}
                description={
                    isDisabled
                        ? t("Requires both Soulseek and Lidarr to be configured")
                        : t("Choose how to download music for imported playlists")
                }
            >
                <SettingsSelect
                    value={settings.downloadSource || "soulseek"}
                    onChange={(v) =>
                        onUpdate({
                            downloadSource: v as "soulseek" | "lidarr",
                            primaryFailureFallback: "none"
                        })
                    }
                    options={[
                        { value: "soulseek", label: t("Soulseek (Per-track)") },
                        { value: "lidarr", label: t("Lidarr (Full albums)") },
                    ]}
                    disabled={isDisabled}
                />
            </SettingsRow>

            <SettingsRow
                label={
                    settings.downloadSource === "soulseek"
                        ? t("When Soulseek Fails")
                        : t("When Lidarr Fails")
                }
                description={
                    isDisabled
                        ? t("Requires both Soulseek and Lidarr to be configured")
                        : settings.downloadSource === "soulseek"
                        ? t("What to do if a track can't be found on Soulseek")
                        : t("What to do if an album can't be found on Lidarr")
                }
            >
                <SettingsSelect
                    value={settings.primaryFailureFallback || "none"}
                    onChange={(v) =>
                        onUpdate({
                            primaryFailureFallback: v as "none" | "lidarr" | "soulseek",
                        })
                    }
                    options={getFallbackOptions()}
                    disabled={isDisabled}
                />
            </SettingsRow>

            <SettingsRow
                label={t("Soulseek Concurrent Downloads")}
                description={t("Number of simultaneous downloads when using Soulseek (1-10)")}
            >
                <SettingsSelect
                    value={settings.soulseekConcurrentDownloads?.toString() || "4"}
                    onChange={(v) =>
                        onUpdate({
                            soulseekConcurrentDownloads: parseInt(v),
                        })
                    }
                    options={[
                        { value: "1", label: "1" },
                        { value: "2", label: "2" },
                        { value: "3", label: "3" },
                        { value: "4", label: t("4 (Default)") },
                        { value: "5", label: "5" },
                        { value: "6", label: "6" },
                        { value: "7", label: "7" },
                        { value: "8", label: "8" },
                        { value: "9", label: "9" },
                        { value: "10", label: "10" },
                    ]}
                    disabled={!isSoulseekConfigured}
                />
            </SettingsRow>
        </SettingsSection>
    );
}
