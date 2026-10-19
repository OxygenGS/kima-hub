"use client";

import { useLanguage } from "@/lib/i18n/language-context";
import { Settings } from "lucide-react";
import { DiscoverPlaylist, DiscoverConfig } from "../types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";

interface DiscoverHeroProps {
    playlist: DiscoverPlaylist | null;
    config: DiscoverConfig | null;
    onOpenSettings: () => void;
}

export function DiscoverHero({ playlist, config, onOpenSettings }: DiscoverHeroProps) {
    const { t, locale } = useLanguage();
    const dateLocale = locale === "nl" ? "nl-NL" : "en-US";
    const totalDuration =
        playlist?.tracks?.reduce((sum, t) => sum + (t.duration || 0), 0) || 0;

    const formatTotalDuration = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
            return `${t("about")} ${hours.toLocaleString(locale)} ${t("hr")} ${mins.toLocaleString(locale)} ${t("min")}`;
        }
        return `${mins.toLocaleString(locale)} ${t("min")}`;
    };

    return (
        <PageHeader
            eyebrow={t("Discovery")}
            title={t("Discover Weekly")}
            description={t("A new playlist every week, picked from your listening")}
            actions={
                <Button variant="secondary" onClick={onOpenSettings} aria-label={t("Open discovery settings")}>
                    <Settings className="w-4 h-4" />
                    {t("Settings")}
                </Button>
            }
        >
            {playlist && playlist.totalCount > 0 && (
                <div className="mt-4 inline-flex flex-wrap items-center gap-3 text-xs tabular-nums bg-white/[0.02] border border-white/10 rounded-lg px-4 py-2">
                    <div className="flex items-center gap-2">
                        <span className="w-1 h-1 bg-brand rounded-full" />
                        <span className="text-[var(--text-secondary)]">
                            {new Intl.DateTimeFormat(dateLocale, { month: "short", day: "numeric", year: "numeric" }).format(new Date(playlist.weekStart))}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-1 h-1 bg-type-track rounded-full" />
                        <span className="text-[var(--text-secondary)]">
                            {`${playlist.totalCount.toLocaleString(locale)} ${t(playlist.totalCount === 1 ? "track" : "tracks")}`}
                        </span>
                    </div>
                    {totalDuration > 0 && (
                        <div className="flex items-center gap-2">
                            <span className="w-1 h-1 bg-white/20 rounded-full" />
                            <span className="text-[var(--text-secondary)]">
                                {formatTotalDuration(totalDuration)}
                            </span>
                        </div>
                    )}
                    {config?.lastGeneratedAt && (
                        <div className="flex items-center gap-2">
                            <span className="w-1 h-1 bg-white/20 rounded-full" />
                            <span className="text-[var(--text-secondary)]">
                                {t("Updated")} {new Intl.DateTimeFormat(dateLocale, { month: "short", day: "numeric" }).format(new Date(config.lastGeneratedAt))}
                            </span>
                        </div>
                    )}
                </div>
            )}
        </PageHeader>
    );
}
