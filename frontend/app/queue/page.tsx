"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAudioState, useAudioControls, useAudioPlayback } from "@/lib/audio-context";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/i18n/language-context";
import { QueueSurface } from "@/features/queue/QueueSurface";
import { moveUpcomingTrack } from "@/features/queue/queuePresentation";

export default function QueuePage() {
    const router = useRouter();
    const { t } = useLanguage();
    const { isAuthenticated } = useAuth();
    const { queue, currentTrack, currentIndex, playbackType, setQueue } = useAudioState();
    const { playTracks, removeFromQueue, clearQueue, pause, resumeWithGesture } = useAudioControls();
    const { isPlaying } = useAudioPlayback();
    const [confirmClear, setConfirmClear] = useState(false);

    useEffect(() => {
        if (!isAuthenticated) router.push("/login");
    }, [isAuthenticated, router]);

    if (!isAuthenticated) return null;
    const currentIsActive = playbackType === "track" && !!currentTrack && currentTrack.id === queue[currentIndex]?.id;

    return (
        <>
            <QueueSurface
                queue={queue} currentIndex={currentIndex} currentIsActive={currentIsActive} isPlaying={isPlaying}
                onToggleCurrent={() => {
                    if (currentIsActive) {
                        if (isPlaying) pause();
                        else resumeWithGesture();
                    } else if (queue[currentIndex]) playTracks(queue, currentIndex);
                }}
                onPlay={(index) => playTracks(queue, index)}
                onMove={(index, direction) => setQueue((previous) => moveUpcomingTrack(previous, currentIndex, index, direction))}
                onRemove={removeFromQueue}
                onClear={() => setConfirmClear(true)}
                onBrowse={() => router.push("/collection")}
            />
            <ConfirmDialog
                isOpen={confirmClear} onClose={() => setConfirmClear(false)}
                onConfirm={clearQueue} title={t("Clear the queue?")}
                message={queue.length === 1 ? t("This removes the only track from the queue.") : `${t("This removes")} ${queue.length} ${t("tracks")} ${t("from the queue.")}`}
                confirmText={t("Clear queue")} variant="danger"
            />
        </>
    );
}
