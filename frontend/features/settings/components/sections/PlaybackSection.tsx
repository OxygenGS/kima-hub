"use client";

import { SettingsSection, SettingsRow, SettingsSelect, SettingsInput } from "../ui";
import { UserSettings } from "../../types";
import { useTrackFormat } from "@/hooks/useTrackFormat";
import { formatTrackDisplay } from "@/lib/track-format";
import { useLanguage } from "@/lib/i18n/language-context";

interface PlaybackSectionProps {
    value: UserSettings["playbackQuality"];
    onChange: (quality: UserSettings["playbackQuality"]) => void;
}

const qualityOptions = [
    { value: "original", label: "Original (Lossless)" },
    { value: "high", label: "High (320 kbps)" },
    { value: "medium", label: "Medium (192 kbps)" },
    { value: "low", label: "Low (128 kbps)" },
];

const SAMPLE_TRACK = {
    title: "Midnight Rain",
    artist: "Taylor Swift",
    album: "Midnights",
    filename: "/music/Taylor Swift/Midnights/04 Midnight Rain.flac",
};

export function PlaybackSection({ value, onChange }: PlaybackSectionProps) {
    const { format, setFormat } = useTrackFormat();
    const { t } = useLanguage();
    const translatedQualityOptions = qualityOptions.map(option => ({
        ...option,
        label: t(option.label as "Original (Lossless)" | "High (320 kbps)" | "Medium (192 kbps)" | "Low (128 kbps)"),
    }));
    const preview = formatTrackDisplay(SAMPLE_TRACK, format);

    return (
        <SettingsSection id="playback" title={t("Playback")}>
            <SettingsRow
                label={t("Streaming quality")}
                description={t("Higher quality uses more bandwidth")}
            >
                <SettingsSelect
                    value={value}
                    onChange={(v) => onChange(v as UserSettings["playbackQuality"])}
                    options={translatedQualityOptions}
                />
            </SettingsRow>
            <SettingsRow
                label={t("Track title format")}
                description={t("Foobar2000-style format string. Leave empty for default.")}
            >
                <div className="flex flex-col gap-1.5 w-full max-w-sm">
                    <SettingsInput
                        value={format}
                        onChange={setFormat}
                        placeholder="[%artist% - ]$if2(%title%,$filepart(%filename%))"
                    />
                    {format && (
                        <p className="text-micro text-[var(--text-muted)] tabular-nums truncate">
                            {t("Preview:")} {preview}
                        </p>
                    )}
                </div>
            </SettingsRow>
        </SettingsSection>
    );
}
