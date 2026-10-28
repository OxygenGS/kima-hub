"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
    Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize2,
    Shuffle, Repeat, Repeat1, RotateCcw, RotateCw, Loader2, AudioWaveform,
    RefreshCw, MicVocal, ListMusic,
} from "lucide-react";
import { useMediaInfo } from "@/hooks/useMediaInfo";
import { usePlayerControls } from "@/hooks/usePlayerControls";
import { useLyricsToggle } from "@/hooks/useLyricsToggle";
import { PlayCountLine } from "@/features/stats/PlayCountLine";
import { shuffleState } from "@/lib/shuffle";
import { cn } from "@/lib/cn";
import { formatTime, formatMediaDuration } from "@/lib/format";
import { useLanguage } from "@/lib/i18n/language-context";
import { translate } from "@/lib/i18n/translations";
import { KeyboardShortcutsTooltip } from "./KeyboardShortcutsTooltip";
import { SeekSlider } from "./SeekSlider";
import { SleepTimer } from "./SleepTimer";
import { VibeToggleButton } from "./VibeToggleButton";
import { PlayerCover } from "./PlayerCover";
import styles from "./PlayerDock.module.css";

/** A presentation-only control. It never owns audio state or handles shortcuts. */
function DockButton({ label, title = label, onClick, disabled, pressed, children, className }: {
    label: string;
    title?: string;
    onClick: () => void;
    disabled?: boolean;
    pressed?: boolean;
    children: ReactNode;
    className?: string;
}) {
    return (
        <button type="button" className={cn(styles.button, className)} onClick={onClick}
            disabled={disabled} aria-label={label} title={title} aria-pressed={pressed}>
            {children}
        </button>
    );
}

