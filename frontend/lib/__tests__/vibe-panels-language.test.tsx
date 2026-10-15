/**
 * Vibe Map secondary controls. These tests exercise the actual React UI in
 * both languages while preserving stable blend columns, activity types, music
 * metadata and the original callback payloads.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n/language-context";
import { VibeSongPath } from "@/features/vibe/VibeSongPath";
import { VibeAlchemy } from "@/features/vibe/VibeAlchemy";
import { TrackMenu } from "@/features/vibe/TrackMenu";
import { ActivityIconBar } from "@/features/vibe/ActivityIconBar";
import type { MapTrack } from "@/features/vibe/types";

vi.mock("@/features/vibe/useTrackFinder", () => ({
    useTrackFinder: () => ({ items: [], searching: false, empty: false }),
}));
const controls = vi.hoisted(() => ({ replaceOperation: vi.fn() }));
vi.mock("@/lib/audio-controls-context", () => ({
    useAudioControls: () => controls,
}));
vi.mock("@/hooks/useNotifications", () => ({
    useNotifications: () => ({ unreadCount: 2 }),
    useActiveDownloads: () => ({ downloads: [{ id: "ci-download-id" }] }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
const q = (selector: string) => container.querySelector(selector) as HTMLElement | null;

async function render(node: React.ReactNode) {
    await act(async () => {
        root.render(
            <QueryClientProvider client={queryClient}>
                <LanguageProvider>{node}</LanguageProvider>
            </QueryClientProvider>
        );
    });
}
async function setLocale(value: "en" | "nl") {
    await act(async () => {
        localStorage.setItem("kima-hub-language", value);
        window.dispatchEvent(new Event("kima-hub-language-change"));
    });
}

beforeEach(() => {
    localStorage.removeItem("kima-hub-language");
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});
afterEach(() => {
    act(() => root.unmount());
    queryClient.clear();
    container.remove();
});

const sampleTrack: MapTrack = {
    id: "ci-original-track-id", title: "CI Original Track Title",
    artist: "CI Original Artist", artistId: "artist-id", albumId: "album-id",
    coverUrl: null, x: 0, y: 0, z: 0, colour: 0.2,
    dominantMood: "moodHappy", moods: { moodHappy: 1 },
    energy: 0.2, valence: 0.8,
};

describe("secondary Vibe controls in EN/NL", () => {
    it("translates Song Path endpoints without changing the selected path IDs", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        const onStartPath = vi.fn();
        await render(<VibeSongPath library={{ tracks: [sampleTrack], haystacks: ["ci original track title"] }}
            onStartPath={onStartPath} onClose={vi.fn()} />);
        expect((q("#path-start") as HTMLInputElement).placeholder).toBe("Begin: nummer, artiest of geluid");
        expect((q("#path-end") as HTMLInputElement).placeholder).toBe("Einde: nummer, artiest of geluid");
        expect(q('button[aria-label="Nummerroute sluiten"]')).not.toBeNull();
        expect(container.textContent).toContain("Route maken");
        expect((container.querySelector("#path-end") as HTMLInputElement).value).toBe("");
        expect(onStartPath).not.toHaveBeenCalled();
        await setLocale("en");
        expect((q("#path-start") as HTMLInputElement).placeholder).toBe("Start: a track, artist or sound");
        expect(q('button[aria-label="Close song path"]')).not.toBeNull();
        expect(onStartPath).not.toHaveBeenCalled();
    });

    it("keeps Blend add/subtract column codes while translating their labels", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        await render(<VibeAlchemy library={{ tracks: [], haystacks: [] }} onHighlight={vi.fn()} onClose={vi.fn()} />);
        expect(q('button[aria-label="Mixfunctie sluiten"]')).not.toBeNull();
        expect(container.textContent).toContain("Meer zoals");
        expect(container.textContent).toContain("Minder zoals");
        const search = q("#alchemy-search") as HTMLInputElement;
        expect(search.placeholder).toBe('Zoek om toe te voegen aan "Meer zoals"...');
        const less = [...container.querySelectorAll("button")].find(b => b.textContent?.includes("Minder zoals"));
        expect(less).toBeDefined();
        await act(async () => less!.click());
        expect(search.placeholder).toBe('Zoek om toe te voegen aan "Minder zoals"...');
        await setLocale("en");
        expect(search.placeholder).toBe('Search to add to "Less Like"...');
        expect(container.textContent).toContain("More Like");
        expect(q('button[aria-label="Close alchemy"]')).not.toBeNull();
    });

    it("preserves track metadata and menu callbacks across language switching", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        const onPlay = vi.fn(), onClose = vi.fn();
        await render(<TrackMenu track={sampleTrack} at={{ x: 18, y: 18 }}
            onPlay={onPlay} onVibe={vi.fn()} onSimilar={vi.fn()}
            onSongPath={vi.fn()} onClose={onClose} />);
        const menu = document.body.querySelector('[role="menu"]') as HTMLElement;
        expect(menu.getAttribute("aria-label")).toBe("Acties voor CI Original Track Title");
        expect(menu.textContent).toContain("CI Original Artist");
        expect(menu.textContent).toContain("Vergelijkbare nummers tonen");
        expect(menu.textContent).toContain("Nummerpad vanaf hier");
        await setLocale("en");
        expect(menu.getAttribute("aria-label")).toBe("Actions for CI Original Track Title");
        const play = [...menu.querySelectorAll("button")].find(b => b.textContent?.includes("Play"));
        expect(play).toBeDefined();
        await act(async () => play!.click());
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onPlay).toHaveBeenCalledTimes(1);
    });

    it("translates accessible activity badges without changing the activity type", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        const onToggle = vi.fn();
        await render(<ActivityIconBar expandedActivity={null} onToggleActivity={onToggle} />);
        expect(q('button[aria-label="Meldingen (2)"]')).not.toBeNull();
        expect(q('button[aria-label="Importen"]')).not.toBeNull();
        expect(q('button[aria-label="Geschiedenis"]')).not.toBeNull();
        await act(async () => (q('button[aria-label="Importen"]') as HTMLButtonElement).click());
        expect(onToggle).toHaveBeenCalledWith("imports");
        await setLocale("en");
        expect(q('button[aria-label="Notifications (2)"]')).not.toBeNull();
        expect(q('button[aria-label="Imports"]')).not.toBeNull();
    });
});
