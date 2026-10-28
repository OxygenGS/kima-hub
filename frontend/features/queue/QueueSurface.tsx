"use client";

import { Music, Play, Pause, X, Trash2, ListMusic, ChevronUp, ChevronDown, Library, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { Track } from "@/lib/audio-state-context";
import { CachedImage } from "@/components/ui/CachedImage";
import { useLanguage } from "@/lib/i18n/language-context";
import { formatTime } from "@/lib/format";
import { api } from "@/lib/api";
import styles from "./QueueSurface.module.css";

export interface QueueSurfaceProps {
    queue: Track[];
    currentIndex: number;
    /** True only when the selected queue item is the active audio source. */
    currentIsActive: boolean;
    isPlaying: boolean;
    onToggleCurrent: () => void;
    onPlay: (index: number) => void;
    onMove: (index: number, direction: -1 | 1) => void;
    onRemove: (index: number) => void;
    onClear: () => void;
    onBrowse: () => void;
}

function QueueCover({ track, large = false }: { track: Track; large?: boolean }) {
    return (
        <div className={large ? styles.largeCover : styles.cover}>
            <Music size={large ? 42 : 20} aria-hidden="true" className={styles.fallback} />
            {track.album?.coverArt && <CachedImage
                src={api.getCoverArtUrl(track.album.coverArt, large ? 300 : 100)}
                alt="" fill sizes={large ? "180px" : "48px"} className={styles.image}
            />}
        </div>
    );
}

/** Rendering only. Queue positions, mutations, confirmations and playback are owned by the page. */
export function QueueSurface({
    queue, currentIndex, currentIsActive, isPlaying, onToggleCurrent,
    onPlay, onMove, onRemove, onClear, onBrowse,
}: QueueSurfaceProps) {
    const { t, locale } = useLanguage();
    const selectedIndex = Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < queue.length ? currentIndex : -1;
    const selected = queue[selectedIndex];
    const previous = selectedIndex >= 0 ? queue.slice(0, selectedIndex) : [];
    const upcoming = queue.slice(selectedIndex + 1);
    const active = currentIsActive && isPlaying;

    function trackRow(track: Track, index: number, editable: boolean) {
        const title = track.displayTitle ?? track.title;
        return (
            <li key={`${track.id}-${index}`} className={styles.row} data-queue-index={index} data-history={!editable || undefined}>
                <span className={styles.number} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <QueueCover track={track} />
                <div className={styles.trackInfo}>
                    <h3 title={title}>{title}</h3>
                    <p title={track.artist?.name}>{track.artist?.name}</p>
                </div>
                <span className={styles.duration}>{track.duration ? formatTime(track.duration) : ""}</span>
                {editable && <div className={styles.rowActions}>
                    <button type="button" className={styles.iconButton} onClick={() => onMove(index, -1)}
                        disabled={index <= selectedIndex + 1} aria-label={`${t("Move up")}: ${title}`}>
                        <ChevronUp size={18} aria-hidden="true" />
                    </button>
                    <button type="button" className={styles.iconButton} onClick={() => onMove(index, 1)}
                        disabled={index >= queue.length - 1} aria-label={`${t("Move down")}: ${title}`}>
                        <ChevronDown size={18} aria-hidden="true" />
                    </button>
                    <button type="button" className={styles.iconButton} onClick={() => onPlay(index)} aria-label={`${t("Play")}: ${title}`}>
                        <Play size={17} aria-hidden="true" />
                    </button>
                    <button type="button" className={`${styles.iconButton} ${styles.remove}`} onClick={() => onRemove(index)}
                        aria-label={`${t("Remove from queue")}: ${title}`}>
                        <X size={18} aria-hidden="true" />
                    </button>
                </div>}
            </li>
        );
    }

    return (
        <div className={styles.page} data-queue-surface>
            <header className={styles.header}>
                <div>
                    <p className={styles.eyebrow}><ListMusic size={15} aria-hidden="true" />{t("Playing next")}</p>
                    <h1>{t("Queue")}</h1>
                    <p className={styles.description}>{locale === "nl" ? "Jij bepaalt wat hierna komt." : "Your next listen, your way."}</p>
                    <p className={styles.total}>{queue.length.toLocaleString(locale)} {t(queue.length === 1 ? "track" : "tracks")}</p>
                </div>
                {queue.length > 0 && <button type="button" className={styles.clear} onClick={onClear}>
                    <Trash2 size={16} aria-hidden="true" />{t("Clear queue")}
                </button>}
            </header>

            {queue.length === 0 ? (
                <section className={styles.empty}>
                    <span className={styles.emptyIcon}><ListMusic size={36} aria-hidden="true" /></span>
                    <h2>{t("No tracks in queue")}</h2>
                    <p>{t("Start playing music to see your queue here")}</p>
                    <button type="button" className={styles.primary} onClick={onBrowse}>
                        <Library size={17} aria-hidden="true" />{t("Browse Library")}
                    </button>
                </section>
            ) : (
                <div className={styles.layout}>
                    {selected && <section className={styles.current} aria-labelledby="queue-current-heading">
                        <p className={styles.eyebrow} id="queue-current-heading">
                            <span className={styles.dot} aria-hidden="true" />
                            {currentIsActive ? t("Now Playing") : (locale === "nl" ? "Geselecteerd nummer" : "Selected track")}
                        </p>
                        <QueueCover track={selected} large />
                        <h2 className={styles.currentTitle}>{selected.displayTitle ?? selected.title}</h2>
                        <p className={styles.currentArtist}>{selected.artist?.name}</p>
                        <p className={styles.currentAlbum}>{selected.album?.title}</p>
                        <div className={styles.currentActions}>
                            <button type="button" className={styles.primary} onClick={onToggleCurrent} aria-label={t(active ? "Pause" : "Play")}>
                                {active ? <Pause size={18} fill="currentColor" aria-hidden="true" /> : <Play size={18} fill="currentColor" aria-hidden="true" />}
                                {t(active ? "Pause" : "Play")}
                            </button>
                            {selected.album?.id && <Link href={`/album/${selected.album.id}`} prefetch={false} className={styles.albumLink}>
                                {t("Album")}<ArrowUpRight size={16} aria-hidden="true" />
                            </Link>}
                        </div>
                    </section>}
                    <div className={styles.lists}>
                        <section className={styles.listSection} aria-labelledby="queue-upcoming-heading">
                            <div className={styles.sectionHeading}>
                                <h2 id="queue-upcoming-heading">{t("Next Up")}</h2>
                                <span>{upcoming.length.toLocaleString(locale)}</span>
                            </div>
                            {upcoming.length > 0 ? <ol className={styles.trackList}>
                                {upcoming.map((track, offset) => trackRow(track, selectedIndex + 1 + offset, true))}
                            </ol> : <p className={styles.end}>{locale === "nl" ? "Je bent aan het einde van de wachtrij." : "You have reached the end of the queue."}</p>}
                        </section>
                        {previous.length > 0 && <section className={styles.listSection} aria-labelledby="queue-history-heading">
                            <div className={styles.sectionHeading}>
                                <h2 id="queue-history-heading">{t("Previously Played")}</h2>
                                <span>{previous.length.toLocaleString(locale)}</span>
                            </div>
                            <ol className={styles.trackList}>{previous.map((track, index) => trackRow(track, index, false))}</ol>
                        </section>}
                    </div>
                </div>
            )}
        </div>
    );
}
