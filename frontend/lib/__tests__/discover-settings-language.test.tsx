/**
 * The destructive Discover confirmation must be translated exactly enough to
 * preserve the action semantics, never automatically consent or delete data.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n/language-context";
import { DiscoverSettingsTab } from "@/components/activity/DiscoverSettingsTab";
import { discoverClearWarning, ENGLISH_DISCOVER_CLEAR_WARNING } from "@/lib/i18n/discover-warning";

const calls = vi.hoisted(() => ({
    clear: vi.fn(),
    update: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
    api: {
        clearDiscoverPlaylist: (...args: unknown[]) => calls.clear(...args),
        updateDiscoverConfig: (...args: unknown[]) => calls.update(...args),
    },
}));
vi.mock("@/lib/notify", () => ({
    notify: {
        info: (...args: unknown[]) => calls.info(...args),
        error: (...args: unknown[]) => calls.error(...args),
    },
}));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const onPlaylistCleared = vi.fn();
const onBack = vi.fn();
const onUpdateConfig = vi.fn();
const config = {
    playlistSize: 15, exclusionMonths: 6, downloadRatio: 1.3,
    enabled: true, lastGeneratedAt: null,
};

async function render() {
    await act(async () => root.render(
        <LanguageProvider>
            <DiscoverSettingsTab config={config} onUpdateConfig={onUpdateConfig}
                onPlaylistCleared={onPlaylistCleared} onBack={onBack} />
        </LanguageProvider>,
    ));
}
async function changeLanguage(locale: "en" | "nl") {
    await act(async () => {
        localStorage.setItem("kima-hub-language", locale);
        window.dispatchEvent(new Event("kima-hub-language-change"));
    });
}
function byText(text: string): HTMLButtonElement {
    const found = [...host.querySelectorAll("button")].find(b => b.textContent?.includes(text));
    if (!found) throw new Error("Button not found: " + text);
    return found;
}
beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem("kima-hub-language");
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "confirm");
    act(() => root.unmount());
    host.remove();
});

describe("Discover settings consent-safe localization", () => {
    it("preserves every destructive English warning and safely falls back after copy drift", () => {
        expect(discoverClearWarning("en")).toBe(ENGLISH_DISCOVER_CLEAR_WARNING);
        expect(discoverClearWarning("nl")).toContain("kan niet ongedaan worden gemaakt");
        expect(discoverClearWarning("nl")).toContain("albums zonder vind-ik-leuk worden verwijderd");
        const newEnglish = ENGLISH_DISCOVER_CLEAR_WARNING + "\nNew handling rules.";
        expect(discoverClearWarning("nl", newEnglish)).toBe(newEnglish);
    });

    it("changes settings and warning labels while canceling without any deletion", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        const confirm = vi.fn().mockReturnValue(false);
        Object.defineProperty(window, "confirm", { configurable: true, writable: true, value: confirm });
        await render();
        expect(host.textContent).toContain("Grootte van afspeellijst");
        expect(host.textContent).toContain("Downloadbuffer");
        expect(host.textContent).toContain("Gevarenzone");
        expect(host.querySelector('label[for="discover-playlist-size"]')).not.toBeNull();
        expect(host.querySelector('#discover-playlist-size[aria-describedby="discover-playlist-size-description"]')).not.toBeNull();

        await act(async () => byText("Afspeellijst wissen").click());
        expect(confirm).toHaveBeenCalledWith(discoverClearWarning("nl"));
        expect(calls.clear).not.toHaveBeenCalled();
        await changeLanguage("en");
        await act(async () => byText("Clear Playlist").click());
        expect(confirm).toHaveBeenCalledWith(ENGLISH_DISCOVER_CLEAR_WARNING);
        expect(calls.clear).not.toHaveBeenCalled();
        const back = host.querySelector('button[aria-label="back to activity"]') as HTMLButtonElement;
        await act(async () => back.click());
        expect(onBack).toHaveBeenCalledOnce();
    });

    it("runs exactly one existing API operation after explicit confirmation", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        Object.defineProperty(window, "confirm", { configurable: true, writable: true, value: vi.fn().mockReturnValue(true) });
        calls.clear.mockResolvedValue({ likedMoved: 2, activeDeleted: 3 });
        await render();
        await act(async () => byText("Afspeellijst wissen").click());
        expect(calls.clear).toHaveBeenCalledOnce();
        expect(calls.clear).toHaveBeenCalledWith();
        expect(calls.info).toHaveBeenCalledWith("Ontdekkingsafspeellijst gewist", {
            message: expect.stringContaining("2 albums"),
        });
        expect(calls.info.mock.calls[0][1].message).toContain("3 albums");
        expect(onPlaylistCleared).toHaveBeenCalledOnce();
    });
});
