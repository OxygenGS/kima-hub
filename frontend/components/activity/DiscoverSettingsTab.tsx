"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { api } from "@/lib/api";
import { notify } from "@/lib/notify";
import { Trash2, Loader2, ArrowLeft } from "lucide-react";
import type { DiscoverConfig } from "@/features/discover/types";
import { useLanguage } from "@/lib/i18n/language-context";
import { discoverClearWarning } from "@/lib/i18n/discover-warning";

interface ConfigSliderProps {
    id: string;
    label: string;
    display: ReactNode;
    unit?: string;
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (value: number) => void;
    caption: string;
}

function ConfigSlider({ id, label, display, unit, min, max, step, value, onChange, caption }: ConfigSliderProps) {
    return (
        <div>
            <label htmlFor={id} className="block text-xs text-[var(--text-muted)] mb-4">{label}</label>
            <div className="border border-white/10 p-4 mb-3">
                <div className="flex items-baseline justify-between">
                    <span className="text-4xl font-bold text-brand tabular-nums">{display}</span>
                    {unit && <span className="text-xs text-[var(--text-muted)]">{unit}</span>}
                </div>
            </div>
            <input
                id={id}
                aria-describedby={`${id}-description`}
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full h-1 bg-white/10 appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-brand [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-white/20 hover:[&::-webkit-slider-thumb]:bg-white"
            />
            <p id={`${id}-description`} className="text-xs tabular-nums text-[var(--text-muted)] mt-3">{caption}</p>
        </div>
    );
}

interface DiscoverSettingsTabProps {
    config: DiscoverConfig | null;
    onUpdateConfig: (updatedConfig: DiscoverConfig | null) => void;
    onPlaylistCleared?: () => void;
    onBack: () => void;
}

export function DiscoverSettingsTab({
    config,
    onUpdateConfig,
    onPlaylistCleared,
    onBack,
}: DiscoverSettingsTabProps) {
    const { t, locale } = useLanguage();
    const [isClearing, setIsClearing] = useState(false);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    function handleConfigChange<K extends keyof DiscoverConfig>(
        key: K,
        value: DiscoverConfig[K]
    ) {
        if (config) {
            onUpdateConfig({ ...config, [key]: value });
        }

        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        debounceRef.current = setTimeout(async () => {
            try {
                await api.updateDiscoverConfig({ [key]: value });
            } catch {
                notify.error(t("Failed to save setting"));
            }
        }, 500);
    }

    async function handleClearPlaylist() {
        if (isClearing) return;

        const confirmed = window.confirm(discoverClearWarning(locale));

        if (!confirmed) return;

        setIsClearing(true);
        try {
            const result = await api.clearDiscoverPlaylist();

            const albums = (n: number) => `${n.toLocaleString(locale)} ${t(n === 1 ? "album" : "albums")}`;
            const parts = [
                result.likedMoved > 0 && `${t("Moved")} ${albums(result.likedMoved)} ${t("you liked to your library.")}`,
                result.activeDeleted > 0 && `${t("Deleted")} ${albums(result.activeDeleted)}.`,
            ].filter(Boolean);
            notify.info(t("Discover playlist cleared"), {
                message: parts.length > 0 ? parts.join(" ") : t("There were no albums to clear."),
            });

            onPlaylistCleared?.();
        } catch {
            notify.error(t("Failed to clear playlist"));
        } finally {
            setIsClearing(false);
        }
    }

    return (
        <div className="h-full flex flex-col bg-[var(--bg-primary)]">
            <div className="flex items-center gap-3 px-5 py-4 border-b-2 border-white/20">
                <button
                    onClick={onBack}
                    className="border border-white/20 p-2 hover:border-brand hover:bg-white/5 transition-colors"
                    title={t("back to activity")}
                    aria-label={t("back to activity")}
                >
                    <ArrowLeft className="w-4 h-4 text-[var(--text-secondary)]" />
                </button>
                <h3 className="text-sm font-bold text-white">{t("Settings")}</h3>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-8">
                <ConfigSlider
                    id="discover-playlist-size"
                    label={t("Playlist Size")}
                    display={config?.playlistSize || 10}
                    unit={t("tracks")}
                    min={5}
                    max={50}
                    step={5}
                    value={config?.playlistSize || 10}
                    onChange={(value) => handleConfigChange("playlistSize", value)}
                    caption={t("One track per album / Larger = more discovery")}
                />

                <ConfigSlider
                    id="discover-download-buffer"
                    label={t("Download Buffer")}
                    display={`${((config?.downloadRatio ?? 1.3) * 100 - 100).toFixed(0)}%`}
                    unit={t("extra")}
                    min={1}
                    max={2}
                    step={0.1}
                    value={config?.downloadRatio ?? 1.3}
                    onChange={(value) => handleConfigChange("downloadRatio", value)}
                    caption={t("Redundancy for failed downloads / Higher = more reliable")}
                />

                <ConfigSlider
                    id="discover-album-exclusion"
                    label={t("Album Exclusion")}
                    display={(config?.exclusionMonths ?? 6) === 0 ? "--" : config?.exclusionMonths ?? 6}
                    unit={(config?.exclusionMonths ?? 6) !== 0 ? t("months") : undefined}
                    min={0}
                    max={12}
                    step={1}
                    value={config?.exclusionMonths ?? 6}
                    onChange={(value) => handleConfigChange("exclusionMonths", value)}
                    caption={t("Cooldown period for repeat recommendations / 0 = disabled")}
                />

                <div className="pt-6 border-t-2 border-white/20">
                    <label className="block text-xs text-[var(--text-muted)] mb-4">
                        {t("Danger Zone")}
                    </label>
                    <p className="text-xs text-[var(--text-muted)] mb-4 leading-relaxed">
                        {t("Remove current playlist / Liked albums → library / Others → deleted")}
                    </p>
                    <button
                        onClick={handleClearPlaylist}
                        disabled={isClearing}
                        className="w-full flex items-center justify-center gap-3 px-4 py-3 border-2 border-danger/30 hover:border-danger hover:bg-danger/10 text-danger-light transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-xs"
                    >
                        {isClearing ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {t("Processing")}
                            </>
                        ) : (
                            <>
                                <Trash2 className="w-4 h-4" />
                                {t("Clear Playlist")}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
