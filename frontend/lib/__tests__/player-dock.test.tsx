import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FullPlayer } from "@/components/player/FullPlayer";
import { translate } from "@/lib/i18n/translations";

const state = vi.hoisted(() => ({
    locale: "en" as "en" | "nl", hasMedia: true, isPlaying: false, isBuffering: false,
    audioError: false, playbackType: "track", isMuted: false, volume: 0.5,
    isShuffle: false, repeatMode: "off", operation: "idle", isLyricsActive: false,
    pause: vi.fn(), resume: vi.fn(), previous: vi.fn(), next: vi.fn(),
    back: vi.fn(), forward: vi.fn(), shuffle: vi.fn(), repeat: vi.fn(), mute: vi.fn(),
    volumeChange: vi.fn(), mode: vi.fn(), lyrics: vi.fn(), seek: vi.fn(),
}));
vi.mock("@/hooks/usePlayerControls", () => ({ usePlayerControls: () => ({
    ...state, currentTrack: { id: "track-original" }, queue: [{ id: "track-original" }], currentIndex: 0,
    activeOperation: { type: state.operation, matches: { "track-original": .82 } },
    duration: 240, displayTime: 60, progress: 25, canSeek: true, downloadProgress: undefined,
    resumeWithGesture: state.resume, skipBackward: state.back, skipForward: state.forward,
    toggleShuffle: state.shuffle, toggleRepeat: state.repeat, toggleMute: state.mute,
    setVolume: state.volumeChange, setPlayerMode: state.mode,
}) }));
vi.mock("@/hooks/useMediaInfo", () => ({ useMediaInfo: () => ({
    title: "Original title", subtitle: "Original artist", hasMedia: state.hasMedia,
    coverUrl: null, artistLink: "/artist/original", mediaLink: "/album/original",
}) }));
vi.mock("@/hooks/useLyricsToggle", () => ({ useLyricsToggle: () => ({ handleLyricsToggle: state.lyrics, isLyricsActive: state.isLyricsActive }) }));
vi.mock("@/lib/i18n/language-context", () => ({ useLanguage: () => ({ locale: state.locale, t: (key: string) => translate(state.locale, key) }) }));
vi.mock("next/link", () => ({ default: ({ children, prefetch, ...props }: React.ComponentProps<"a"> & { prefetch?: boolean }) => <a {...props} data-prefetch={String(prefetch)}>{children}</a> }));
vi.mock("@/components/player/PlayerCover", () => ({ PlayerCover: () => null }));
vi.mock("@/features/stats/PlayCountLine", () => ({ PlayCountLine: () => null }));
vi.mock("@/components/player/SleepTimer", () => ({ SleepTimer: () => <span data-sleep-timer /> }));
vi.mock("@/components/player/KeyboardShortcutsTooltip", () => ({ KeyboardShortcutsTooltip: () => <span data-shortcuts /> }));
vi.mock("@/components/player/VibeToggleButton", () => ({ VibeToggleButton: ({ unavailable }: { unavailable: boolean }) => <button type="button" data-vibe disabled={unavailable} /> }));
vi.mock("@/components/player/SeekSlider", () => ({ SeekSlider: ({ onSeek, canSeek }: { onSeek: (time: number) => void; canSeek: boolean }) => <button type="button" data-seek disabled={!canSeek} onClick={() => onSeek(120)} /> }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
function render() { act(() => root.render(<FullPlayer />)); }
function button(label: string) { return host.querySelector(`button[aria-label="${translate(state.locale, label)}"]`) as HTMLButtonElement; }
beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(state, { locale: "en", hasMedia: true, isPlaying: false, isBuffering: false, audioError: false, playbackType: "track", isMuted: false, volume: .5, isShuffle: false, repeatMode: "off", operation: "idle", isLyricsActive: false });
    host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("desktop dock preserves playback contracts", () => {
    it("keeps transport actions separate and resumes with the user gesture", () => {
        render();
        act(() => { button("Play").click(); button("Previous track").click(); button("Next track").click(); button("Rewind 30 seconds").click(); button("Forward 30 seconds").click(); });
        expect(state.resume).toHaveBeenCalledOnce(); expect(state.pause).not.toHaveBeenCalled();
        expect(state.previous).toHaveBeenCalledOnce(); expect(state.next).toHaveBeenCalledOnce();
        expect(state.back).toHaveBeenCalledWith(30); expect(state.forward).toHaveBeenCalledWith(30);
        state.isPlaying = true; render(); act(() => button("Pause").click());
        expect(state.pause).toHaveBeenCalledOnce();
    });
    it("preserves buffering and retries even when the playing flag is stale", () => {
        state.isBuffering = true; render(); expect(button("Buffering...").disabled).toBe(false);
        state.isBuffering = false; state.audioError = true; state.isPlaying = true;
        render(); act(() => button("Retry playback").click());
        expect(state.resume).toHaveBeenCalledOnce(); expect(state.pause).not.toHaveBeenCalled();
    });
    it("keeps spoken-media skipping but disables track-only next, repeat, shuffle and lyrics", () => {
        state.playbackType = "podcast"; render();
        expect(button("Next track").disabled).toBe(true); expect(button("Previous track").disabled).toBe(true);
        expect(button("Repeat off").disabled).toBe(true); expect(button("Shuffle").disabled).toBe(true);
        expect(button("Toggle lyrics")).toBeNull(); expect(button("Rewind 30 seconds").disabled).toBe(false);
        act(() => button("Next track").click()); expect(state.next).not.toHaveBeenCalled();
    });
    it("keeps an empty dock non-playing while queue navigation stays reachable", () => {
        state.hasMedia = false; render();
        expect(button("Play").disabled).toBe(true); expect(button("Expand player").disabled).toBe(true);
        expect(button("Shuffle").disabled).toBe(true);
        expect(host.querySelector('a[href="/queue"]')?.getAttribute("data-prefetch")).toBe("false");
        act(() => button("Play").click()); expect(state.resume).not.toHaveBeenCalled();
    });
    it("reports mute state correctly even with a remembered nonzero volume", () => {
        state.isMuted = true; render(); act(() => button("Unmute").click()); expect(state.mute).toHaveBeenCalledOnce();
        expect(host.querySelector('input[aria-label="Volume"]')?.getAttribute("aria-valuenow")).toBe("50");
    });
    it("keeps repeat, lyrics, expansion, timer and shortcuts available", () => {
        render(); act(() => { button("Shuffle").click(); button("Repeat off").click(); button("Toggle lyrics").click(); button("Expand player").click(); });
        expect(state.shuffle).toHaveBeenCalledOnce(); expect(state.repeat).toHaveBeenCalledOnce();
        expect(state.lyrics).toHaveBeenCalledOnce(); expect(state.mode).toHaveBeenCalledWith("overlay");
        expect(host.querySelector("[data-sleep-timer]")).not.toBeNull(); expect(host.querySelector("[data-shortcuts]")).not.toBeNull();
        state.repeatMode = "one"; state.isLyricsActive = true; render();
        expect(button("Repeat one").getAttribute("aria-pressed")).toBe("true");
        expect(button("Toggle lyrics").getAttribute("aria-pressed")).toBe("true");
    });
    it("switches EN/NL presentation without changing identifiers or issuing audio commands", () => {
        render(); const album = host.querySelector('a[href="/album/original"]');
        state.locale = "nl"; render();
        expect(host.textContent).toContain("Original title"); expect(host.textContent).toContain("Original artist");
        expect(button("Play").getAttribute("aria-label")).toBe("Afspelen");
        expect(host.querySelector('a[href="/album/original"]')).toBe(album);
        expect(state.resume).not.toHaveBeenCalled(); expect(state.mode).not.toHaveBeenCalled();
    });
});
