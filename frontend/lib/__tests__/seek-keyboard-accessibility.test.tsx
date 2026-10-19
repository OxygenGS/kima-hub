/** Seeking by keyboard has the same second-based API as mouse/touch seeking. */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n/language-context";
import { SeekSlider } from "@/components/player/SeekSlider";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
const onSeek = vi.fn();
const props = { progress: 25, duration: 200, canSeek: true, hasMedia: true, onSeek };
async function render(overrides: Partial<typeof props> = {}) {
    await act(async () => root.render(
        <LanguageProvider><SeekSlider {...props} {...overrides} /></LanguageProvider>,
    ));
}
async function press(key: string): Promise<KeyboardEvent> {
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key });
    await act(async () => (host.firstElementChild as HTMLElement).dispatchEvent(event));
    return event;
}
beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem("kima-hub-language");
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("seek bar keyboard accessibility", () => {
    it("uses accessible current position and changes only the visible label when switching language", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        await render();
        const slider = host.querySelector('[role="slider"]') as HTMLElement;
        expect(slider.getAttribute("aria-label")).toBe("Afspeelpositie");
        expect(slider.getAttribute("aria-valuemin")).toBe("0");
        expect(slider.getAttribute("aria-valuemax")).toBe("200");
        expect(slider.getAttribute("aria-valuenow")).toBe("50");
        expect(slider.getAttribute("aria-valuetext")).toBe("0:50 / 3:20");
        expect(slider.tabIndex).toBe(0);
        await act(async () => {
            localStorage.setItem("kima-hub-language", "en");
            window.dispatchEvent(new Event("kima-hub-language-change"));
        });
        expect(slider.getAttribute("aria-label")).toBe("Playback position");
        expect(slider.getAttribute("aria-valuenow")).toBe("50");
        expect(onSeek).not.toHaveBeenCalled();
    });

    it("supports arrow, page, home and end keys with unchanged second-based seek callbacks", async () => {
        await render();
        expect((await press("ArrowRight")).defaultPrevented).toBe(true);
        expect(onSeek).toHaveBeenLastCalledWith(55);
        await press("ArrowLeft");
        expect(onSeek).toHaveBeenLastCalledWith(45);
        await press("ArrowUp");
        expect(onSeek).toHaveBeenLastCalledWith(55);
        await press("ArrowDown");
        expect(onSeek).toHaveBeenLastCalledWith(45);
        await press("PageUp");
        expect(onSeek).toHaveBeenLastCalledWith(60);
        await press("PageDown");
        expect(onSeek).toHaveBeenLastCalledWith(40);
        await press("Home");
        expect(onSeek).toHaveBeenLastCalledWith(0);
        await press("End");
        expect(onSeek).toHaveBeenLastCalledWith(200);
        const count = onSeek.mock.calls.length;
        expect((await press("Space")).defaultPrevented).toBe(false);
        expect(onSeek).toHaveBeenCalledTimes(count);
    });

    it("does not allow seeking when uncached or no media is available", async () => {
        await render({ canSeek: false, progress: 0, duration: 200 });
        const slider = host.querySelector('[role="slider"]') as HTMLElement;
        expect(slider.getAttribute("aria-disabled")).toBe("true");
        expect(slider.tabIndex).toBe(-1);
        expect((await press("ArrowRight")).defaultPrevented).toBe(false);
        expect(onSeek).not.toHaveBeenCalled();
        await render({ hasMedia: false });
        await press("End");
        expect(onSeek).not.toHaveBeenCalled();
    });

    it("keeps keyboard targets clamped within the playable range", async () => {
        await render({ progress: 99, duration: 200 });
        await press("ArrowRight");
        expect(onSeek).toHaveBeenLastCalledWith(200);
        onSeek.mockClear();
        await render({ progress: 0, duration: 200 });
        await press("ArrowLeft");
        expect(onSeek).not.toHaveBeenCalled();
        await render({ duration: 0 });
        expect((host.firstElementChild as HTMLElement).tabIndex).toBe(-1);
        await press("ArrowRight");
        expect(onSeek).not.toHaveBeenCalled();
    });
});
