/** Render the real desktop player, not a copy of its labels: locale changes
 * must not invoke audio commands or mutate source music identifiers.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n/language-context";
import { FullPlayer } from "@/components/player/FullPlayer";

const mocks = vi.hoisted(() => ({
    pause: vi.fn(), resume: vi.fn(), next: vi.fn(), previous: vi.fn(),
    toggleShuffle: vi.fn(), toggleRepeat: vi.fn(), toggleMute: vi.fn(),
    seek: vi.fn(), skipBackward: vi.fn(), skipForward: vi.fn(),
    setVolume: vi.fn(), setPlayerMode: vi.fn(),
    state: { isPlaying: false, repeatMode: "off", audioError: false, isBuffering: false, volume: 0.5, isShuffle: false },
    media: { hasMedia: true, title: "CI Original Song", subtitle: "CI Original Artist" },
}));
vi.mock("@/hooks/usePlayerControls", () => ({
    usePlayerControls: () => ({
        currentTrack: { id: "ci-untouched-id" }, playbackType: "track",
        volume: mocks.state.volume, isMuted: false, isShuffle: mocks.state.isShuffle,
        repeatMode: mocks.state.repeatMode,
        activeOperation: { type: "idle", matches: {} },
        queue: [{ id: "ci-untouched-id" }], currentIndex: 0,
        isPlaying: mocks.state.isPlaying, isBuffering: mocks.state.isBuffering,
        canSeek: true, downloadProgress: null, audioError: mocks.state.audioError,
        duration: 200, displayTime: 35, progress: 17.5,
        pause: mocks.pause, resumeWithGesture: mocks.resume,
        next: mocks.next, previous: mocks.previous,
        setPlayerMode: mocks.setPlayerMode, seek: mocks.seek,
        skipForward: mocks.skipForward, skipBackward: mocks.skipBackward,
        setVolume: mocks.setVolume, toggleMute: mocks.toggleMute,
        toggleShuffle: mocks.toggleShuffle, toggleRepeat: mocks.toggleRepeat,
    }),
}));
vi.mock("@/hooks/useMediaInfo", () => ({
    useMediaInfo: () => ({
        ...mocks.media, coverUrl: null, artistLink: null, mediaLink: null,
    }),
}));
vi.mock("@/hooks/useLyricsToggle", () => ({
    useLyricsToggle: () => ({ handleLyricsToggle: vi.fn(), isLyricsActive: false }),
}));
vi.mock("@/components/player/PlayerCover", () => ({
    PlayerCover: () => null,
}));
vi.mock("@/features/stats/PlayCountLine", () => ({
    PlayCountLine: () => null,
}));
vi.mock("@/components/player/SleepTimer", () => ({
    SleepTimer: () => null,
}));
vi.mock("@/components/player/VibeToggleButton", () => ({
    VibeToggleButton: () => null,
}));
vi.mock("@/components/player/KeyboardShortcutsTooltip", () => ({
    KeyboardShortcutsTooltip: () => null,
}));
vi.mock("@/components/player/SeekSlider", () => ({
    SeekSlider: () => null,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
async function render() {
    await act(async () => root.render(<LanguageProvider><FullPlayer /></LanguageProvider>));
}
async function switchLanguage(next: "nl" | "en") {
    await act(async () => {
        localStorage.setItem("kima-hub-language", next);
        window.dispatchEvent(new Event("kima-hub-language-change"));
    });
}
beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem("kima-hub-language");
    mocks.state.isPlaying = false;
    mocks.state.repeatMode = "off";
    mocks.state.audioError = false;
    mocks.state.isBuffering = false;
    mocks.state.volume = 0.5;
    mocks.state.isShuffle = false;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("desktop player actual rendered language switching", () => {
    it("localizes accessible controls while preserving music titles and action IDs", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        await render();
        expect(host.textContent).toContain("CI Original Song");
        expect(host.textContent).toContain("CI Original Artist");
        const controls = host.querySelector('[role="group"][aria-label="Afspeelknoppen"]');
        expect(controls).not.toBeNull();
        expect(host.querySelector('button[aria-label="Vorig nummer"]')).not.toBeNull();
        expect(host.querySelector('button[aria-label="Afspelen"]')).not.toBeNull();
        expect(host.querySelector('input[aria-label="Volume"]')?.getAttribute("aria-valuetext")).toBe("50 procent");
        await switchLanguage("en");
        expect(host.querySelector('button[aria-label="Previous track"]')).not.toBeNull();
        expect(host.querySelector('button[title="play"]')).not.toBeNull();
        expect(host.querySelector('input[aria-label="Volume"]')?.getAttribute("aria-valuetext")).toBe("50 percent");
        expect(host.textContent).toContain("CI Original Song");
        expect(host.textContent).toContain("CI Original Artist");
        expect(mocks.pause).not.toHaveBeenCalled();
        expect(mocks.resume).not.toHaveBeenCalled();
        expect(mocks.seek).not.toHaveBeenCalled();
        expect(mocks.setPlayerMode).not.toHaveBeenCalled();
        await act(async () => (host.querySelector('button[title="play"]') as HTMLButtonElement).click());
        expect(mocks.resume).toHaveBeenCalledOnce();
    });
    it("uses translated repeat and shuffle hints without changing mode state", async () => {
        mocks.state.repeatMode = "all";
        localStorage.setItem("kima-hub-language", "nl");
        await render();
        expect(host.querySelector('button[aria-label="Alles herhalen"]')).not.toBeNull();
        expect(host.querySelector('button[title="herhalen: alles (wachtrij herhalen)"]')).not.toBeNull();
        expect(host.querySelector('button[title="willekeurig afspelen"]')).not.toBeNull();
        await switchLanguage("en");
        expect(host.querySelector('button[title="repeat: all (loop queue)"]')).not.toBeNull();
        expect(host.querySelector('button[title="shuffle"]')).not.toBeNull();
        expect(mocks.state.repeatMode).toBe("all");
        expect(mocks.toggleShuffle).not.toHaveBeenCalled();
        expect(mocks.toggleRepeat).not.toHaveBeenCalled();
    });
});
