"use client";

import { useState } from "react";
import { useBranding } from "@/lib/branding-context";
import { SettingsSection, SettingsRow, SettingsInput, SettingsSelect } from "../ui";
import { SystemSettings } from "../../types";
import { ExternalLink } from "lucide-react";
import { InlineStatus, StatusType } from "@/components/ui/InlineStatus";
import { useLanguage } from "@/lib/i18n/language-context";

interface SoulseekSectionProps {
    settings: SystemSettings;
    onUpdate: (updates: Partial<SystemSettings>) => void;
    onTest: (service: string) => Promise<{ success: boolean; version?: string; error?: string }>;
    isTesting: boolean;
}

export function SoulseekSection({ settings, onUpdate, onTest, isTesting }: SoulseekSectionProps) {
    const { branding } = useBranding();
    const { t } = useLanguage();
    const [testStatus, setTestStatus] = useState<StatusType>("idle");
    const [testMessage, setTestMessage] = useState("");

    const handleTest = async () => {
        setTestStatus("loading");
        setTestMessage(t("Connecting..."));
        const result = await onTest("soulseek");
        if (result.success) {
            setTestStatus("success");
            setTestMessage(t("Connected to Soulseek"));
        } else {
            setTestStatus("error");
            setTestMessage(result.error || "Connection failed");
        }
    };

    const mode = settings.soulseekMode || "p2p";
    const isSlskd = mode === "slskd";
    // Direct P2P needs server-side credentials; slskd only needs a reachable URL
    // (slskd holds its own Soulseek account).
    const canTest = isSlskd
        ? !!settings.slskdUrl
        : !!(settings.soulseekUsername && settings.soulseekPassword);

    return (
        <SettingsSection
            id="soulseek"
            title={t("Soulseek")}
            description={t("Configure Soulseek for music downloads — directly (P2P) or via an external slskd instance")}
        >
            <SettingsRow
                label={t("Connection Mode")}
                description={
                    isSlskd
                        ? t("Route through a slskd REST API instance. slskd holds its own Soulseek account, so no credentials are needed here.")
                        : `${t("Connect directly using")} ${branding.name} ${t("'s built-in Soulseek client and your account credentials.")}`
                }
            >
                <SettingsSelect
                    value={mode}
                    onChange={(v) => onUpdate({ soulseekMode: v as "p2p" | "slskd" })}
                    options={[
                        { value: "p2p", label: t("Built-in (P2P)") },
                        { value: "slskd", label: t("slskd (external)") },
                    ]}
                />
            </SettingsRow>

            {!isSlskd && (
                <>
                    <SettingsRow
                        label={t("Soulseek Username")}
                        description={
                            <span className="flex items-center gap-1.5">
                                {t("Your Soulseek account username")}
                                <a
                                    href="https://www.slsknet.org/news/node/1"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-brand hover:text-[#f97316] transition-colors"
                                >
                                    <ExternalLink className="w-3 h-3" />
                                    {t("Create Account")}
                                </a>
                            </span>
                        }
                    >
                        <SettingsInput
                            value={settings.soulseekUsername || ""}
                            onChange={(v) => onUpdate({ soulseekUsername: v })}
                            placeholder="your_username"
                            className="w-64"
                        />
                    </SettingsRow>

                    <SettingsRow
                        label={t("Soulseek Password")}
                        description={t("Your Soulseek account password")}
                    >
                        <SettingsInput
                            type="password"
                            value={settings.soulseekPassword || ""}
                            onChange={(v) => onUpdate({ soulseekPassword: v })}
                            placeholder="your_password"
                            className="w-64"
                        />
                    </SettingsRow>
                </>
            )}

            {isSlskd && (
                <>
                    <SettingsRow
                        label={t("slskd URL")}
                        description={t("Base URL of your slskd instance (e.g. http://slskd:5030)")}
                    >
                        <SettingsInput
                            value={settings.slskdUrl || ""}
                            onChange={(v) => onUpdate({ slskdUrl: v })}
                            placeholder="http://slskd:5030"
                            className="w-64"
                        />
                    </SettingsRow>

                    <SettingsRow
                        label={t("slskd API Key")}
                        description={t("API key from your slskd configuration (leave blank if auth is disabled)")}
                    >
                        <SettingsInput
                            type="password"
                            value={settings.slskdApiKey || ""}
                            onChange={(v) => onUpdate({ slskdApiKey: v })}
                            placeholder={t("optional")}
                            className="w-64"
                        />
                    </SettingsRow>
                </>
            )}

            <div className="pt-2 space-y-2">
                <div className="inline-flex items-center gap-3">
                    <button
                        onClick={handleTest}
                        disabled={isTesting || !canTest}
                        className="px-4 py-1.5 text-xs tabular-nums bg-white/5 border border-white/10 text-[var(--text-secondary)] rounded-lg
                            hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {testStatus === "loading" ? t("Connecting...") : t("Test Connection")}
                    </button>
                    <InlineStatus
                        status={testStatus}
                        message={testMessage}
                        onClear={() => setTestStatus("idle")}
                    />
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                    {t("Downloads will be saved to your Singles folder automatically")}
                </p>
            </div>
        </SettingsSection>
    );
}
