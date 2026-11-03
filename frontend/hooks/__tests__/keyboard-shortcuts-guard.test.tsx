import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const audio = vi.hoisted(() => ({
    isPlaying: false,
    resumeWithGesture: vi.fn(),
    pause: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
    seek: vi.fn(),
    currentTime: 30,
    setVolume: vi.fn(),
    volume: 0.5,
    toggleMute: vi.fn(),
    toggleShuffle: vi.fn(),
    playbackType: "track",
    currentTrack: { duration: 120 },
    currentAudiobook: null,
    currentPodcast: null,
}));
vi.mock("@/lib/audio-context", () => ({ useAudio: () => audio }));
vi.mock("@/lib/tv-utils", () => ({ useIsTV: () => false }));

import { useKeyboardShortcuts } from "../useKeyboardShortcuts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
function Probe() { useKeyboardShortcuts(); return null; }

async function press(target: Element, key: string, opts: KeyboardEventInit = {}) {
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...opts });
    await act(async () => { target.dispatchEvent(event); });
    return event;
}

beforeEach(async () => {
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<Probe />));
});
afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
});

describe("global keyboard shortcuts coexist with UI controls", () => {
    it("still controls playback when the page body has focus", async () => {
        const play = await press(document.body, " ");
        expect(play.defaultPrevented).toBe(true);
        expect(audio.resumeWithGesture).toHaveBeenCalledTimes(1);

        const seek = await press(document.body, "ArrowRight");
        expect(seek.defaultPrevented).toBe(true);
        expect(audio.seek).toHaveBeenLastCalledWith(40);
    });

    it("never hijacks buttons, sliders, links or text and form inputs", async () => {
        const button = document.createElement("button");
        const slider = document.createElement("div");
        slider.setAttribute("role", "slider");
        const input = document.createElement("input");
        const select = document.createElement("select");
        const link = document.createElement("a");
        link.href = "/album";
        for (const element of [button, slider, input, select, link]) {
            host.appendChild(element);
            expect((await press(element, " ")).defaultPrevented).toBe(false);
            expect((await press(element, "ArrowRight")).defaultPrevented).toBe(false);
        }
        expect(audio.resumeWithGesture).not.toHaveBeenCalled();
        expect(audio.seek).not.toHaveBeenCalled();
    });

    it("does not override browser shortcuts or already handled events", async () => {
        expect((await press(document.body, "ArrowRight", { ctrlKey: true })).defaultPrevented).toBe(false);
        expect((await press(document.body, " ", { shiftKey: true })).defaultPrevented).toBe(false);
        const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: " " });
        event.preventDefault();
        await act(async () => { document.body.dispatchEvent(event); });
        expect(audio.resumeWithGesture).not.toHaveBeenCalled();
        expect(audio.seek).not.toHaveBeenCalled();
    });
});
