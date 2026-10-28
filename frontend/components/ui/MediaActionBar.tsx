"use client";

import { memo, type ReactNode } from "react";
import { Play, Pause, Shuffle } from "lucide-react";
import { cn } from "@/lib/cn";
import { useLanguage } from "@/lib/i18n/language-context";
import { translate } from "@/lib/i18n/translations";

interface MediaActionBarProps {
    /** The play disc hides when there is nothing to play (an unowned album). */
    showPlay?: boolean;
    showPause: boolean;
    onPlayPause: () => void;
    onShuffle?: () => void;
    discShape?: "circle" | "square";
    secondaryShape: "circle" | "square";
    /** Opt-in text actions on music detail pages; existing callers stay icon-only. */
    showLabels?: boolean;
    children?: ReactNode;
}

/** The brand play/pause button; callbacks are unchanged by its presentation. */
export const PlayDisc = memo(function PlayDisc({
    showPause, onClick, shape, disabled, label, showLabel = false,
}: {
    showPause: boolean;
    onClick: () => void;
    shape: "circle" | "square";
    disabled?: boolean;
    label?: string;
    showLabel?: boolean;
}) {
    const { locale } = useLanguage();
    const accessibleLabel = translate(locale, label ?? (showPause ? "pause" : "play all"));
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={accessibleLabel}
            className={cn(
                "h-12 flex items-center justify-center transition-transform motion-reduce:transition-none motion-reduce:transform-none hover:scale-105 active:scale-95 motion-reduce:hover:scale-100 motion-reduce:active:scale-100 bg-brand disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]",
                showLabel ? "min-w-12 max-w-full gap-2.5 px-5 rounded-xl text-sm font-semibold text-[var(--color-on-brand)] normal-case" : "w-12",
                !showLabel && (shape === "circle" ? "rounded-full" : "rounded-lg"),
            )}
        >
            {showPause ? (
                <Pause className="w-5 h-5 shrink-0 fill-current text-[var(--color-on-brand)]" aria-hidden="true" />
            ) : (
                <Play className="w-5 h-5 shrink-0 fill-current text-[var(--color-on-brand)] ml-0.5" aria-hidden="true" />
            )}
            {showLabel && <span>{accessibleLabel}</span>}
        </button>
    );
});

/** Playback actions retain the same visibility and callbacks in both layouts. */
export const MediaActionBar = memo(function MediaActionBar({
    showPlay = true, showPause, onPlayPause, onShuffle, discShape = "circle",
    secondaryShape, showLabels = false, children,
}: MediaActionBarProps) {
    const { t } = useLanguage();
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-x-4" data-labelled-actions={showLabels || undefined}>
            {showPlay && (
                <PlayDisc showPause={showPause} onClick={onPlayPause} shape={discShape} showLabel={showLabels} />
            )}
            {showPlay && onShuffle && (
                <MediaActionButton
                    shape={secondaryShape}
                    icon={<Shuffle className="w-5 h-5 shrink-0" aria-hidden="true" />}
                    label={t("shuffle play")}
                    onClick={onShuffle}
                    showLabel={showLabels}
                />
            )}
            {children}
        </div>
    );
});

interface MediaActionButtonProps {
    icon: ReactNode;
    label: string;
    onClick: () => void;
    disabled?: boolean;
    shape: "circle" | "square";
    showLabel?: boolean;
}

export const MediaActionButton = memo(function MediaActionButton({
    icon, label, onClick, disabled, shape, showLabel = false,
}: MediaActionButtonProps) {
    const { locale } = useLanguage();
    const accessibleLabel = translate(locale, label);
    return (
        <button
            type="button"
            onClick={onClick}
            title={accessibleLabel}
            aria-label={accessibleLabel}
            disabled={disabled}
            className={cn(
                "min-h-11 min-w-11 max-w-full hover:bg-white/10 flex items-center justify-center text-[var(--text-secondary)] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)] disabled:opacity-50",
                showLabel ? "gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-xs font-medium normal-case" : (shape === "circle" ? "rounded-full" : "rounded-lg"),
            )}
        >
            {icon}
            {showLabel && <span className="min-w-0 break-words">{accessibleLabel}</span>}
        </button>
    );
});
