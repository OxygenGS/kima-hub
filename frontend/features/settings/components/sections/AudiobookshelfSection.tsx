"use client";
import { useLanguage } from "@/lib/i18n/language-context";

import { SettingsSection, SettingsRow, SettingsInput, SettingsToggle, ConnectionTestButton } from "../ui";
import { ConnectionTestResult, SystemSettings } from "../../types";
import { useConnectionTest } from "../../hooks/useConnectionTest";

interface AudiobookshelfSectionProps {
    settings: SystemSettings;
    onUpdate: (updates: Partial<SystemSettings>) => void;
    onTest: (service: string) => Promise<ConnectionTestResult>;
    isTesting: boolean;
}

export function AudiobookshelfSection({ settings, onUpdate, onTest, isTesting }: AudiobookshelfSectionProps) {
    const { t } = useLanguage();
    const connection = useConnectionTest(() => onTest("audiobookshelf"));

    return (
        <SettingsSection
            id="audiobookshelf"
            title={t("Media Servers")}
            description={t("Connect to external media servers for audiobooks and podcasts")}
        >
            <SettingsRow
                label={t("Enable Audiobookshelf")}
                description={t("Connect for audiobooks and podcasts")}
                htmlFor="abs-enabled"
            >
                <SettingsToggle
                    id="abs-enabled"
                    checked={settings.audiobookshelfEnabled}
                    onChange={(checked) => onUpdate({ audiobookshelfEnabled: checked })}
                />
            </SettingsRow>

            {settings.audiobookshelfEnabled && (
                <>
                    <SettingsRow label={t("Server URL")}>
                        <SettingsInput
                            value={settings.audiobookshelfUrl}
                            onChange={(v) => onUpdate({ audiobookshelfUrl: v })}
                            placeholder="http://localhost:13378"
                            className="w-64"
                        />
                    </SettingsRow>

                    <SettingsRow label={t("API Key")}>
                        <SettingsInput
                            type="password"
                            value={settings.audiobookshelfApiKey}
                            onChange={(v) => onUpdate({ audiobookshelfApiKey: v })}
                            placeholder={t("Enter API key")}
                            className="w-64"
                        />
                    </SettingsRow>

                    <div className="pt-2">
                        <ConnectionTestButton
                            connection={connection}
                            disabled={isTesting || !settings.audiobookshelfUrl || !settings.audiobookshelfApiKey}
                        />
                    </div>
                </>
            )}
        </SettingsSection>
    );
}
