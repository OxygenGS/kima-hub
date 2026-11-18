"use client";

import { useId } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import { AUDIOBOOK_SPEEDS, isAudiobookSpeed, useAudiobookSpeed } from "@/lib/audiobook-speed";

/** Applies only to the audiobook player; music and podcasts stay at 1x. */
export function AudiobookSpeedSelect({ compact = false }: { compact?: boolean }) {
    const { locale } = useLanguage();
    const { speed, setSpeed } = useAudiobookSpeed();
    const id = useId();
    const text = locale === "nl" ? "Luistersnelheid" : "Audiobook speed";
    return (
        <label htmlFor={id} className="inline-flex min-h-10 items-center gap-2 text-xs text-[var(--text-secondary)]">
            {!compact && <span>{text}</span>}
            <select
                id={id}
                aria-label={text}
                value={String(speed)}
                onChange={event => {
                    const value = Number(event.currentTarget.value);
                    if (isAudiobookSpeed(value)) setSpeed(value);
                }}
                className="min-h-10 min-w-16 cursor-pointer rounded-lg border border-white/15 bg-[var(--bg-tertiary)] px-2 text-xs text-[var(--text-primary)] focus-visible:ring-2 focus-visible:ring-brand"
            >
                {AUDIOBOOK_SPEEDS.map(value =>
                    <option key={value} value={String(value)}>{value}×</option>
                )}
            </select>
        </label>
    );
}
