"use client";

import { Download, ListPlus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useMusicPermissions } from "@/lib/auth-context";
import { useLanguage } from "@/lib/i18n/language-context";
import { MediaActionBar, MediaActionButton } from "@/components/ui/MediaActionBar";
import type { Album, AlbumSource } from "../types";

interface AlbumActionBarProps {
    album: Album;
    source: AlbumSource;
    onPlayAll: () => void;
    onShuffle: () => void;
    onDownloadAlbum: () => void;
    onAddToPlaylist: () => void;
    isPendingDownload: boolean;
    isPlaying: boolean;
    isPlayingThisAlbum: boolean;
    onPause: () => void;
}

export function AlbumActionBar({
    album, source, onPlayAll, onShuffle, onDownloadAlbum, onAddToPlaylist,
    isPendingDownload, isPlaying, isPlayingThisAlbum, onPause,
}: AlbumActionBarProps) {
    const { canRequestAlbums } = useMusicPermissions();
    const { t } = useLanguage();
    const isOwned = album.owned !== undefined ? album.owned : source === "library";
    const showDownload = canRequestAlbums && !isOwned && (album.mbid || album.rgMbid);
    const showPause = isPlaying && isPlayingThisAlbum;
    const handlePlayPauseClick = () => {
        if (showPause) onPause();
        else onPlayAll();
    };

    return (
        <MediaActionBar
            showPlay={isOwned}
            showPause={showPause}
            onPlayPause={handlePlayPauseClick}
            onShuffle={onShuffle}
            secondaryShape="square"
            showLabels
        >
            {isOwned && (
                <MediaActionButton
                    shape="square"
                    icon={<ListPlus className="w-5 h-5 shrink-0" aria-hidden="true" />}
                    label={t("add to playlist")}
                    onClick={onAddToPlaylist}
                    showLabel
                />
            )}
            {showDownload && (
                <button
                    type="button"
                    onClick={onDownloadAlbum}
                    disabled={isPendingDownload}
                    aria-busy={isPendingDownload}
                    className={cn(
                        "min-h-11 min-w-11 max-w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold normal-case transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]",
                        isPendingDownload ? "bg-white/5 text-[var(--text-secondary)] cursor-not-allowed" : "bg-brand hover:bg-brand-hover text-[var(--color-on-brand)]",
                    )}
                >
                    <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{isPendingDownload ? t("Requesting...") : t("Request album")}</span>
                </button>
            )}
        </MediaActionBar>
    );
}
