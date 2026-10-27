"use client";

import { useState, memo, useCallback } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import { translate } from "@/lib/i18n/translations";
import { Track } from "../types";
import { EmptyState } from "@/components/ui/EmptyState";
import { PlaylistSelector } from "@/components/ui/PlaylistSelector";
import { CollectionTracksSkeleton } from "@/features/library/components/CollectionGridSkeleton";
import { CachedImage } from "@/components/ui/CachedImage";
import { AudioLines, ListPlus, Plus, Trash2, Play } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/format";
import { api } from "@/lib/api";
import { useAudioState } from "@/lib/audio-state-context";
import { useDoubleTap } from "@/hooks/useDoubleTap";
import { cascadeStyle } from "@/lib/motion";

interface TracksListProps {
    tracks: Track[];
    onPlay: (tracks: Track[], startIndex?: number) => void;
    onAddToQueue: (track: Track) => void;
    onAddToPlaylist: (playlistId: string, trackId: string) => void;
    onDelete: (trackId: string, trackTitle: string) => void;
    isLoading?: boolean;
    gridKey?: number;
}

interface TrackRowProps {
    track: Track;
    index: number;
    isCurrentlyPlaying: boolean;
    onPlay: TracksListProps["onPlay"];
    tracks: Track[];
    onAddToQueue: (track: Track) => void;
    onShowAddToPlaylist: (trackId: string) => void;
    onDelete: (trackId: string, trackTitle: string) => void;
}

const TrackRow = memo(
    function TrackRow({
        track,
        index,
        isCurrentlyPlaying,
        onPlay,
        tracks,
        onAddToQueue,
        onShowAddToPlaylist,
        onDelete,
    }: TrackRowProps) {
        const { locale } = useLanguage();
        const onPlayTrack = useCallback(() => onPlay(tracks, index), [onPlay, tracks, index]);
        const doubleTapProps = useDoubleTap(onPlayTrack);
        const displayTrackNumber =
            typeof track.trackNumber === "number"
                ? track.trackNumber
                : index + 1;
        const displayDiscNumber =
            typeof track.discNumber === "number" ? track.discNumber : null;
        const displayTrackLabel =
            displayDiscNumber && displayDiscNumber > 1
                ? `${displayDiscNumber}-${String(displayTrackNumber).padStart(2, "0")}`
                : String(displayTrackNumber);
        return (
            <div
                key={track.id}
                {...doubleTapProps}
                onKeyDown={(event) => {
                    if (event.key === "Enter" && event.target === event.currentTarget) {
                        event.preventDefault();
                        onPlayTrack();
                    }
                }}
                data-tv-card
                data-tv-card-index={index}
                tabIndex={0}
                style={{ "--i": index } as React.CSSProperties}
                className={cn(
                    "grid grid-cols-[44px_minmax(0,1fr)] sm:grid-cols-[44px_minmax(0,1fr)_auto] md:grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 sm:gap-3 px-2 sm:px-4 py-2 sm:py-3 rounded-lg border-2 transition-colors duration-200 group cursor-pointer touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70",
                    isCurrentlyPlaying
                        ? "bg-brand/10 border-brand/30 "
                        : "bg-[var(--bg-primary)] border-white/5 hover:border-brand/30 hover:bg-brand/5",
                    "animate-rise [animation-delay:calc(var(--i)*var(--stagger))]",
                )}
            >
                <div className="w-11 flex items-center justify-center">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onPlayTrack();
                        }}
                        className="group/play w-11 h-11 flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                        aria-label={translate(locale, isCurrentlyPlaying ? "Pause" : "Play")}
                    >
                        <span
                            className={cn(
                                "text-sm tabular-nums font-bold group-hover:hidden",
                                isCurrentlyPlaying ? "text-brand" : "text-[var(--text-muted)]",
                            )}
                        >
                            {isCurrentlyPlaying ?
                                <AudioLines className="w-4 h-4 text-brand" />
                            :   displayTrackLabel}
                        </span>
                        <Play className="w-4 h-4 text-brand opacity-0 group-hover:opacity-100 group-focus-visible/play:opacity-100 transition-opacity duration-150 fill-current" />
                    </button>
                </div>

                <div className="flex items-center gap-3 min-w-0">
                    <div className="relative w-11 h-11 bg-[#181818] rounded border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                        {track.album?.coverArt ?
                            <CachedImage
                                src={api.getCoverArtUrl(
                                    track.album.coverArt,
                                    80,
                                )}
                                alt={track.title}
                                fill
                                sizes="40px"
                                className="object-cover"
                            />
                        :   <AudioLines className="w-5 h-5 text-[var(--text-muted)]" />}
                    </div>
                    <div className="min-w-0">
                        <h3
                            className={cn(
                                "text-sm font-bold truncate tracking-tight",
                                isCurrentlyPlaying ? "text-brand" : "text-white",
                            )}
                        >
                            {track.displayTitle ?? track.title}
                        </h3>
                        <p className="text-xs tabular-nums text-[var(--text-muted)] truncate">
                            {track.album?.artist?.name}
                        </p>
                    </div>
                </div>

                <div className="hidden md:block min-w-0">
                    <p className="text-xs tabular-nums text-[var(--text-muted)] truncate">
                        {track.album?.title}
                    </p>
                </div>

                <div className="col-span-2 sm:col-span-1 flex items-center justify-end gap-0.5 sm:gap-1">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onAddToQueue(track);
                        }}
                        className="w-11 h-11 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-white hover:bg-white/10 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus-visible:opacity-100 transition-colors duration-150 border border-transparent hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70"
                        title={translate(locale, "Add to queue")}
                        aria-label={translate(locale, "Add to queue")}
                    >
                        <ListPlus className="w-4 h-4" />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onShowAddToPlaylist(track.id);
                        }}
                        className="w-11 h-11 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-white hover:bg-white/10 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus-visible:opacity-100 transition-colors duration-150 border border-transparent hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/70"
                        title={translate(locale, "Add to playlist")}
                        aria-label={translate(locale, "Add to playlist")}
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(track.id, track.title);
                        }}
                        className="w-11 h-11 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-danger hover:bg-danger/10 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus-visible:opacity-100 transition-colors duration-150 border border-transparent hover:border-danger/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/70"
                        title={translate(locale, "Delete Track")}
                        aria-label={translate(locale, "Delete Track")}
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                    <span className="text-sm tabular-nums font-bold text-[var(--text-muted)] w-12 text-right">
                        {formatTime(track.duration)}
                    </span>
                </div>
            </div>
        );
    },
    (prevProps, nextProps) => {
        return (
            prevProps.track.id === nextProps.track.id &&
            prevProps.track.title === nextProps.track.title &&
            prevProps.track.displayTitle === nextProps.track.displayTitle &&
            prevProps.track.duration === nextProps.track.duration &&
            prevProps.track.trackNumber === nextProps.track.trackNumber &&
            prevProps.track.discNumber === nextProps.track.discNumber &&
            prevProps.track.album?.title === nextProps.track.album?.title &&
            prevProps.track.album?.coverArt === nextProps.track.album?.coverArt &&
            prevProps.track.album?.artist?.name === nextProps.track.album?.artist?.name &&
            prevProps.isCurrentlyPlaying === nextProps.isCurrentlyPlaying &&
            prevProps.index === nextProps.index &&
            prevProps.onPlay === nextProps.onPlay &&
            prevProps.tracks === nextProps.tracks &&
            prevProps.onAddToQueue === nextProps.onAddToQueue &&
            prevProps.onShowAddToPlaylist === nextProps.onShowAddToPlaylist &&
            prevProps.onDelete === nextProps.onDelete
        );
    },
);

