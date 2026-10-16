"use client";

import { Play, Pause, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { useLanguage } from "@/lib/i18n/language-context";
import type { DiscoverPlaylist } from "../types";

interface DiscoverActionBarProps {
    playlist: DiscoverPlaylist | null;
    isPlaylistPlaying: boolean;
    isPlaying: boolean;
    onPlayToggle: () => void;
    isGenerating: boolean;
    onCancelGeneration?: () => void;
}

export function DiscoverActionBar({
    playlist,
    isPlaylistPlaying,
    isPlaying,
    onPlayToggle,
    isGenerating,
    onCancelGeneration,
}: DiscoverActionBarProps) {
    const { t } = useLanguage();
    return (
        <div className=" px-6 md:px-8 py-6">
            <div className="max-w-[1600px] mx-auto flex items-center gap-4">
                {/* Play Button */}
                {playlist && playlist.tracks.length > 0 && (
                    <button
                        onClick={onPlayToggle}
                        aria-label={isPlaylistPlaying && isPlaying ? t("Pause") : t("Play")}
                        disabled={isGenerating}
                        className={cn(
                            "h-12 w-12 flex items-center justify-center border-2 rounded-lg transition-all duration-300",
                            isGenerating ?
                                "border-white/20 bg-white/5 cursor-not-allowed opacity-50"
                            :   "border-brand bg-brand hover:bg-brand-hover hover:border-brand-hover hover:scale-110",
                        )}
                    >
                        {isPlaylistPlaying && isPlaying ?
                            <Pause className="w-5 h-5 fill-current text-brand-contrast" />
                        :   <Play className="w-5 h-5 fill-current text-brand-contrast ml-0.5" />
                        }
                    </button>
                )}

                {/* Cancel Generation Button */}
                {isGenerating && onCancelGeneration && (
                    <button
                        onClick={onCancelGeneration}
                        aria-label={t("Cancel")}
                        className="h-12 px-4 flex items-center gap-2 border-2 border-red-500/30 hover:border-red-500 hover:bg-red-500/10 text-red-400 rounded-lg transition-all duration-300 text-sm font-bold"
                    >
                        <X className="w-4 h-4" />
                        {t("Cancel")}
                    </button>
                )}
            </div>
        </div>
    );
}
