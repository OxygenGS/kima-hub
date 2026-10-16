/**
 * Presentation-only sleep-timer localization. Fixed minute preset values and
 * the current countdown are unchanged when switching the browser language.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n/language-context";
import { SleepTimer } from "@/components/player/SleepTimer";

const mocks = vi.hoisted(() => ({
    setTimer: vi.fn(),
    clearTimer: vi.fn(),
    state: { isActive: false, remainingSeconds: null as number | null, displayRemaining: "" },
}));

vi.mock("@/hooks/useSleepTimer", () => ({
    useSleepTimer: () => ({
        ...mocks.state,
        setTimer: mocks.setTimer,
        clearTimer: mocks.clearTimer,
    }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

async function render() {
    await act(async () => root.render(
        <LanguageProvider><SleepTimer /></LanguageProvider>,
    ));
}
async function selectLanguage(locale: "en" | "nl") {
    await act(async () => {
        localStorage.setItem("kima-hub-language", locale);
        window.dispatchEvent(new Event("kima-hub-language-change"));
    });
}
function button(text: string) {
    const node = [...host.querySelectorAll("button")].find(b => b.textContent?.trim() === text);
    if (!node) throw new Error("Preset button not found: " + text);
    return node;
}
async function click(node: HTMLButtonElement) {
    await act(async () => node.click());
}

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem("kima-hub-language");
    mocks.state.isActive = false;
    mocks.state.remainingSeconds = null;
    mocks.state.displayRemaining = "";
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("sleep timer live EN/NL language", () => {
    it("shows localized presets but passes the exact original minute values", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        await render();
        await click(host.querySelector('button[aria-label="Slaaptimer"]') as HTMLButtonElement);
        expect(host.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Opties voor slaaptimer");
        expect(host.textContent).toContain("Slaaptimer");
        expect(button("15 minuten")).toBeDefined();
        expect(button("1 uur")).toBeDefined();
        expect(button("1,5 uur")).toBeDefined();
        await click(button("1,5 uur"));
        expect(mocks.setTimer).toHaveBeenCalledOnce();
        expect(mocks.setTimer).toHaveBeenCalledWith(90);
        expect(mocks.clearTimer).not.toHaveBeenCalled();
        expect(host.querySelector('[role="dialog"]')).toBeNull();
    });

    it("switches controls live without resetting an active timer", async () => {
        mocks.state.isActive = true;
        mocks.state.remainingSeconds = 3780;
        mocks.state.displayRemaining = "1h 3m";
        localStorage.setItem("kima-hub-language", "nl");
        await render();
        expect(host.querySelector('button[aria-label="Slaaptimer: 1h 3m resterend"]')).not.toBeNull();
        await click(host.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement);
        expect(button("Slaaptimer stoppen")).toBeDefined();
        await selectLanguage("en");
        expect(host.querySelector('button[aria-label="Sleep timer: 1h 3m remaining"]')).not.toBeNull();
        expect(button("Cancel Timer")).toBeDefined();
        expect(button("1.5 hours")).toBeDefined();
        expect(mocks.setTimer).not.toHaveBeenCalled();
        expect(mocks.clearTimer).not.toHaveBeenCalled();
        await click(button("Cancel Timer"));
        expect(mocks.clearTimer).toHaveBeenCalledOnce();
    });

    it("translates custom-minute labels and preserves the original input bounds and preset values", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        await render();
        await click(host.querySelector('button[aria-haspopup="dialog"]') as HTMLButtonElement);
        const input = host.querySelector('input[type="number"]') as HTMLInputElement;
        expect(input.getAttribute("aria-label")).toBe("Aangepast aantal minuten");
        expect(input.getAttribute("placeholder")).toBe("Aangepast");
        expect(input.min).toBe("1");
        expect(input.max).toBe("480");
        expect(input.step).toBe("1");
        // Presets need no network calls, and language never affects numeric timer values.
        await selectLanguage("en");
        expect(input.getAttribute("aria-label")).toBe("Custom minutes");
        expect(mocks.setTimer).not.toHaveBeenCalled();
        await click(button("30 minutes"));
        expect(mocks.setTimer).toHaveBeenCalledWith(30);
    });
});
