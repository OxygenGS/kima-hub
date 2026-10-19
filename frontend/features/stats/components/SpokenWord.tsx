"use client";

/**
 * Audiobook and podcast hours, measured from real playback positions, so
 * unlike music time they are stated without "about".
 */

import { hoursValue } from "../format";
import { formatStatsCount } from "../locale-format";
import { useLanguage } from "@/lib/i18n/language-context";
import { translate } from "@/lib/i18n/translations";
import type { SpokenStats } from "../types";

export function SpokenWord({ spoken }: { spoken: SpokenStats }) {
    const { locale } = useLanguage();
    const t = (label: string) => translate(locale, label);
    const { audiobooks, podcasts } = spoken;

    if (audiobooks.seconds === 0 && podcasts.seconds === 0) {
        return (
            <p className="t-body max-w-[34ch]">
                {t("no podcasts or audiobooks yet")}
            </p>
        );
    }

    return (
        <div className="flex flex-col gap-5">
            {audiobooks.seconds > 0 && (
                <Entry
                    value={hoursValue(audiobooks.seconds, locale)}
                    unit={t("hours of audiobooks")}
                    lines={[
                        joined([
                            audiobooks.finished > 0 && `${formatStatsCount(audiobooks.finished, locale)} ${t("finished")}`,
                            audiobooks.inProgress > 0 && `${formatStatsCount(audiobooks.inProgress, locale)} ${t("in progress")}`,
                            audiobooks.setAside > 0 && `${formatStatsCount(audiobooks.setAside, locale)} ${t("untouched 90+ days")}`,
                        ]),
                        audiobooks.current &&
                            `${t("current:")} ${audiobooks.current.title} · ${Math.round(audiobooks.current.percent * 100)}%`,
                        audiobooks.topAuthors[0] && `${t("top author:")} ${audiobooks.topAuthors[0].name}`,
                    ]}
                />
            )}

            {podcasts.seconds > 0 && (
                <Entry
                    value={hoursValue(podcasts.seconds, locale)}
                    unit={t("hours of podcasts")}
                    lines={[
                        joined([
                            podcasts.subscriptions > 0 &&
                                `${formatStatsCount(podcasts.subscriptions, locale)} ${t(podcasts.subscriptions === 1 ? "subscription" : "subscriptions")}`,
                            podcasts.finished > 0 &&
                                `${formatStatsCount(podcasts.finished, locale)} ${t(podcasts.finished === 1 ? "episode" : "episodes")} ${t("finished")}`,
                        ]),
                        podcasts.backlog > 0 &&
                            `${formatStatsCount(podcasts.backlog, locale)} ${t("unplayed (count)")} ${t(podcasts.backlog === 1 ? "episode" : "episodes")}`,
                    ]}
                />
            )}
        </div>
    );
}

/** A measured figure and the two or three facts that qualify it. */
function Entry({
    value,
    unit,
    lines,
}: {
    value: string;
    unit: string;
    lines: Array<string | false | null | undefined>;
}) {
    const kept = lines.filter(Boolean) as string[];
    return (
        <div className="flex flex-col gap-1.5">
            <p className="flex items-baseline gap-2">
                <span className="t-figure text-[length:var(--stat-figure)]">{value}</span>
                <span className="t-label">{unit}</span>
            </p>
            {kept.map((line) => (
                <p key={line} className="t-meta max-w-[32ch]">
                    {line}
                </p>
            ))}
        </div>
    );
}

/** The parts that exist, on one line; nothing when none do. */
function joined(parts: Array<string | false>): string {
    return (parts.filter(Boolean) as string[]).join(" · ");
}
