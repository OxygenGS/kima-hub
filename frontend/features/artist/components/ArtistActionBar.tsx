"use client";

import { Download, Radio } from "lucide-react";
import { cn } from "@/lib/cn";
import { useMusicPermissions } from "@/lib/auth-context";
import { useLanguage } from "@/lib/i18n/language-context";
import { MediaActionBar, MediaActionButton } from "@/components/ui/MediaActionBar";
import type { Album, ArtistSource } from "../types";

interface ArtistActionBarProps {
    albums: Album[];
    source: ArtistSource | null;
    onPlayAll: () => void;
    onShuffle: () => void;
    onDownloadAll: () => void;
    onStartRadio: () => void;
    isPendingDownload: boolean;
    isPlaying: boolean;
    isPlayingThisArtist: boolean;
    onPause: () => void;
}

export function ArtistActionBar({
    albums,
    source,
    onPlayAll,
    onShuffle,
    onDownloadAll,
    onStartRadio,
    isPendingDownload,
    isPlaying,
    isPlayingThisArtist,
    onPause,
}: ArtistActionBarProps) {
    const { canRequestAlbums } = useMusicPermissions();
    const { t } = useLanguage();
    const availableAlbums = albums.filter(
        (album) => album.availability !== "unavailable"
    );
    const showDownloadAll = canRequestAlbums && (source === "discovery" || availableAlbums.length > 0);
    const showPause = isPlaying && isPlayingThisArtist;
    const showRadio = source === "library";

    const handlePlayPauseClick = () => {
        if (showPause) {
            onPause();
        } else {
            onPlayAll();
        }
    };

    return (
        <MediaActionBar
            showPause={showPause}
            onPlayPause={handlePlayPauseClick}
            onShuffle={onShuffle}
            secondaryShape="square"
        >
            {showRadio && (
                <MediaActionButton
                    shape="square"
                    icon={<Radio className="w-5 h-5" />}
                    label="start artist radio"
                    onClick={onStartRadio}
                />
            )}

            {showDownloadAll && (
                <button
                    onClick={onDownloadAll}
                    disabled={isPendingDownload}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all",
                        isPendingDownload
                            ? "bg-white/5 text-[var(--text-secondary)] cursor-not-allowed"
                            : "bg-white/5 hover:bg-white/10 text-[var(--text-primary)] hover:text-white"
                    )}
                >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">
                        {isPendingDownload ? t("Requesting...") : t("Request albums")}
                    </span>
                </button>
            )}
        </MediaActionBar>
    );
}
