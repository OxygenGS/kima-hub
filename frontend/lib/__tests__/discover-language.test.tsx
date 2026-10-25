/**
 * v1.11 Discover Weekly translation remains presentation-only. The language
 * can change without changing original music metadata, tier codes or callback
 * arguments for previews, liking or playing tracks.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n/language-context";
import { DiscoverHero } from "@/features/discover/components/DiscoverHero";
import { DiscoverActionBar } from "@/features/discover/components/DiscoverActionBar";
import { HowItWorks } from "@/features/discover/components/HowItWorks";
import { UnavailableAlbums } from "@/features/discover/components/UnavailableAlbums";
import { TrackList } from "@/features/discover/components/TrackList";
import type { DiscoverTrack, UnavailableAlbum, DiscoverPlaylist } from "@/features/discover/types";

vi.mock("@/components/ui/CachedImage", () => ({ CachedImage: () => null }));
vi.mock("@/hooks/useDoubleTap", () => ({ useDoubleTapList: () => () => undefined }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const track: DiscoverTrack = {
    id: "ci-unchanged-track-id",
    title: "CI Unchanged Track Title",
    artist: "CI Unchanged Artist",
    album: "CI Unchanged Album",
    albumId: "ci-unchanged-album-id",
    isLiked: false, likedAt: null, similarity: 0.91,
    tier: "high", coverUrl: null, available: true, duration: 3660,
};
const missing: UnavailableAlbum = {
    id: "ci-missing-id", title: "CI Preview Title",
    artist: "CI Preview Artist", album: "CI Preview Album",
    albumId: "ci-missing-album-id", similarity: 0.55,
    tier: "medium", previewUrl: "https://example.invalid/sample",
    deezerTrackId: null, deezerAlbumId: null, available: false,
    attemptNumber: 0,
};
const playlist: DiscoverPlaylist = {
    weekStart: "2026-10-12T12:00:00Z",
    weekEnd: "2026-10-19T12:00:00Z",
    tracks: [track], unavailable: [missing],
    totalCount: 1, unavailableCount: 1,
};

let host: HTMLDivElement;
let root: Root;
const find = (selector: string) => host.querySelector(selector) as HTMLElement | null;

async function render(node: React.ReactNode) {
    await act(async () => {
        root.render(<LanguageProvider>{node}</LanguageProvider>);
    });
}
async function selectLanguage(next: "en" | "nl") {
    await act(async () => {
        localStorage.setItem("kima-hub-language", next);
        window.dispatchEvent(new Event("kima-hub-language-change"));
    });
}
async function click(button: HTMLButtonElement) {
    await act(async () => button.click());
}
beforeEach(() => {
    localStorage.removeItem("kima-hub-language");
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("Discover Weekly EN/NL interface", () => {
    it("translates weekly heading, counts, duration and dates without altering configuration", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        const onOpenSettings = vi.fn();
        const config = {
            playlistSize: 10, exclusionMonths: 6, downloadRatio: 1,
            enabled: true, lastGeneratedAt: "2026-10-12T12:00:00Z",
        };
        await render(<DiscoverHero playlist={playlist} config={config} onOpenSettings={onOpenSettings} />);
        expect(host.textContent).toContain("Wekelijkse ontdekkingen");
        expect(host.textContent).toContain("1 nummer");
        expect(host.textContent).toContain("ongeveer 1 uur 1 min");
        expect(host.textContent).toContain("Bijgewerkt");
        await click(find('button[aria-label="Ontdekkingsinstellingen openen"]') as HTMLButtonElement);
        expect(onOpenSettings).toHaveBeenCalledOnce();
        await selectLanguage("en");
        expect(host.textContent).toContain("Discover Weekly");
        expect(host.textContent).toContain("about 1 hr 1 min");
        expect(host.textContent).toContain("1 track");
        expect(config.playlistSize).toBe(10);
        expect(playlist.tracks[0].id).toBe("ci-unchanged-track-id");
    });

    it("keeps real track data and tier IDs while only localizing track controls", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        const onPlayTrack = vi.fn(), onLike = vi.fn(), onTogglePlay = vi.fn();
        const props = { tracks: [track], currentTrack: null, isPlaying: false, onPlayTrack, onTogglePlay, onLike };
        await render(<TrackList {...props} />);
        expect(host.textContent).toContain("CI Unchanged Track Title");
        expect(host.textContent).toContain("CI Unchanged Artist");
        expect(host.textContent).toContain("CI Unchanged Album");
        expect(host.textContent).toContain("Titel");
        expect(host.textContent).toContain("Overeenkomst");
        await click(find('button[aria-label="leuk vinden CI Unchanged Track Title"]') as HTMLButtonElement);
        expect(onLike).toHaveBeenCalledWith(track);
        await click(find('button[aria-label="Afspelen"]') as HTMLButtonElement);
        expect(onPlayTrack).toHaveBeenCalledWith(0);
        await selectLanguage("en");
        expect(find('button[aria-label="like CI Unchanged Track Title"]')).not.toBeNull();
        expect(host.textContent).toContain("CI Unchanged Track Title");
        expect(host.textContent).toContain("Match");
        expect(track.tier).toBe("high");
    });

    it("shows translated match tiers in both desktop and mobile displays without changing ranking", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        const tiers = ["high", "medium", "explore", "wildcard"] as const;
        const tracks = tiers.map((tier, index) => ({
            ...track, id: `match-${index}`, title: `Match test ${index}`, tier,
        }));
        const onPlayTrack = vi.fn(), onTogglePlay = vi.fn(), onLike = vi.fn();
        await render(<TrackList tracks={tracks} currentTrack={null} isPlaying={false}
            onPlayTrack={onPlayTrack} onTogglePlay={onTogglePlay} onLike={onLike} />);
        expect(host.querySelectorAll(".md\\:hidden[aria-label]").length).toBe(4);
        const dutchLabels = [...host.querySelectorAll(".md\\:hidden[aria-label]")].map((el) => el.getAttribute("aria-label"));
        expect(dutchLabels.every(Boolean)).toBe(true);
        expect(new Set(dutchLabels).size).toBe(4);
        await selectLanguage("en");
        expect([...host.querySelectorAll(".md\\:hidden[aria-label]")].map((el) => el.getAttribute("aria-label")))
            .toEqual(["High Match", "Medium Match", "Explore", "Wild Card"]);
        expect(tracks.map((item) => item.tier)).toEqual(tiers);
        expect(onPlayTrack).not.toHaveBeenCalled();
        expect(onLike).not.toHaveBeenCalled();
    });

    it("shows the pause control for an actively playing recommendation", async () => {
        await render(<TrackList tracks={[track]} currentTrack={{ id: track.id }} isPlaying={true}
            onPlayTrack={vi.fn()} onTogglePlay={vi.fn()} onLike={vi.fn()} />);
        const button = find('button[aria-label="Pause"]');
        expect(button).not.toBeNull();
        expect(button?.querySelector("svg.lucide-pause")).not.toBeNull();
    });

    it("labels unavailable album preview controls in Dutch while keeping the original preview callback", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        const onTogglePreview = vi.fn(), onRetryAll = vi.fn();
        await render(<UnavailableAlbums unavailable={[missing]} currentPreview={null}
            onTogglePreview={onTogglePreview} onRetryAll={onRetryAll} />);
        expect(host.textContent).toContain("1 album niet beschikbaar");
        const expand = find('button[aria-controls="discover-unavailable-list"]') as HTMLButtonElement;
        expect(expand.getAttribute("aria-expanded")).toBe("false");
        await click(expand);
        expect(expand.getAttribute("aria-expanded")).toBe("true");
        expect(host.textContent).toContain("Oorspronkelijke aanbeveling");
        expect(host.textContent).toContain("CI Preview Album");
        await click(find('button[aria-label="Voorbeeld afspelen: CI Preview Album"]') as HTMLButtonElement);
        expect(onTogglePreview).toHaveBeenCalledWith("ci-missing-id", "CI Preview Artist", "CI Preview Title");
        expect(onRetryAll).not.toHaveBeenCalled();
        await selectLanguage("en");
        expect(find('button[aria-label="Play preview: CI Preview Album"]')).not.toBeNull();
        expect(host.textContent).toContain("CI Preview Artist");
    });

    it("switches playback/cancel labels without invoking either action during locale switching", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        const onPlayToggle = vi.fn(), onCancelGeneration = vi.fn();
        await render(<DiscoverActionBar playlist={playlist} isPlaylistPlaying={false} isPlaying={false}
            onPlayToggle={onPlayToggle} isGenerating={false} onCancelGeneration={onCancelGeneration} />);
        expect(find('button[aria-label="wekelijkse ontdekkingen afspelen"]')).not.toBeNull();
        await selectLanguage("en");
        expect(find('button[aria-label="play discover weekly"]')).not.toBeNull();
        expect(onPlayToggle).not.toHaveBeenCalled();
        await click(find('button[aria-label="play discover weekly"]') as HTMLButtonElement);
        expect(onPlayToggle).toHaveBeenCalledOnce();
        expect(onCancelGeneration).not.toHaveBeenCalled();
    });

    it("keeps ListenBrainz, Deezer, percentages and the download directory unchanged in both languages", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        await render(<HowItWorks />);
        expect(host.textContent).toContain("Hoe het werkt");
        expect(host.textContent).toContain("ListenBrainz");
        expect(host.textContent).toContain("Deezer");
        expect(host.textContent).toContain("80–100%");
        expect(host.textContent).toContain("/music/discovery");
        await selectLanguage("en");
        expect(host.textContent).toContain("80-100%");
        expect(host.textContent).toContain("How It Works");
        expect(host.textContent).toContain("/music/discovery");
    });
});
