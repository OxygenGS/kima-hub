/* eslint-disable @next/next/no-img-element -- deterministic DOM fixture, not production artwork. */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobilePlayer } from "@/components/player/MobilePlayer";
import { OverlayPlayer } from "@/components/player/OverlayPlayer";
import { boundedProgress, horizontalSwipe } from "@/components/player/playerPresentation";
import { translate } from "@/lib/i18n/translations";

const state = vi.hoisted(() => ({
    locale: "en" as "en" | "nl", hasMedia: true, type: "track", id: "sample-track",
    title: "Original Song", subtitle: "Original Artist", cover: "/sample-cover.jpg" as string | null,
    playing: false, buffering: false, error: false, mobile: true, tablet: false,
    lyrics: false, muted: false, shuffled: false, repeat: "off", operation: "idle", progress: 25,
    pause: vi.fn(), resume: vi.fn(), next: vi.fn(), previous: vi.fn(), mode: vi.fn(), close: vi.fn(),
    seek: vi.fn(), forward: vi.fn(), back: vi.fn(), shuffle: vi.fn(), toggleRepeat: vi.fn(), lyricsToggle: vi.fn(),
}));
vi.mock("@/hooks/usePlayerControls", () => ({ usePlayerControls: () => ({
    currentTrack: state.hasMedia && state.type === "track" ? { id: state.id } : null,
    currentPodcast: state.hasMedia && state.type === "podcast" ? { id: state.id } : null,
    currentAudiobook: state.hasMedia && state.type === "audiobook" ? { id: state.id } : null,
    playbackType: state.type, activeOperation: { type: state.operation },
    isPlaying: state.playing, isBuffering: state.buffering, audioError: state.error,
    isShuffle: state.shuffled, repeatMode: state.repeat, progress: state.progress,
    duration: 240, displayTime: 60, canSeek: true, downloadProgress: undefined,
    pause: state.pause, resumeWithGesture: state.resume, next: state.next, previous: state.previous,
    setPlayerMode: state.mode, returnToPreviousMode: state.close, seek: state.seek,
    skipForward: state.forward, skipBackward: state.back, toggleShuffle: state.shuffle, toggleRepeat: state.toggleRepeat,
}) }));
vi.mock("@/hooks/useMediaInfo", () => ({ useMediaInfo: () => ({
    hasMedia: state.hasMedia, title: state.title, subtitle: state.subtitle, coverUrl: state.cover,
    mediaLink: "/album/sample", artistLink: "/artist/sample",
}) }));
vi.mock("@/hooks/useMediaQuery", () => ({ useIsMobile: () => state.mobile, useIsTablet: () => state.tablet }));
vi.mock("@/lib/i18n/language-context", () => ({ useLanguage: () => ({ locale: state.locale, t: (key: string) => translate(state.locale, key) }) }));
vi.mock("@/hooks/useLyricsToggle", () => ({ useLyricsToggle: () => ({ isLyricsActive: state.lyrics, handleLyricsToggle: state.lyricsToggle }) }));
vi.mock("next/link", () => ({ default: ({ children, prefetch, ...props }: React.ComponentProps<"a"> & { prefetch?: boolean }) => <a {...props} data-prefetch={String(prefetch)}>{children}</a> }));
vi.mock("@/components/ui/CachedImage", () => ({ CachedImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} /> }));
vi.mock("@/features/stats/PlayCountLine", () => ({ PlayCountLine: ({ trackId }: { trackId?: string | null }) => <span data-counted-track={trackId || ""} /> }));
vi.mock("@/components/player/VibeToggleButton", () => ({ VibeToggleButton: ({ unavailable, hideWhenUnavailable }: { unavailable: boolean; hideWhenUnavailable?: boolean }) => (
    unavailable && hideWhenUnavailable ? null : <button type="button" data-vibe disabled={unavailable}>Vibe</button>
) }));
vi.mock("@/components/player/SleepTimer", () => ({ SleepTimer: () => <button type="button" data-timer>Timer</button> }));
vi.mock("@/components/lyrics/LyricsView", () => ({ LyricsView: () => <div data-lyrics>Lyrics</div> }));
vi.mock("@/components/player/SeekSlider", () => ({ SeekSlider: ({ onSeek }: { onSeek: (time: number) => void }) => <button type="button" data-seek onClick={() => onSeek(120)}>Seek</button> }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
let trigger: HTMLButtonElement;
function render(overlay = false) { act(() => root.render(overlay ? <OverlayPlayer /> : <MobilePlayer />)); }
function button(key: string) { return host.querySelector(`button[aria-label="${translate(state.locale, key)}"]`) as HTMLButtonElement; }
function click(node: HTMLElement) { act(() => node.click()); }
function touch(node: Element, type: string, points: Array<{ clientX: number; clientY: number }>) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "touches", { value: points });
    act(() => node.dispatchEvent(event));
}
function swipe(node: Element, dx: number, dy = 0, cancel = false) {
    touch(node, "touchstart", [{ clientX: 200, clientY: 100 }]);
    touch(node, "touchmove", [{ clientX: 200 + dx, clientY: 100 + dy }]);
    touch(node, cancel ? "touchcancel" : "touchend", []);
}
beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(state, { locale: "en", hasMedia: true, type: "track", id: "sample-track", title: "Original Song",
        subtitle: "Original Artist", cover: "/sample-cover.jpg", playing: false, buffering: false, error: false,
        mobile: true, tablet: false, lyrics: false, shuffled: false, repeat: "off", operation: "idle", progress: 25 });
    trigger = document.createElement("button"); document.body.appendChild(trigger); trigger.focus();
    host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); trigger.remove(); document.body.style.overflow = ""; });

