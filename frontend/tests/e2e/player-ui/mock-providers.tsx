/* eslint-disable @next/next/no-img-element -- Isolated browser fixture, not app artwork. */
import React, { useEffect, useState, type ComponentProps } from "react";
import { AudioWaveform, Timer } from "lucide-react";
import { translate } from "../../../lib/i18n/translations";

const art = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#15343a"/><stop offset="1" stop-color="#a1603c"/></linearGradient></defs><path fill="url(#g)" d="M0 0h600v600H0z"/><circle cx="300" cy="280" r="150" fill="#dfb978"/><path d="M0 350 180 220 390 430 600 280V600H0Z" fill="#182d33"/><text x="38" y="62" fill="#f4e4c8" font-size="24" letter-spacing="6" font-family="sans-serif">SLOW LIGHT</text><text x="38" y="550" fill="#f4e4c8" font-size="15" letter-spacing="3" font-family="sans-serif">SYNTHETIC TEST ARTWORK</text></svg>`;
export const defaults = {
    locale: "en" as "en" | "nl", type: "track", id: "fixture-track", title: "Night Transit",
    subtitle: "Paper Satellites", cover: `data:image/svg+xml,${encodeURIComponent(art)}` as string | null,
    hasMedia: true, playing: true, buffering: false, error: false, mobile: true, tablet: false,
    lyrics: false, shuffled: false, repeat: "off", operation: "idle", progress: 35,
};
export const state = { ...defaults };
export const calls: string[] = [];
export function useLanguage() { return { locale: state.locale, t: (key: string) => translate(state.locale, key) }; }
export function usePlayerControls() { return {
    currentTrack: state.hasMedia && state.type === "track" ? { id: state.id } : null,
    currentPodcast: state.hasMedia && state.type === "podcast" ? { id: state.id } : null,
    currentAudiobook: state.hasMedia && state.type === "audiobook" ? { id: state.id } : null,
    playbackType: state.type, activeOperation: { type: state.operation }, isPlaying: state.playing,
    isBuffering: state.buffering, audioError: state.error, isShuffle: state.shuffled, repeatMode: state.repeat,
    duration: 240, displayTime: 84, progress: state.progress, canSeek: true, downloadProgress: undefined,
    pause: () => calls.push("pause"), resumeWithGesture: () => calls.push("resume"),
    next: () => calls.push("next"), previous: () => calls.push("previous"),
    setPlayerMode: (mode: string) => calls.push(`mode:${mode}`), returnToPreviousMode: () => calls.push("close"),
    seek: (time: number) => calls.push(`seek:${time}`), skipForward: (time: number) => calls.push(`forward:${time}`),
    skipBackward: (time: number) => calls.push(`back:${time}`), toggleShuffle: () => calls.push("shuffle"),
    toggleRepeat: () => calls.push("repeat"),
}; }
export function useMediaInfo() { return { hasMedia: state.hasMedia, title: state.title, subtitle: state.subtitle,
    coverUrl: state.cover, mediaLink: "/album/fixture", artistLink: "/artist/fixture" }; }
export function useIsMobile() { return state.mobile; }
export function useIsTablet() { return state.tablet; }
export function useLyricsToggle() { return { isLyricsActive: state.lyrics, handleLyricsToggle: () => calls.push("lyrics") }; }
export default function Link({ children, prefetch, onClick, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) {
    return <a {...props} data-prefetch={String(prefetch)} onClick={(event) => { onClick?.(event); event.preventDefault(); }}>{children}</a>;
}
export function CachedImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
    const [failed, setFailed] = useState(false);
    useEffect(() => { setFailed(false); }, [src]);
    return failed ? null : <img src={src} alt={alt} className={className} onError={() => setFailed(true)}
        style={{ position: "absolute", inset: 0, height: "100%", width: "100%" }} />;
}
export function PlayCountLine() { return null; }
export function LyricsView() { return <div style={{ padding: 28, fontSize: 22, lineHeight: 2 }}>Synthetic lyrics fixture<br />A quiet line<br />Another line</div>; }
export function SeekSlider({ onSeek }: { onSeek: (time: number) => void }) { return <input aria-label="Seek" type="range" min="0" max="240" defaultValue="84" onChange={(event) => onSeek(Number(event.target.value))} style={{ width: "100%", height: 24, accentColor: "var(--color-brand)" }} />; }
export function VibeToggleButton({ unavailable, hideWhenUnavailable, className }: { unavailable: boolean; hideWhenUnavailable?: boolean; className?: string }) {
    return unavailable && hideWhenUnavailable ? null : <button type="button" className={className} disabled={unavailable} aria-label="Vibe"><AudioWaveform size={20} /></button>;
}
export function SleepTimer() {
    const [open, setOpen] = useState(false);
    useEffect(() => {
        const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
        if (open) document.addEventListener("keydown", escape);
        return () => document.removeEventListener("keydown", escape);
    }, [open]);
    return <div style={{ position: "relative" }}><button type="button" aria-label="Sleep timer" aria-expanded={open} onClick={() => setOpen(!open)} style={{ background: "none", border: 0, color: "inherit", display: "flex" }}><Timer size={20} /></button>
        {open && <div role="dialog" aria-label="Timer options" style={{ position: "absolute", bottom: "100%", width: 160, padding: 16, background: "#232323", borderRadius: 12 }}><button type="button" onClick={() => setOpen(false)}>15 min</button></div>}
    </div>;
}
