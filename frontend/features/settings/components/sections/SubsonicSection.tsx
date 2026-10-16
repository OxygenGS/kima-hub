"use client";

import { useState, useEffect, useCallback } from "react";
import { SettingsSection, SettingsRow } from "../ui";
import { useAuth } from "@/lib/auth-context";
import { useBranding } from "@/lib/branding-context";
import { api } from "@/lib/api";
import { InlineStatus, StatusType } from "@/components/ui/InlineStatus";
import { useLanguage } from "@/lib/i18n/language-context";

interface ApiKey {
    id: string;
    name: string;
    createdAt: string;
    lastUsed: string | null;
}

export function SubsonicSection() {
    const { user } = useAuth();
    const { branding } = useBranding();
    const { t, locale } = useLanguage();

    const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
    const [generating, setGenerating] = useState(false);
    const [newToken, setNewToken] = useState<string | null>(null);
    const [deviceName, setDeviceName] = useState("");
    const [status, setStatus] = useState<StatusType>("idle");
    const [message, setMessage] = useState("");
    const [revoking, setRevoking] = useState<string | null>(null);
    const [serverUrl, setServerUrl] = useState("");

    const loadApiKeys = useCallback(async () => {
        try {
            const data = await api.get<{ apiKeys: ApiKey[] }>("/api-keys");
            setApiKeys(data.apiKeys);
        } catch {
            // Non-fatal — keys list stays empty
        }
    }, []);

    useEffect(() => {
        api.get<{ publicUrl: string }>("/system-settings/public-config")
            .then((data) => {
                setServerUrl(data.publicUrl || (typeof window !== "undefined" ? window.location.origin : ""));
            })
            .catch(() => {
                if (typeof window !== "undefined") {
                    setServerUrl(window.location.origin);
                }
            });

        // Initial read is asynchronous, so the effect does not synchronously
        // invoke a state-updating loader. Mutations use loadApiKeys separately.
        let cancelled = false;
        void api.get<{ apiKeys: ApiKey[] }>("/api-keys")
            .then((data) => {
                if (!cancelled) setApiKeys(data.apiKeys);
            })
            .catch(() => {
                // Non-fatal: the list remains empty if tokens cannot be loaded.
            });
        return () => { cancelled = true; };
    }, []);

    const handleGenerate = async () => {
        const name = deviceName.trim() || "Subsonic";
        setGenerating(true);
        setStatus("loading");
        setMessage("");
        setNewToken(null);
        try {
            const data = await api.post<{ apiKey: string }>("/api-keys", {
                deviceName: name,
            });
            setNewToken(data.apiKey);
            setStatus("success");
            setMessage(t("Token generated"));
            await loadApiKeys();
        } catch (error: unknown) {
            setStatus("error");
            setMessage(error instanceof Error ? error.message : t("Failed to generate token"));
        } finally {
            setGenerating(false);
        }
    };

    const handleRevoke = async (id: string) => {
        setRevoking(id);
        try {
            await api.delete(`/api-keys/${id}`);
            setApiKeys((prev) => prev.filter((k) => k.id !== id));
        } catch {
            setStatus("error");
            setMessage("Failed to revoke token");
        } finally {
            setRevoking(null);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString(locale === "nl" ? "nl-NL" : "en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    };

    return (
        <SettingsSection id="subsonic" title={t("Native Apps")}>
            {/* Connection Info */}
            <SettingsRow
                label={t("Server URL")}
                description={t("Enter this in your Subsonic-compatible client. Admins can set a persistent URL in Storage settings.")}
            >
                <div className="flex items-center gap-2">
                    <span className="text-sm text-white bg-white/5 border border-white/10 px-3 py-2 rounded-lg tabular-nums break-all flex-1 min-w-0">
                        {serverUrl}
                    </span>
                    <button
                        onClick={() => copyToClipboard(serverUrl)}
                        className="text-xs text-brand hover:text-[#f97316] transition-colors shrink-0"
                    >
                        {t("Copy")}
                    </button>
                </div>
            </SettingsRow>

            <SettingsRow
                label={t("Username")}
                description={`${t("Use your")} ${branding.name} ${t("username in the client")}`}
            >
                <span className="text-xs tabular-nums text-[var(--text-muted)]">
                    {user?.username}
                </span>
            </SettingsRow>

            {/* Token Generation */}
            <SettingsRow
                label={t("API Token")}
                description={t("Generate a token to use as the password in your client")}
            >
                <div className="flex flex-col gap-2">
                    <input
                        type="text"
                        value={deviceName}
                        onChange={(e) => setDeviceName(e.target.value)}
                        placeholder={t("Client name (e.g. Amperfy, Symfonium, DSub)")}
                        className="text-sm text-white bg-white/5 border border-white/10 px-3 py-2 rounded-lg tabular-nums
                            placeholder:text-[var(--text-muted)] focus:outline-none focus:border-white/20 w-full"
                    />
                    <div className="inline-flex items-center gap-3">
                        <button
                            onClick={handleGenerate}
                            disabled={generating}
                            className="px-4 py-2 bg-brand text-black text-xs font-semibold rounded-lg
                                hover:bg-[#f97316] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {generating ? t("Generating...") : t("Generate Token")}
                        </button>
                        <InlineStatus
                            status={status}
                            message={message}
                            onClear={() => setStatus("idle")}
                        />
                    </div>
                </div>
            </SettingsRow>

            {/* Newly generated token display */}
            {newToken && (
                <div className="py-4 space-y-3 border-t border-b border-white/5">
                    <p className="text-xs text-[#f59e0b]">
                        {t("Save this key — it won't be shown again.")}
                    </p>
                    <div className="flex items-start gap-2 min-w-0 overflow-hidden">
                        <code className="text-sm text-white bg-white/5 border border-white/10 px-3 py-2 rounded-lg font-mono break-all flex-1 min-w-0 overflow-hidden">
                            {newToken}
                        </code>
                        <button
                            onClick={() => copyToClipboard(newToken)}
                            className="text-xs text-brand hover:text-[#f97316] transition-colors shrink-0 pt-2"
                        >
                            {t("Copy")}
                        </button>
                    </div>
                </div>
            )}

            {/* Setup guide — shown after a token has been generated */}
            {newToken && (
                <SettingsRow
                    label={t("Setup Guide")}
                    description={t("How to connect your client")}
                >
                    <div className="space-y-1 text-xs tabular-nums text-[var(--text-muted)]">
                        <p>1. {t("Server URL — paste the URL above")}</p>
                        <p>2. {t("Username — your")} {branding.name} {t("Username")}</p>
                        <p>3. {t("Password / API key — paste the token above")}</p>
                    </div>
                </SettingsRow>
            )}

            {/* Existing API keys */}
            {apiKeys.length > 0 && (
                <SettingsRow
                    label={t("Active Tokens")}
                    description={t("Revoke tokens to disconnect clients")}
                >
                    <div className="space-y-2 w-full">
                        {apiKeys.map((key) => (
                            <div
                                key={key.id}
                                className="flex items-center justify-between gap-4 bg-white/5 border border-white/10 px-3 py-2 rounded-lg"
                            >
                                <div className="min-w-0">
                                    <p className="text-xs tabular-nums text-white truncate">{key.name}</p>
                                    <p className="text-xs tabular-nums text-[var(--text-muted)]">
                                        {t("Created")} {formatDate(key.createdAt)}
                                        {key.lastUsed && ` · ${t("Last used")} ${formatDate(key.lastUsed)}`}
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleRevoke(key.id)}
                                    disabled={revoking === key.id}
                                    className="text-xs tabular-nums text-red-400 hover:text-red-300 transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {revoking === key.id ? t("Revoking...") : t("Revoke")}
                                </button>
                            </div>
                        ))}
                    </div>
                </SettingsRow>
            )}
        </SettingsSection>
    );
}
