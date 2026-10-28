"use client";

import { useState } from "react";
import { ChevronLeft, ChevronDown, Music2, Play, Pause, Loader2, RefreshCw, X } from "lucide-react";
import { usePlayerControls } from "@/hooks/usePlayerControls";
import { useMediaInfo } from "@/hooks/useMediaInfo";
import { useLanguage } from "@/lib/i18n/language-context";
import { PlayCountLine } from "@/features/stats/PlayCountLine";
import { CachedImage } from "@/components/ui/CachedImage";
import { VibeToggleButton } from "./VibeToggleButton";
import { usePlayerSwipe } from "./hooks/usePlayerSwipe";
import { boundedProgress } from "./playerPresentation";
import styles from "./MobilePlayer.module.css";

/** Mobile-only surface; the existing provider still owns the audio and media session. */
export function MobilePlayer() {
    const { t, locale } = useLanguage();
    const {
        currentTrack, currentAudiobook, currentPodcast, playbackType,
        isPlaying, isBuffering, audioError, progress, pause, resumeWithGesture, setPlayerMode,
    } = usePlayerControls();
    const { title, subtitle, coverUrl, hasMedia } = useMediaInfo(100);
    const id = playbackType === "track" ? currentTrack?.id
        : playbackType === "audiobook" ? currentAudiobook?.id : currentPodcast?.id;
    const mediaKey = `${playbackType}:${id ?? ""}`;
    const [presentation, setPresentation] = useState({ key: mediaKey, mode: "open" });
    const [showTools, setShowTools] = useState(false);
    if (presentation.key !== mediaKey || (presentation.mode === "dismissed" && isPlaying)) {
        setPresentation({ key: mediaKey, mode: "open" });
        if (showTools) setShowTools(false);
    }
    const changeMode = (mode: string) => { setPresentation({ key: mediaKey, mode }); setShowTools(false); };
    const swipe = usePlayerSwipe({
        enabled: hasMedia && presentation.mode === "open", threshold: 80, resetKey: mediaKey,
        onSwipe: (direction) => {
            if (direction === 1) changeMode("minimized");
            else if (isPlaying) setPlayerMode("overlay");
            else changeMode("dismissed");
        },
    });
    if (!hasMedia || presentation.mode === "dismissed") return null;
    const label = audioError ? t("Retry playback") : isBuffering ? t("Buffering...") : t(isPlaying ? "Pause" : "Play");
    const artwork = <>
        <Music2 size={22} aria-hidden="true" className={styles.fallback} />
        {coverUrl && <CachedImage src={coverUrl} alt="" fill sizes="48px" className={styles.image} />}
    </>;

    if (presentation.mode === "minimized") return (
        <button type="button" className={styles.tab} onClick={() => changeMode("open")}
            aria-label={t("Show player")} title={t("show player")}>
            <ChevronLeft size={18} aria-hidden="true" />
            <span className={styles.cover}>{artwork}</span>
        </button>
    );

    return (
        <section className={styles.shell} aria-label={t("Playback controls")} data-mobile-player>
            <div className={styles.card} {...swipe}>
                <div className={styles.progress} aria-hidden="true">
                    <span style={{ width: `${boundedProgress(progress)}%` }} />
                </div>
                <div className={styles.row}>
                    <button type="button" className={styles.cover} onClick={() => setPlayerMode("overlay")}
                        aria-label={t("Expand player")} title={t("expand to full screen")}>{artwork}</button>
                    <div className={styles.metadata}>
                        <button type="button" className={styles.details} onClick={() => setPlayerMode("overlay")}
                            aria-label={`${t("Expand player")}: ${title}`}>
                            <span className={styles.title} title={title}>{title}</span>
                            <span className={styles.subtitle} title={subtitle}>
                                {audioError ? t("Tap retry to reconnect") : subtitle}
                            </span>
                        </button>
                        <PlayCountLine trackId={playbackType === "track" ? currentTrack?.id : null} className={styles.count} />
                    </div>
                    <div className={styles.controls} data-player-command role="group" aria-label={t("Playback controls")}>
                        <VibeToggleButton unavailable={playbackType !== "track"} hideWhenUnavailable
                            className={styles.button} iconClassName="w-5 h-5"
                            idleClassName="text-[var(--text-secondary)]" activeClassName="text-brand" />
                        <button type="button" className={`${styles.button} ${styles.play}`} data-error={!!audioError}
                            onClick={audioError ? resumeWithGesture : isPlaying ? pause : resumeWithGesture}
                            aria-label={label} title={t(audioError ? "retry playback" : isBuffering ? "buffering..." : isPlaying ? "pause" : "play")}>
                            {audioError ? <RefreshCw size={21} aria-hidden="true" />
                                : isBuffering ? <Loader2 size={21} className={styles.spinner} aria-hidden="true" />
                                : isPlaying ? <Pause size={21} fill="currentColor" aria-hidden="true" />
                                : <Play size={21} fill="currentColor" aria-hidden="true" />}
                        </button>
                    </div>
                </div>
                <div className={styles.footer} data-player-command>
                    <span className={styles.status} data-playing={isPlaying && !audioError && !isBuffering}>
                        <span aria-hidden="true" />{audioError ? t("Playback Error") : isBuffering ? t("Buffering...")
                            : isPlaying ? t("Now Playing") : locale === "nl" ? "Gepauzeerd" : "Paused"}
                    </span>
                    <button type="button" className={styles.options} onClick={() => setShowTools(!showTools)}
                        aria-expanded={showTools} aria-label={locale === "nl" ? "Speleropties" : "Player options"}>
                        <ChevronDown size={16} aria-hidden="true" />
                    </button>
                </div>
                {showTools && <div className={styles.menu} data-player-command>
                    <button type="button" onClick={() => changeMode("minimized")}>
                        <ChevronLeft size={16} aria-hidden="true" />{locale === "nl" ? "Speler verkleinen" : "Minimize player"}
                    </button>
                    {!isPlaying && <button type="button" onClick={() => changeMode("dismissed")}>
                        <X size={16} aria-hidden="true" />{locale === "nl" ? "Speler verbergen" : "Dismiss player"}
                    </button>}
                </div>}
            </div>
        </section>
    );
}
