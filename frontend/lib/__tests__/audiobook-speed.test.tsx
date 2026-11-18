import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/language-context", () => ({
    useLanguage: () => ({ locale: "nl" }),
}));

import { AudiobookSpeedSelect } from "@/components/player/AudiobookSpeedSelect";
import { AUDIOBOOK_SPEEDS, readAudiobookSpeed, setAudiobookSpeed } from "../audiobook-speed";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
    localStorage.clear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
    localStorage.clear();
});

describe("audiobook-only speed preference", () => {
    it("defaults to 1x, offers allowed speeds and persists an accessible selection", () => {
        act(() => root.render(<AudiobookSpeedSelect />));
        const select = host.querySelector("select") as HTMLSelectElement;
        expect(select).not.toBeNull();
        expect(select.getAttribute("aria-label")).toBe("Luistersnelheid");
        expect(select.value).toBe("1");
        expect([...select.options].map(o => Number(o.value))).toEqual([...AUDIOBOOK_SPEEDS]);
        act(() => {
            select.value = "1.5";
            select.dispatchEvent(new Event("change", { bubbles: true }));
        });
        expect(readAudiobookSpeed()).toBe(1.5);
        expect(select.value).toBe("1.5");
    });

    it("handles corrupt storage safely and syncs changes across tabs", () => {
        localStorage.setItem("kima-hub-audiobook-speed-v1", "100");
        expect(readAudiobookSpeed()).toBe(1);
        act(() => root.render(<AudiobookSpeedSelect compact />));
        act(() => setAudiobookSpeed(0.75));
        expect((host.querySelector("select") as HTMLSelectElement).value).toBe("0.75");
        act(() => {
            localStorage.setItem("kima-hub-audiobook-speed-v1", "2");
            window.dispatchEvent(new Event("storage"));
        });
        expect((host.querySelector("select") as HTMLSelectElement).value).toBe("2");
        act(() => setAudiobookSpeed(8 as never));
        expect(readAudiobookSpeed()).toBe(2);
    });
});
