"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useAudioState, useAudioControls } from "@/lib/audio-context";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/language-context";

import {
    Music,
    Play,
    X,
    Trash2,
    ListMusic,
    ChevronUp,
    ChevronDown,
} from "lucide-react";

export default function QueuePage() {
    const router = useRouter();
    const { isAuthenticated } = useAuth();
    const { queue, currentTrack, currentIndex, setQueue } = useAudioState();
    const { playTracks, removeFromQueue, clearQueue } = useAudioControls();
    const { toast } = useToast();
    const { t, locale } = useLanguage();

    useEffect(() => {
        if (!isAuthenticated) {
            router.push("/login");
        }
    }, [isAuthenticated, router]);

    const handleClearQueue = () => {
        clearQueue();
        toast.success(t("Queue cleared"));
    };

    const handleRemoveTrack = (index: number) => {
        removeFromQueue(index);
        toast.success(t("Removed from queue"));
    };

    const handlePlayFromQueue = (index: number) => {
        playTracks(queue, index);
        toast.success(t("Playing from queue"));
    };

    const handleMoveUp = (index: number) => {
        if (index <= currentIndex + 1) return;
        setQueue((prev) => {
            const newQueue = [...prev];
            [newQueue[index], newQueue[index - 1]] = [
                newQueue[index - 1],
                newQueue[index],
            ];
            return newQueue;
        });
    };

    const handleMoveDown = (index: number) => {
        if (index >= queue.length - 1 || index <= currentIndex) return;
        setQueue((prev) => {
            const newQueue = [...prev];
            [newQueue[index], newQueue[index + 1]] = [
                newQueue[index + 1],
                newQueue[index],
            ];
            return newQueue;
        });
    };

    if (!isAuthenticated) {
        return null;
    }

    // Split queue into current, next up, and previous
    const previousTracks = queue.slice(0, currentIndex);
    const nextTracks = queue.slice(currentIndex + 1);

    return (
        <div className="min-h-screen bg-[var(--bg-primary)]">
            <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <ListMusic className="w-8 h-8 text-purple-400" />
                                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white">
                                    {t("Queue")}
                                </h1>
                            </div>
                            <p className="text-[var(--text-secondary)]">
                                {queue.length.toLocaleString(locale === "nl" ? "nl-NL" : "en-US")} {t(queue.length === 1 ? "track" : "tracks")} {t("in queue")}
                            </p>
                        </div>
                        {queue.length > 0 && (
                            <Button
                                variant="secondary"
                                onClick={handleClearQueue}
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                {t("Clear Queue")}
                            </Button>
                        )}
                    </div>
                </div>

                {/* Empty State */}
                {queue.length === 0 && (
                    <EmptyState
                        icon={<ListMusic />}
                        title={t("No tracks in queue")}
                        description={t("Start playing music to see your queue here")}
                        action={{
                            label: t("Browse Library"),
                            onClick: () => router.push("/collection"),
                        }}
                    />
                )}

                {/* Now Playing */}
                {currentTrack && (
                    <section className="bg-[#111] rounded-lg p-6">
                        <h2 className="text-xl font-semibold text-white mb-4">
                            {t("Now Playing")}
                        </h2>
                        <Card>
                            <div className="flex items-center gap-4 p-4 bg-[var(--bg-hover)] border-l-2 border-purple-500">
                                <div className="relative flex-shrink-0 w-16 h-16">
                                    {currentTrack.album?.coverArt ? (
                                        <Image
                                            src={api.getCoverArtUrl(
                                                currentTrack.album.coverArt,
                                                100
                                            )}
                                            alt={currentTrack.album.title}
                                            fill
                                            sizes="64px"
                                            className="object-cover rounded-sm"
                                            unoptimized
                                        />
                                    ) : (
                                        <div className="w-16 h-16 bg-[var(--bg-primary)] rounded-sm flex items-center justify-center">
                                            <Music className="w-6 h-6 text-[var(--text-muted)]" />
                                        </div>
                                    )}
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <Play className="w-6 h-6 text-purple-400 fill-purple-400 animate-pulse" />
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-sm font-medium text-purple-400 truncate">
                                        {currentTrack.displayTitle ??
                                            currentTrack.title}
                                    </h3>
                                    <p className="text-sm text-[var(--text-secondary)] truncate">
                                        {currentTrack.artist?.name}
                                    </p>
                                    <p className="text-xs text-[var(--text-muted)] truncate">
                                        {currentTrack.album?.title}
                                    </p>
                                </div>
                                <div className="text-sm text-[var(--text-muted)]">
                                    {currentTrack.duration
                                        ? `${Math.floor(
                                              currentTrack.duration / 60
                                          )}:${(currentTrack.duration % 60)
                                              .toString()
                                              .padStart(2, "0")}`
                                        : ""}
                                </div>
                            </div>
                        </Card>
                    </section>
                )}

                {/* Next Up */}
                {nextTracks.length > 0 && (
                    <section className="bg-[#111] rounded-lg p-6">
                        <h2 className="text-xl font-semibold text-white mb-4">
                            {t("Next Up")} ({nextTracks.length.toLocaleString(locale === "nl" ? "nl-NL" : "en-US")})
                        </h2>
                        <Card>
                            <div className="divide-y divide-[#1c1c1c]">
                                {nextTracks.map((track, idx) => {
                                    const queueIndex = currentIndex + 1 + idx;
                                    return (
                                        <div
                                            key={`${track.id}-${queueIndex}`}
                                            className="flex items-center gap-4 p-4 hover:bg-[var(--bg-hover)] transition-colors group"
                                        >
                                            {/* Album Art */}
                                            <div className="relative flex-shrink-0 w-12 h-12">
                                                {track.album?.coverArt ? (
                                                    <Image
                                                        src={api.getCoverArtUrl(
                                                            track.album
                                                                .coverArt,
                                                            100
                                                        )}
                                                        alt={track.album.title}
                                                        fill
                                                        sizes="48px"
                                                        className="object-cover rounded-sm"
                                                        unoptimized
                                                    />
                                                ) : (
                                                    <div className="w-12 h-12 bg-[var(--bg-primary)] rounded-sm flex items-center justify-center">
                                                        <Music className="w-5 h-5 text-[var(--text-muted)]" />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Track Info */}
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-sm font-medium text-white truncate">
                                                    {track.displayTitle ??
                                                        track.title}
                                                </h3>
                                                <p className="text-sm text-[var(--text-secondary)] truncate">
                                                    {track.artist?.name}
                                                </p>
                                            </div>

                                            {/* Duration */}
                                            <div className="text-sm text-[var(--text-muted)]">
                                                {track.duration
                                                    ? `${Math.floor(
                                                          track.duration / 60
                                                      )}:${(track.duration % 60)
                                                          .toString()
                                                          .padStart(2, "0")}`
                                                    : ""}
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() =>
                                                        handleMoveUp(queueIndex)
                                                    }
                                                    disabled={
                                                        queueIndex <=
                                                        currentIndex + 1
                                                    }
                                                    className="p-2.5 min-h-[44px] min-w-[44px] hover:bg-[var(--bg-primary)] rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                                                    aria-label={`${t("Move")} ${track.displayTitle ?? track.title} ${t("up")}`}
                                                >
                                                    <ChevronUp className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        handleMoveDown(
                                                            queueIndex
                                                        )
                                                    }
                                                    disabled={
                                                        queueIndex >=
                                                        queue.length - 1
                                                    }
                                                    className="p-2.5 min-h-[44px] min-w-[44px] hover:bg-[var(--bg-primary)] rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                                                    aria-label={`${t("Move")} ${track.displayTitle ?? track.title} ${t("down")}`}
                                                >
                                                    <ChevronDown className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        handlePlayFromQueue(
                                                            queueIndex
                                                        )
                                                    }
                                                    className="p-2.5 min-h-[44px] min-w-[44px] hover:bg-[var(--bg-primary)] rounded-md transition-colors flex items-center justify-center"
                                                    aria-label={`${t("Play")} ${track.displayTitle ?? track.title}`}
                                                >
                                                    <Play className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        handleRemoveTrack(
                                                            queueIndex
                                                        )
                                                    }
                                                    className="p-2.5 min-h-[44px] min-w-[44px] hover:bg-red-500/10 rounded-md transition-colors text-red-400 flex items-center justify-center"
                                                    aria-label={`${t("Remove")} ${track.displayTitle ?? track.title} ${t("from queue")}`}
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>
                    </section>
                )}

                {/* Previously Played */}
                {previousTracks.length > 0 && (
                    <section className="bg-[#111] rounded-lg p-6">
                        <h2 className="text-xl font-semibold text-white mb-4">
                            {t("Previously Played")} ({previousTracks.length.toLocaleString(locale === "nl" ? "nl-NL" : "en-US")})
                        </h2>
                        <Card>
                            <div className="divide-y divide-[#1c1c1c]">
                                {previousTracks.map((track, idx) => (
                                    <div
                                        key={`${track.id}-${idx}`}
                                        className="flex items-center gap-4 p-4 hover:bg-[var(--bg-hover)] transition-colors group opacity-50"
                                    >
                                        {/* Album Art */}
                                        <div className="relative flex-shrink-0 w-12 h-12">
                                            {track.album?.coverArt ? (
                                                <Image
                                                    src={api.getCoverArtUrl(
                                                        track.album.coverArt,
                                                        100
                                                    )}
                                                    alt={track.album.title}
                                                    fill
                                                    sizes="48px"
                                                    className="object-cover rounded-sm"
                                                    unoptimized
                                                />
                                            ) : (
                                                <div className="w-12 h-12 bg-[var(--bg-primary)] rounded-sm flex items-center justify-center">
                                                    <Music className="w-5 h-5 text-[var(--text-muted)]" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Track Info */}
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-sm font-medium text-white truncate">
                                                {track.title}
                                            </h3>
                                            <p className="text-sm text-[var(--text-secondary)] truncate">
                                                {track.artist?.name}
                                            </p>
                                        </div>

                                        {/* Duration */}
                                        <div className="text-sm text-[var(--text-muted)]">
                                            {track.duration
                                                ? `${Math.floor(
                                                      track.duration / 60
                                                  )}:${(track.duration % 60)
                                                      .toString()
                                                      .padStart(2, "0")}`
                                                : ""}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </section>
                )}
            </div>
        </div>
    );
}
