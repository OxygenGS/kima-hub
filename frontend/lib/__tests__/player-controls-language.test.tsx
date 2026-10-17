/** Player tooltips change language without changing shortcuts or invoking audio actions. */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n/language-context";
import { KeyboardShortcutsTooltip } from "@/components/player/KeyboardShortcutsTooltip";
import { VibeToggleButton } from "@/components/player/VibeToggleButton";
import { SeekSlider } from "@/components/player/SeekSlider";

const mocks = vi.hoisted(() => ({
    toggle: vi.fn(),
    activeType: "idle",
    featuresEnabled: true,
}));
vi.mock("@/lib/audio-state-context", () => ({
    useAudioState: () => ({ activeOperation: { type: mocks.activeType } }),
}));
vi.mock("@/lib/features-context", () => ({
    useFeatures: () => ({ vibeEmbeddings: mocks.featuresEnabled, loading: false }),
}));
vi.mock("@/hooks/useVibeToggle", () => ({
    useVibeToggle: () => ({ handleVibeToggle: mocks.toggle, isVibeLoading: false }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
async function render(node: React.ReactNode) {
    await act(async () => root.render(<LanguageProvider>{node}</LanguageProvider>));
}
async function localeChange(next: "nl" | "en") {
    await act(async () => {
        localStorage.setItem("kima-hub-language", next);
        window.dispatchEvent(new Event("kima-hub-language-change"));
    });
}
async function click(node: HTMLButtonElement) {
    await act(async () => node.click());
}
beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem("kima-hub-language");
    mocks.activeType = "idle";
    mocks.featuresEnabled = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("localized player controls", () => {
    it("translates shortcut descriptions and labels, preserves physical keys", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        await render(<KeyboardShortcutsTooltip />);
        const trigger = host.querySelector('button[aria-label="sneltoetsen"]') as HTMLButtonElement;
        expect(trigger).not.toBeNull();
        expect(trigger.getAttribute("aria-expanded")).toBe("false");
        await click(trigger);
        expect(trigger.getAttribute("aria-expanded")).toBe("true");
        expect(host.querySelector('[role="tooltip"]')?.textContent).toContain("Afspelen / pauzeren");
        expect(host.querySelector('[role="tooltip"]')?.textContent).toContain("Sneltoetsen");
        expect([...host.querySelectorAll("kbd")].map(x => x.textContent)).toEqual(["Space", "→", "←", "↑", "↓", "M", "N", "P", "S"]);
        await localeChange("en");
        expect(host.querySelector('[role="tooltip"]')?.textContent).toContain("Play / Pause");
        expect(host.querySelector('[role="tooltip"]')?.textContent).toContain("Shortcuts work anywhere except when typing in text fields.");
        await click(trigger);
        expect(trigger.getAttribute("aria-expanded")).toBe("false");
    });

    it("translates vibe action and tooltip without changing active state or triggering playback", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        const props = { unavailable: false, className: "vibe", iconClassName: "icon", idleClassName: "idle", activeClassName: "active" };
        await render(<VibeToggleButton {...props} />);
        let btn = host.querySelector("button") as HTMLButtonElement;
        expect(btn.getAttribute("aria-label")).toBe("Vergelijkbare muziek zoeken");
        expect(btn.getAttribute("aria-pressed")).toBe("false");
        expect(btn.getAttribute("title")).toBe("Zoek nummers met een vergelijkbare sfeer");
        await localeChange("en");
        expect(btn.getAttribute("aria-label")).toBe("Match this vibe");
        expect(mocks.toggle).not.toHaveBeenCalled();
        await click(btn);
        expect(mocks.toggle).toHaveBeenCalledOnce();
        // Active operation is the unmodified server/player ID.
        mocks.activeType = "vibe";
        await render(<VibeToggleButton {...props} />);
        btn = host.querySelector("button") as HTMLButtonElement;
        expect(btn.getAttribute("aria-pressed")).toBe("true");
        await localeChange("nl");
        expect(btn.getAttribute("aria-label")).toBe("Vibe-modus uitschakelen");
        expect(mocks.activeType).toBe("vibe");
        expect(mocks.toggle).toHaveBeenCalledOnce();
    });

    it("translates seek hints while retaining numeric download progress and original seek callbacks", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        const onSeek = vi.fn();
        const props = { progress: 25, duration: 200, onSeek, canSeek: false, hasMedia: true, downloadProgress: 37 };
        await render(<SeekSlider {...props} />);
        const slider = host.firstElementChild as HTMLElement;
        expect(slider.getAttribute("title")).toContain("37%");
        expect(slider.getAttribute("title")).toContain("spoelen is mogelijk");
        await localeChange("en");
        expect(slider.getAttribute("title")).toBe("downloading 37%... seek will be available when cached");
        await act(async () => slider.click());
        expect(onSeek).not.toHaveBeenCalled();
        await render(<SeekSlider {...props} canSeek />);
        expect(slider.getAttribute("title")).toBe("click or drag to seek");
        await localeChange("nl");
        expect(slider.getAttribute("title")).toBe("klik of sleep om te spoelen");
        expect(onSeek).not.toHaveBeenCalled();
    });

    it("does not claim undefined download progress is a percentage", async () => {
        await render(<SeekSlider progress={0} duration={250} canSeek={false} hasMedia onSeek={vi.fn()} />);
        expect((host.firstElementChild as HTMLElement).title)
            .toBe("downloading... seeking will be available when cached");
    });
});
