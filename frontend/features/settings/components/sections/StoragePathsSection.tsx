"use client";

import { SettingsSection, SettingsRow, SettingsInput } from "../ui";
import { SystemSettings } from "../../types";
import { useLanguage } from "@/lib/i18n/language-context";

interface StoragePathsSectionProps {
    settings: SystemSettings;
    onUpdate: (updates: Partial<SystemSettings>) => void;
}

export function StoragePathsSection({ settings, onUpdate }: StoragePathsSectionProps) {
    const { t } = useLanguage();
    return (
        <SettingsSection
            id="storage"
            title={t("Storage")}
            description={t("Configure storage paths for your music library")}
        >
            <SettingsRow
                label={t("Server URL")}
                description={t("Public base URL used by native app clients. Leave blank to auto-detect.")}
            >
                <SettingsInput
                    value={settings.publicUrl}
                    onChange={(v) => onUpdate({ publicUrl: v })}
                    placeholder="https://kima.example.com"
                    className="w-64"
                />
            </SettingsRow>

            <SettingsRow
                label={t("Music library path")}
                description={t("Path to your music library")}
            >
                <SettingsInput
                    value={settings.musicPath}
                    onChange={(v) => onUpdate({ musicPath: v })}
                    placeholder="/music"
                    className="w-64"
                />
            </SettingsRow>

            <SettingsRow
                label={t("Download path")}
                description={t("Path for new downloads")}
            >
                <SettingsInput
                    value={settings.downloadPath}
                    onChange={(v) => onUpdate({ downloadPath: v })}
                    placeholder="/downloads"
                    className="w-64"
                />
            </SettingsRow>
        </SettingsSection>
    );
}