describe("mobile mini player", () => {
    it("uses the existing gesture resume and pause without opening the overlay", () => {
        render(); click(button("Play")); expect(state.resume).toHaveBeenCalledOnce(); expect(state.mode).not.toHaveBeenCalled();
        state.playing = true; render(); click(button("Pause")); expect(state.pause).toHaveBeenCalledOnce();
    });
    it("opens the overlay from artwork without sending a playback command", () => {
        render(); click(button("Expand player")); expect(state.mode).toHaveBeenCalledWith("overlay"); expect(state.resume).not.toHaveBeenCalled();
    });
    it("shows buffering and retries even when stale playing state is true", () => {
        state.buffering = true; render(); expect(button("Buffering...")).not.toBeNull();
        state.error = true; state.playing = true; render(); click(button("Retry playback"));
        expect(state.resume).toHaveBeenCalledOnce(); expect(state.pause).not.toHaveBeenCalled();
    });
    it("preserves right-swipe minimize and explicit restore", () => {
        render(); swipe(host.querySelector('[data-mobile-player] > div')!, 100);
        expect(host.querySelector("[data-mobile-player]")).toBeNull(); click(button("Show player"));
        expect(host.querySelector("[data-mobile-player]")).not.toBeNull(); expect(state.pause).not.toHaveBeenCalled();
    });
    it("only dismisses paused media and restores when the same media resumes", () => {
        render(); swipe(host.querySelector('[data-mobile-player] > div')!, -100); expect(host.textContent).toBe("");
        state.playing = true; render(); expect(host.querySelector("[data-mobile-player]")).not.toBeNull();
        swipe(host.querySelector('[data-mobile-player] > div')!, -100); expect(state.mode).toHaveBeenCalledWith("overlay");
    });
    it("restores a minimized surface when the media identity changes", () => {
        render(); swipe(host.querySelector('[data-mobile-player] > div')!, 100); state.id = "next-track"; render();
        expect(host.querySelector("[data-mobile-player]")).not.toBeNull();
    });
    it("does not treat vertical scrolling, cancellation or transport touches as swipes", () => {
        render(); const card = host.querySelector('[data-mobile-player] > div')!;
        swipe(card, 120, 150); swipe(card, 120, 0, true); swipe(button("Play"), 120);
        expect(host.querySelector("[data-mobile-player]")).not.toBeNull(); expect(state.mode).not.toHaveBeenCalled();
    });
    it("ignores the touch-generated click after swiping but allows keyboard activation", () => {
        state.playing = true; render(); const card = host.querySelector('[data-mobile-player] > div')!;
        swipe(card, -100); expect(state.mode).toHaveBeenCalledOnce();
        act(() => button("Expand player").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })));
        expect(state.mode).toHaveBeenCalledOnce(); click(button("Expand player")); expect(state.mode).toHaveBeenCalledTimes(2);
    });
    it("provides non-gesture minimize and dismiss options", () => {
        render(); click(button("Player options"));
        click(Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "Minimize player")!);
        click(button("Show player")); click(button("Player options"));
        click(Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "Dismiss player")!);
        expect(host.textContent).toBe(""); expect(state.pause).not.toHaveBeenCalled();
    });
    it("localizes controls while preserving title data and keeping spoken media out of Vibe", () => {
        state.locale = "nl"; state.type = "podcast"; render();
        expect(host.textContent).toContain("Original Song"); expect(button("Play").getAttribute("aria-label")).toBe("Afspelen");
        expect(host.querySelector("[data-vibe]")).toBeNull(); expect(host.querySelector("[data-counted-track]")?.getAttribute("data-counted-track")).toBe("");
    });
    it("has no player or commands without media", () => { state.hasMedia = false; render(); expect(host.textContent).toBe(""); expect(state.mode).not.toHaveBeenCalled(); });
});

