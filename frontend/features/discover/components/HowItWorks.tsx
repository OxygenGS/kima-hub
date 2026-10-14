"use client";

import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useLanguage } from "@/lib/i18n/language-context";

export function HowItWorks() {
    const { t } = useLanguage();
    return (
        <Card className="p-6 bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-white">
                {t("How It Works")}
            </h3>
            <div className="space-y-3 text-sm text-[var(--text-secondary)]">
                <div className="flex items-start gap-3">
                    <ChevronRight className="w-4 h-4 mt-0.5 text-purple-500/60 shrink-0" />
                    <p>
                        {t("Analyzes your listening history and library using Last.fm similarity data")}
                    </p>
                </div>
                <div className="flex items-start gap-3">
                    <ChevronRight className="w-4 h-4 mt-0.5 text-purple-500/60 shrink-0" />
                    <p>
                        {t("Discovers similar artists across tiers: High (80-100%), Medium (50-79%), Explore (30-49%), Wild Cards (0-29%)")}
                    </p>
                </div>
                <div className="flex items-start gap-3">
                    <ChevronRight className="w-4 h-4 mt-0.5 text-purple-500/60 shrink-0" />
                    <p>
                        {t("Selecting one song from an album downloads the full album to")} <span className="text-[var(--text-secondary)]">/music/discovery</span>
                    </p>
                </div>
                <div className="flex items-start gap-3">
                    <ChevronRight className="w-4 h-4 mt-0.5 text-purple-500/60 shrink-0" />
                    <p>
                        {t("Like an album to keep it in your library. Unliked albums are removed at the end of the week.")}
                    </p>
                </div>
                <div className="flex items-start gap-3">
                    <ChevronRight className="w-4 h-4 mt-0.5 text-purple-500/60 shrink-0" />
                    <p>{t("Albums won't repeat for 6 months")}</p>
                </div>
                <div className="flex items-start gap-3">
                    <ChevronRight className="w-4 h-4 mt-0.5 text-purple-500/60 shrink-0" />
                    <p>
                        {t("If an album isn't available to download, it's automatically replaced and you can still preview it via Deezer")}
                    </p>
                </div>
            </div>
        </Card>
    );
}