export function TracksList({
    tracks,
    onPlay,
    onAddToQueue,
    onAddToPlaylist,
    onDelete,
    isLoading = false,
    gridKey,
}: TracksListProps) {
    const { locale } = useLanguage();
    const { currentTrack } = useAudioState();
    const currentTrackId = currentTrack?.id;
    const [showPlaylistSelector, setShowPlaylistSelector] = useState(false);
    const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

    const handleShowAddToPlaylist = useCallback((trackId: string) => {
        setSelectedTrackId(trackId);
        setShowPlaylistSelector(true);
    }, []);

    const handleAddToPlaylist = useCallback(
        async (playlistId: string) => {
            if (!selectedTrackId) return;
            onAddToPlaylist(playlistId, selectedTrackId);
            setShowPlaylistSelector(false);
            setSelectedTrackId(null);
        },
        [selectedTrackId, onAddToPlaylist],
    );

    if (isLoading) {
        return <CollectionTracksSkeleton />;
    }

    if (tracks.length === 0) {
        return (
            <EmptyState
                icon={<AudioLines className="w-12 h-12" />}
                title={translate(locale, "No songs yet")}
                description={translate(locale, "Your library is empty. Sync your music to get started.")}
            />
        );
    }

    return (
        <>
            <div className="grid grid-cols-[44px_minmax(0,1fr)] sm:grid-cols-[44px_minmax(0,1fr)_auto] md:grid-cols-[44px_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2 sm:gap-3 px-2 sm:px-4 py-3 bg-[var(--bg-primary)] border-2 border-white/10 rounded-lg mb-2">
                <div className="w-11 text-center text-xs font-semibold text-[var(--text-muted)]">#</div>
                <div className="text-xs font-semibold text-[var(--text-muted)]">{translate(locale, "Title")}</div>
                <div className="hidden md:block text-xs font-semibold text-[var(--text-muted)]">{translate(locale, "Album")}</div>
                <div className="hidden sm:block min-w-[180px] text-right pr-2 text-xs font-semibold text-[var(--text-muted)]">{translate(locale, "Duration")}</div>
            </div>

            <div key={gridKey} data-tv-section="library-tracks" className="space-y-1" style={cascadeStyle(tracks.length)}>
                {tracks.map((track, index) => {
                    const isCurrentlyPlaying = currentTrackId === track.id;
                    return (
                        <TrackRow
                            key={track.id}
                            track={track}
                            index={index}
                            isCurrentlyPlaying={isCurrentlyPlaying}
                            onPlay={onPlay}
                            tracks={tracks}
                            onAddToQueue={onAddToQueue}
                            onShowAddToPlaylist={handleShowAddToPlaylist}
                            onDelete={onDelete}
                        />
                    );
                })}
            </div>

            <PlaylistSelector
                isOpen={showPlaylistSelector}
                onClose={() => {
                    setShowPlaylistSelector(false);
                    setSelectedTrackId(null);
                }}
                onSelectPlaylist={handleAddToPlaylist}
            />
        </>
    );
}
