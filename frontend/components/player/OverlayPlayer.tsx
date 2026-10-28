"use client";

import { useRef, type ReactNode } from "react";
import Link from "next/link";
import { Play, Pause, SkipBack, SkipForward, ChevronDown, Music2, Shuffle,
    Repeat, Repeat1, Loader2, RotateCcw, RotateCw, RefreshCw, MicVocal, ListMusic } from "lucide-react";
import { useMediaInfo } from "@/hooks/useMediaInfo";
import { usePlayerControls } from "@/hooks/usePlayerControls";
import { useIsMobile, useIsTablet } from "@/hooks/useMediaQuery";
import { useLyricsToggle } from "@/hooks/useLyricsToggle";
import { PlayCountLine } from "@/features/stats/PlayCountLine";
import { CachedImage } from "@/components/ui/CachedImage";
import { LyricsView } from "@/components/lyrics/LyricsView";
import { useLanguage } from "@/lib/i18n/language-context";
import { translate } from "@/lib/i18n/translations";
import { formatTime, formatMediaDuration } from "@/lib/format";
import { shuffleState } from "@/lib/shuffle";
import { SeekSlider } from "./SeekSlider";
import { SleepTimer } from "./SleepTimer";
import { VibeToggleButton } from "./VibeToggleButton";
import { usePlayerSwipe } from "./hooks/usePlayerSwipe";
import { useOverlayFocus } from "./hooks/useOverlayFocus";
import styles from "./OverlayPlayer.module.css";

function Control({ label, title = label, onClick, children, disabled, pressed, primary, error }: {
    label: string; title?: string; onClick: () => void; children: ReactNode;
    disabled?: boolean; pressed?: boolean; primary?: boolean; error?: boolean;
}) {
    return <button type="button" className={primary ? styles.play : styles.control}
        onClick={onClick} disabled={disabled} aria-label={label} title={title}
        aria-pressed={pressed} data-error={error || undefined}>{children}</button>;
}