export function FullPlayer() {
    const { t, locale } = useLanguage();
    const {
        currentTrack, playbackType, volume, isMuted, isShuffle, repeatMode, activeOperation,
        queue, currentIndex, isPlaying, isBuffering, canSeek, downloadProgress, audioError,
        duration, displayTime, progress, pause, resumeWithGesture, next, previous,
        setPlayerMode, seek, skipForward, skipBackward, setVolume, toggleMute,
        toggleShuffle, toggleRepeat,
    } = usePlayerControls();
    const { handleLyricsToggle, isLyricsActive } = useLyricsToggle({ inline: false });
    const { title, subtitle, coverUrl, artistLink, mediaLink, hasMedia } = useMediaInfo(100);
    const shuffle = shuffleState(hasMedia, playbackType, activeOperation.type);
    const currentId = queue[currentIndex]?.id;
    const match = activeOperation.type === "vibe" && currentId ? activeOperation.matches[currentId] : undefined;
    const vibeMatchScore = match === undefined ? null : Math.round(match * 100);
    const repeatLabel = t(repeatMode === "off" ? "Repeat off" : repeatMode === "all" ? "Repeat all" : "Repeat one");
    const repeatHint = t(repeatMode === "off" ? "repeat: off" : repeatMode === "all" ? "repeat: all (loop queue)" : "repeat: one (loop this track)");
    const playLabel = t(audioError ? "Retry playback" : isBuffering ? "Buffering..." : isPlaying ? "Pause" : "Play");
    const playHint = t(audioError ? "retry playback" : isBuffering ? "buffering..." : isPlaying ? "pause" : "play");
    const status = !hasMedia
        ? (locale === "nl" ? "Kies iets om te luisteren" : "Choose something to listen to")
        : audioError ? t("Retry playback") : isBuffering ? t("Buffering...")
        : isPlaying ? t("Now Playing") : (locale === "nl" ? "Gepauzeerd" : "Paused");
    const volumePercent = Math.round(volume * 100);

    return (
        <section className={styles.shell} aria-label={t("Playback controls")} data-player-dock>
            <div className={styles.dock}>
                <div className={styles.media}>
                    <PlayerCover href={mediaLink} coverUrl={coverUrl} title={title}
                        isPlaying={isPlaying} className={styles.cover} />
                    <div className={styles.metadata}>
                        <p className={styles.status} data-playing={hasMedia && isPlaying && !audioError && !isBuffering}>
                            <span aria-hidden="true" />{status}
                        </p>
                        {mediaLink ? (
                            <Link href={mediaLink} className={styles.title} title={title}>{title}</Link>
                        ) : <p className={styles.title} title={title}>{title}</p>}
                        {artistLink || mediaLink ? (
                            <Link href={(artistLink || mediaLink)!} className={styles.subtitle} title={subtitle}>{subtitle}</Link>
                        ) : <p className={styles.subtitle} title={subtitle}>{subtitle}</p>}
                        <PlayCountLine trackId={playbackType === "track" ? currentTrack?.id : null} className={styles.playCount} />
                        {vibeMatchScore !== null && <span className={styles.match}>
                            <AudioWaveform size={12} aria-hidden="true" />{vibeMatchScore}% {t("match")}
                        </span>}
                    </div>
                    <SleepTimer />
                </div>

                <div className={styles.transport}>
                    <div className={styles.controls} role="group" aria-label={t("Playback controls")}>
                        <DockButton onClick={toggleShuffle} label={t("Shuffle")} title={translate(locale, shuffle.title)}
                            pressed={isShuffle} disabled={!shuffle.enabled}>
                            <Shuffle size={17} aria-hidden="true" />
                        </DockButton>
                        <DockButton onClick={() => skipBackward(30)} label={t("Rewind 30 seconds")}
                            title={t("rewind 30 seconds")} disabled={!hasMedia}>
                            <RotateCcw size={18} aria-hidden="true" /><span className={styles.skipCount} aria-hidden="true">30</span>
                        </DockButton>
                        <DockButton onClick={previous} label={t("Previous track")} title={t("previous track")}
                            disabled={!hasMedia || playbackType !== "track"}>
                            <SkipBack size={21} aria-hidden="true" />
                        </DockButton>
                        <DockButton onClick={isPlaying ? pause : resumeWithGesture} label={playLabel} title={playHint}
                            disabled={!hasMedia} className={cn(styles.play, audioError && styles.error)}>
                            {audioError ? <RefreshCw size={21} aria-hidden="true" />
                                : isBuffering ? <Loader2 size={21} className={styles.spinner} aria-hidden="true" />
                                : isPlaying ? <Pause size={21} fill="currentColor" aria-hidden="true" />
                                : <Play size={21} fill="currentColor" aria-hidden="true" />}
                        </DockButton>
                        <DockButton onClick={next} label={t("Next track")} title={t("next track")}
                            disabled={!hasMedia || playbackType !== "track"}>
                            <SkipForward size={21} aria-hidden="true" />
                        </DockButton>
                        <DockButton onClick={() => skipForward(30)} label={t("Forward 30 seconds")}
                            title={t("forward 30 seconds")} disabled={!hasMedia}>
                            <RotateCw size={18} aria-hidden="true" /><span className={styles.skipCount} aria-hidden="true">30</span>
                        </DockButton>
                        <DockButton onClick={toggleRepeat} label={repeatLabel} title={repeatHint}
                            disabled={!hasMedia || playbackType !== "track"} pressed={repeatMode !== "off"}>
                            {repeatMode === "one" ? <Repeat1 size={17} aria-hidden="true" /> : <Repeat size={17} aria-hidden="true" />}
                        </DockButton>
                    </div>
                    <div className={styles.timeline}>
                        <span>{formatTime(displayTime)}</span>
                        <SeekSlider progress={progress} duration={duration} onSeek={seek} canSeek={canSeek}
                            hasMedia={hasMedia} downloadProgress={downloadProgress} variant="default" className={styles.seek} />
                        <span>{formatMediaDuration(playbackType, duration, displayTime)}</span>
                    </div>
                </div>

                <div className={styles.tools}>
                    <div className={styles.toolRow}>
                        <VibeToggleButton unavailable={!hasMedia || playbackType !== "track"}
                            className={styles.button} iconClassName="w-4 h-4"
                            idleClassName="text-[var(--text-secondary)]" activeClassName="text-brand" />
                        {playbackType === "track" && <DockButton onClick={handleLyricsToggle}
                            disabled={!hasMedia} pressed={isLyricsActive} label={t("Toggle lyrics")} title={t("show lyrics")}>
                            <MicVocal size={18} aria-hidden="true" />
                        </DockButton>}
                        <Link href="/queue" prefetch={false} className={styles.button} aria-label={t("Queue")} title={t("Queue")}>
                            <ListMusic size={18} aria-hidden="true" />
                        </Link>
                        <DockButton onClick={() => setPlayerMode("overlay")} disabled={!hasMedia}
                            label={t("Expand player")} title={t("expand to full screen")}>
                            <Maximize2 size={17} aria-hidden="true" />
                        </DockButton>
                    </div>
                    <div className={styles.volumeRow}>
                        <DockButton onClick={toggleMute} label={t(isMuted || volume === 0 ? "Unmute" : "Mute")}>
                            {isMuted || volume === 0 ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
                        </DockButton>
                        <input type="range" min="0" max="100" value={volume * 100}
                            onChange={(event) => setVolume(Number(event.target.value) / 100)}
                            aria-label={t("Volume")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={volumePercent}
                            aria-valuetext={`${volumePercent} ${t("percent")}`} className={styles.volume}
                            style={{ background: isMuted ? "var(--border-interactive)" : `linear-gradient(to right, var(--color-brand) ${volume * 100}%, var(--border-interactive) ${volume * 100}%)` }} />
                        <KeyboardShortcutsTooltip />
                    </div>
                </div>
            </div>
        </section>
    );
}
