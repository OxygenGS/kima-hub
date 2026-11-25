"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { useAudioState, useAudioControls, useAudioPlayback } from "@/lib/audio-context";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/i18n/language-context";
import { QueueSurface } from "@/features/queue/QueueSurface";
import { DjStudio } from "@/features/queue/DjStudio";
import { SoundLabPanel } from "@/components/player/SoundLabPanel";
import { moveUpcomingTrack } from "@/features/queue/queuePresentation";

export default function QueuePage() {
    const router = useRouter();
    const { t, locale } = useLanguage();
    const { isAuthenticated, user } = useAuth();
    const { queue, currentTrack, currentIndex, playbackType, activeOperation, setActiveOperation, setQueue, setIsShuffle, setRepeatMode } = useAudioState();
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
            {activeOperation?.type === "flow" && activeOperation.ownerId === user?.id && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/20 bg-[var(--bg-secondary)] p-4">
                    <p className="text-sm text-[var(--text-secondary)]">
                        {locale === "nl" ? "Continuous Flow vult de wachtrij automatisch aan." : "Continuous Flow automatically adds upcoming music."}
                    </p>
                    <Button size="sm" variant="secondary" onClick={() => setActiveOperation({ type: "idle" })}>
                        {locale === "nl" ? "Automatisch aanvullen stoppen" : "Stop automatic Flow"}
                    </Button>
                </div>
            )}
            {user?.id && playbackType === "track" && <DjStudio
                key={user.id}
                queue={queue}
                currentIndex={currentIndex}
                onPlay={(tracks) => {
                    setActiveOperation({ type: "idle" });
                    setIsShuffle(false);
                    setRepeatMode("off");
                    playTracks(tracks, 0);
                }}
            />}
            <SoundLabPanel />
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