/** Full-screen presentation, backed by the same audio controls as the desktop dock. */
export function OverlayPlayer() {
    const { t, locale } = useLanguage();
    const {
        currentTrack, currentAudiobook, currentPodcast, playbackType, isShuffle, repeatMode,
        activeOperation, isPlaying, isBuffering, canSeek, downloadProgress, audioError,
        duration, displayTime, progress, pause, resumeWithGesture, next, previous,
        returnToPreviousMode, seek, skipForward, skipBackward, toggleShuffle, toggleRepeat,
    } = usePlayerControls();
    const isMobile = useIsMobile();
    const isTablet = useIsTablet();
    const { handleLyricsToggle, isLyricsActive } = useLyricsToggle({ inline: true });
    const { title, subtitle, coverUrl, artistLink, mediaLink, hasMedia } = useMediaInfo(500);
    const surface = useRef<HTMLDivElement>(null);
    const closeButton = useRef<HTMLButtonElement>(null);
    const open = hasMedia && !!(currentTrack || currentAudiobook || currentPodcast);
    useOverlayFocus(open, surface, closeButton, returnToPreviousMode);
    const canSkip = hasMedia && playbackType === "track";
    const mediaId = playbackType === "track" ? currentTrack?.id
        : playbackType === "audiobook" ? currentAudiobook?.id : currentPodcast?.id;
    const swipe = usePlayerSwipe({
        enabled: (isMobile || isTablet) && canSkip && !isLyricsActive,
        resetKey: `${playbackType}:${mediaId ?? ""}`, threshold: 60,
        onSwipe: (direction) => { if (direction === 1) previous(); else next(); },
    });
    if (!open) return null;
    const shuffle = shuffleState(hasMedia, playbackType, activeOperation.type);
    const label = t(audioError ? "Retry playback" : isBuffering ? "Buffering..." : isPlaying ? "Pause" : "Play");
    const hint = t(audioError ? "retry playback" : isBuffering ? "buffering..." : isPlaying ? "pause" : "play");
    const typeLabel = playbackType === "podcast" ? t("Podcast")
        : playbackType === "audiobook" ? t("Audiobook") : locale === "nl" ? "Jouw muziek" : "Your music";
    const status = audioError ? t("Playback Error") : isBuffering ? t("Buffering...")
        : isPlaying ? t("Now Playing") : locale === "nl" ? "Gepauzeerd" : "Paused";

    return (
        <div ref={surface} className={styles.overlay} role="dialog" aria-modal="true"
            aria-label={t("Now Playing")} tabIndex={-1} data-overlay-player>
            <div className={styles.topbar}>
                <button ref={closeButton} type="button" className={styles.control}
                    onClick={returnToPreviousMode} aria-label={t("close")} title={t("close")}>
                    <ChevronDown size={24} aria-hidden="true" />
                </button>
                <div className={styles.context}><span>{typeLabel}</span><strong>{status}</strong></div>
                <Link href="/queue" prefetch={false} onClick={returnToPreviousMode}
                    className={styles.control} aria-label={t("Queue")} title={t("Queue")}>
                    <ListMusic size={22} aria-hidden="true" />
                </Link>
            </div>
            <div className={styles.scroll}>
                <div className={styles.layout}>
                    {isLyricsActive && playbackType === "track" ? (
                        <div className={styles.lyrics} data-inline-lyrics><LyricsView variant="compact" /></div>
                    ) : (
                        <div className={styles.artwork} {...swipe} data-overlay-artwork>
                            <div className={styles.fallback} aria-hidden="true"><Music2 size={84} /></div>
                            {coverUrl && <CachedImage key={coverUrl} src={coverUrl} alt={title} fill
                                sizes="(max-width: 759px) min(76vw, 340px), 440px" className={styles.image} priority />}
                        </div>
                    )}
                    <div className={styles.details}>
                        <div className={styles.metadata}>
                            <p className={styles.eyebrow}>{locale === "nl" ? "Jouw luistermoment" : "Your listening space"}</p>
                            <h1 className={styles.title}>{mediaLink ? (
                                <Link href={mediaLink} onClick={returnToPreviousMode}>{title}</Link>
                            ) : title}</h1>
                            <p className={styles.subtitle}>{artistLink ? (
                                <Link href={artistLink} onClick={returnToPreviousMode}>{subtitle}</Link>
                            ) : subtitle}</p>
                            <PlayCountLine trackId={playbackType === "track" ? currentTrack?.id : null} className={styles.count} />
                            {audioError && <p className={styles.errorMessage}>{t("Tap retry to reconnect")}</p>}
                        </div>
                        <div className={styles.timeline}>
                            <SeekSlider progress={progress} duration={duration} onSeek={seek} canSeek={canSeek}
                                hasMedia={hasMedia} downloadProgress={downloadProgress} variant="overlay" showHandle />
                            <div className={styles.times}><span>{formatTime(displayTime)}</span>
                                <span>{formatMediaDuration(playbackType, duration, displayTime)}</span></div>
                        </div>
                        <div className={styles.transport} role="group" aria-label={t("Playback controls")}>
                            {!canSkip && <Control label={t("Rewind 30 seconds")} title={t("rewind 30 seconds")}
                                onClick={() => skipBackward(30)}>
                                <RotateCcw size={26} aria-hidden="true" /><span className={styles.seconds} aria-hidden="true">30</span>
                            </Control>}
                            <Control onClick={previous} disabled={!canSkip}
                                label={t(canSkip ? "Previous track" : "skip only for music")} title={t(canSkip ? "previous" : "skip only for music")}>
                                <SkipBack size={28} aria-hidden="true" />
                            </Control>
                            <Control primary error={!!audioError} label={label} title={hint}
                                onClick={audioError ? resumeWithGesture : isPlaying ? pause : resumeWithGesture}>
                                {audioError ? <RefreshCw size={28} aria-hidden="true" />
                                    : isBuffering ? <Loader2 size={28} className={styles.spinner} aria-hidden="true" />
                                    : isPlaying ? <Pause size={28} fill="currentColor" aria-hidden="true" />
                                    : <Play size={28} fill="currentColor" aria-hidden="true" />}
                            </Control>
                            <Control onClick={next} disabled={!canSkip}
                                label={t(canSkip ? "Next track" : "skip only for music")} title={t(canSkip ? "next" : "skip only for music")}>
                                <SkipForward size={28} aria-hidden="true" />
                            </Control>
                            {!canSkip && <Control label={t("Forward 30 seconds")} title={t("forward 30 seconds")}
                                onClick={() => skipForward(30)}>
                                <RotateCw size={26} aria-hidden="true" /><span className={styles.seconds} aria-hidden="true">30</span>
                            </Control>}
                        </div>
                        <div className={styles.tools}>
                            <div className={styles.timer}><SleepTimer /></div>
                            <Control onClick={toggleShuffle} disabled={!shuffle.enabled} pressed={isShuffle}
                                label={t("Shuffle")} title={translate(locale, shuffle.title)}><Shuffle size={20} aria-hidden="true" /></Control>
                            <Control onClick={toggleRepeat} disabled={!canSkip} pressed={repeatMode !== "off"}
                                label={t(repeatMode === "one" ? "Repeat one" : repeatMode === "all" ? "Repeat all" : "Repeat off")}
                                title={t(repeatMode === "one" ? "repeat one" : repeatMode === "all" ? "repeat all" : "repeat off")}>
                                {repeatMode === "one" ? <Repeat1 size={20} aria-hidden="true" /> : <Repeat size={20} aria-hidden="true" />}
                            </Control>
                            <VibeToggleButton unavailable={!canSkip} className={styles.control}
                                iconClassName="w-5 h-5" idleClassName="text-[var(--text-secondary)]" activeClassName="text-brand" />
                            {playbackType === "track" && <Control onClick={handleLyricsToggle} disabled={!hasMedia}
                                pressed={isLyricsActive} label={t("Toggle lyrics")} title={t("show lyrics")}>
                                <MicVocal size={20} aria-hidden="true" />
                            </Control>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