describe("full-screen player", () => {
    it("renders an accessible dialog with complete metadata and original links", () => {
        state.title = "Long original title ".repeat(20); render(true);
        expect(host.querySelector('[role="dialog"]')?.getAttribute("aria-modal")).toBe("true");
        expect(host.querySelector("h1")?.textContent).toBe(state.title);
        expect(host.querySelector('a[href="/artist/sample"]')?.textContent).toBe(state.subtitle);
        expect(host.querySelector("audio")).toBeNull(); expect(document.activeElement).toBe(button("close"));
    });
    it("keeps transport, seek, shuffle, repeat and lyrics callbacks distinct", () => {
        render(true); click(button("Play")); click(button("Next track")); click(button("Previous track"));
        click(button("Shuffle")); click(button("Repeat off")); click(button("Toggle lyrics")); click(host.querySelector("[data-seek]")! as HTMLElement);
        expect(state.resume).toHaveBeenCalledOnce(); expect(state.next).toHaveBeenCalledOnce(); expect(state.previous).toHaveBeenCalledOnce();
        expect(state.shuffle).toHaveBeenCalledOnce(); expect(state.toggleRepeat).toHaveBeenCalledOnce();
        expect(state.lyricsToggle).toHaveBeenCalledOnce(); expect(state.seek).toHaveBeenCalledWith(120);
    });
    it("preserves music-only swipe skipping and cancels vertical or multi-touch gestures", () => {
        render(true); const art = host.querySelector("[data-overlay-artwork]")!;
        swipe(art, -90); swipe(art, 90); expect(state.next).toHaveBeenCalledOnce(); expect(state.previous).toHaveBeenCalledOnce();
        swipe(art, -90, 120); swipe(art, -90, 0, true);
        touch(art, "touchstart", [{ clientX: 200, clientY: 100 }, { clientX: 210, clientY: 100 }]);
        touch(art, "touchend", []); expect(state.next).toHaveBeenCalledOnce();
    });
    it("keeps 30-second spoken controls while disabling track-only actions and gestures", () => {
        state.type = "audiobook"; render(true); click(button("Rewind 30 seconds")); click(button("Forward 30 seconds"));
        expect(state.back).toHaveBeenCalledWith(30); expect(state.forward).toHaveBeenCalledWith(30);
        expect(button("Shuffle").disabled).toBe(true); expect(button("Repeat off").disabled).toBe(true);
        expect(button("Toggle lyrics")).toBeNull(); swipe(host.querySelector("[data-overlay-artwork]")!, -100); expect(state.next).not.toHaveBeenCalled();
    });
    it("preserves Vibe-ordered queue restrictions and active repeat/shuffle semantics", () => {
        state.operation = "vibe"; state.repeat = "one"; state.shuffled = true; render(true);
        expect(button("Shuffle").disabled).toBe(true); expect(button("Shuffle").getAttribute("aria-pressed")).toBe("true");
        expect(button("Repeat one").getAttribute("aria-pressed")).toBe("true");
    });
    it("keeps inline lyrics and timer available without mounting another audio source", () => {
        state.lyrics = true; render(true); expect(host.querySelector("[data-lyrics]")).not.toBeNull();
        expect(host.querySelector("[data-overlay-artwork]")).toBeNull(); expect(host.querySelector("[data-timer]")).not.toBeNull();
        expect(host.querySelector("audio")).toBeNull();
    });
    it("closes to the previous mode on Escape without pausing and restores scroll/focus", () => {
        document.body.style.overflow = "clip"; render(true); expect(document.body.style.overflow).toBe("hidden");
        act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
        expect(state.close).toHaveBeenCalledOnce(); expect(state.pause).not.toHaveBeenCalled();
        act(() => root.render(null)); expect(document.body.style.overflow).toBe("clip"); expect(document.activeElement).toBe(trigger);
    });
    it("leaves the first Escape to an open nested timer dialog", () => {
        render(true); const nested = document.createElement("div"); nested.setAttribute("role", "dialog");
        host.querySelector("[data-overlay-player]")!.appendChild(nested);
        act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
        expect(state.close).not.toHaveBeenCalled(); nested.remove();
    });
    it("uses existing media and queue destinations and closes the overlay on navigation", () => {
        render(true); const queue = host.querySelector('a[href="/queue"]') as HTMLElement; click(queue);
        expect(state.close).toHaveBeenCalledOnce(); expect(state.pause).not.toHaveBeenCalled(); expect(state.resume).not.toHaveBeenCalled();
    });
    it("keeps an artwork fallback and original metadata when the image is absent", () => {
        state.cover = null; render(true); expect(host.querySelector("[data-overlay-artwork] img")).toBeNull();
        expect(host.querySelector("[data-overlay-artwork] [aria-hidden=true]")).not.toBeNull(); expect(host.querySelector("h1")?.textContent).toBe(state.title);
    });
    it("switches to Dutch without playback, and retains retry even if playing state is stale", () => {
        render(true); state.locale = "nl"; state.error = true; state.playing = true; render(true);
        expect(host.textContent).toContain("Original Song"); expect(state.resume).not.toHaveBeenCalled();
        click(button("Retry playback")); expect(state.resume).toHaveBeenCalledOnce(); expect(state.pause).not.toHaveBeenCalled();
    });
    it("does not mount or lock scroll when there is no current media", () => {
        state.hasMedia = false; render(true); expect(host.textContent).toBe(""); expect(document.body.style.overflow).not.toBe("hidden");
    });
});

describe("gesture and progress boundaries", () => {
    it("requires a clear horizontal gesture beyond the threshold", () => {
        expect(horizontalSwipe(80, 0, 80)).toBe(0); expect(horizontalSwipe(81, 0, 80)).toBe(1);
        expect(horizontalSwipe(-81, 0, 80)).toBe(-1); expect(horizontalSwipe(100, 110, 80)).toBe(0);
        expect(horizontalSwipe(NaN, 0, 80)).toBe(0); expect(horizontalSwipe(100, 0, 0)).toBe(0);
    });
    it("bounds progress even for non-finite or out-of-range inputs", () => {
        expect(boundedProgress(50)).toBe(50); expect(boundedProgress(-20)).toBe(0);
        expect(boundedProgress(200)).toBe(100); expect(boundedProgress(NaN)).toBe(0); expect(boundedProgress(Infinity)).toBe(0);
    });
});
