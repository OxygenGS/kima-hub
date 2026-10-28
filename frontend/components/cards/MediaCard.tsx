"use client";

import { memo, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { Loader2, Trash2, type LucideIcon } from "lucide-react";
import { CachedImage } from "@/components/ui/CachedImage";
import { cn } from "@/lib/cn";
import { MOOD_COLORS, moodLabel } from "@/features/vibe/mapUtils";
import { useLanguage } from "@/lib/i18n/language-context";
import { translate } from "@/lib/i18n/translations";
import cardStyles from "./MediaCard.module.css";

type MediaType = "artist" | "album" | "track" | "podcast" | "audiobook";

const TYPE_STYLES: Record<MediaType, { border: string; bar: string }> = {
    artist: { border: "hover:border-type-artist/50", bar: "bg-type-artist" },
    album: { border: "hover:border-type-album/50", bar: "bg-type-album" },
    track: { border: "hover:border-type-track/50", bar: "bg-type-track" },
    podcast: { border: "hover:border-type-podcast/50", bar: "bg-type-podcast" },
    audiobook: { border: "hover:border-type-audiobook/50", bar: "bg-type-audiobook" },
};

interface MediaCardAction {
    icon: LucideIcon;
    label: string;
    onClick: () => void;
    busy?: boolean;
}

interface MediaCardProps {
    href?: string;
    title: string;
    subtitle?: ReactNode;
    imageUrl?: string | string[] | null;
    fallbackIcon: LucideIcon;
    type: MediaType;
    aspect?: "square" | "portrait";
    index?: number;
    sizes?: string;
    badge?: ReactNode;
    corner?: ReactNode;
    progress?: number;
    action?: MediaCardAction;
    /** One of the five mood keys; marks the card's meta with a dot in its map colour. */
    moodKey?: string | null;
    onDelete?: () => void;
    /** Begin warming a linked detail page on user intent (hover/focus). */
    onPrefetch?: () => void;
    className?: string;
}

function stop(handler: () => void) {
    return (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        handler();
    };
}

function Cover({ imageUrl, title, sizes, FallbackIcon }: {
    imageUrl?: string | string[] | null;
    title: string;
    sizes: string;
    FallbackIcon: LucideIcon;
}) {
    const [broken, setBroken] = useState(false);
    const urls = (Array.isArray(imageUrl) ? imageUrl : [imageUrl]).filter((url): url is string => !!url);
    if (urls.length === 0 || broken) return <FallbackIcon className="w-10 h-10 text-[var(--text-muted)]" />;
    if (urls.length === 1) {
        return <CachedImage src={urls[0]} alt={title} fill sizes={sizes} className="object-cover cover-zoom" onError={() => setBroken(true)} />;
    }
    return (
        <div className="grid grid-cols-2 w-full h-full cover-zoom">
            {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="relative flex items-center justify-center">
                    {urls[i] ? <CachedImage src={urls[i]} alt="" fill sizes="100px" className="object-cover" /> : <FallbackIcon className="w-6 h-6 text-[var(--text-muted)]" />}
                </div>
            ))}
        </div>
    );
}

export const MediaCard = memo(function MediaCard({
    href, title, subtitle, imageUrl, fallbackIcon, type, aspect = "square", index = 0,
    sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw",
    badge, corner, progress, action, moodKey, onDelete, onPrefetch, className,
}: MediaCardProps) {
    const { locale } = useLanguage();
    const styles = TYPE_STYLES[type];
    const ActionIcon = action?.busy ? Loader2 : action?.icon;
    const moodColour = moodKey && moodKey !== "unanalyzed" ? MOOD_COLORS[moodKey] ?? null : null;

    const body = (
        <div className="relative">
            <div className={cn(
                "relative w-full h-full bg-[#181818] flex items-center justify-center overflow-hidden",
                "rounded-lg ring-1 ring-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.35)]",
                aspect === "portrait" ? "aspect-[2/3]" : "aspect-square", cardStyles.art,
            )}>
                <Cover key={String(imageUrl)} imageUrl={imageUrl} title={title} sizes={sizes} FallbackIcon={fallbackIcon} />
                {badge && <div className="absolute top-2 left-2">{badge}</div>}
                {corner && <div className="absolute top-2 right-2">{corner}</div>}
                {progress !== undefined && progress > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/60">
                        <div className="h-full bg-brand" style={{ width: `${Math.min(progress, 100)}%` }} />
                    </div>
                )}
                {action && ActionIcon && (
                    <>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
                        <button type="button" onClick={stop(action.onClick)} disabled={action.busy}
                            aria-label={`${translate(locale, action.label)} ${title}`} title={translate(locale, action.label)}
                            className={cn(
                                "absolute bottom-3 right-3 w-11 h-11 rounded-full border border-white/15 bg-black/55 backdrop-blur-[2px]",
                                "flex items-center justify-center transition-[transform,background-color] duration-150",
                                "hover:bg-black/75 hover:scale-105 active:scale-95 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white", cardStyles.action,
                            )}>
                            <ActionIcon className={cn("w-5 h-5", action.busy ? "animate-spin" : "fill-current ml-0.5", cardStyles.actionIcon)} />
                        </button>
                    </>
                )}
                {onDelete && (
                    <button type="button" onClick={stop(onDelete)} aria-label={`${translate(locale, "Delete")} ${title}`} title={`${translate(locale, "Delete")} ${title}`}
                        className="absolute top-2 right-2 w-11 h-11 rounded-full bg-black/80 border border-white/20 hidden md:flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-danger/90 transition-opacity duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                        <Trash2 className="w-4 h-4 text-white" />
                    </button>
                )}
            </div>
            <div className={cn("h-0.5 mt-1 scale-x-0 group-hover:scale-x-100 transition-transform duration-150", styles.bar, cardStyles.accent)} />
            <div className={cn("pt-1.5 px-0.5", cardStyles.details)}>
                <h3 className={cn("text-sm font-bold text-white truncate tracking-tight", cardStyles.title)} title={title}>{title}</h3>
                {subtitle && (
                    <p className={cn("flex items-center gap-1.5 text-xs tabular-nums text-[var(--text-muted)] mt-0.5", cardStyles.subtitle)}>
                        {moodColour && <span role="img" aria-label={translate(locale, moodLabel(moodKey!))} title={translate(locale, moodLabel(moodKey!))} className="size-1.5 shrink-0 rounded-full" style={{ background: `rgb(${moodColour[0]} ${moodColour[1]} ${moodColour[2]})` }} />}
                        <span className="truncate">{subtitle}</span>
                    </p>
                )}
            </div>
        </div>
    );
    const rootProps = {
        "data-tv-card": true,
        "data-tv-card-index": index,
        "data-media-type": type,
        style: { "--i": index } as CSSProperties,
        className: cn("group block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)] animate-rise motion-reduce:animate-none [animation-delay:calc(var(--i)*var(--stagger))]", cardStyles.card, className),
    };
    return href ? <Link href={href} {...rootProps} onMouseEnter={onPrefetch} onFocus={onPrefetch}>{body}</Link> : <div tabIndex={0} {...rootProps}>{body}</div>;
});
