import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ useHomeData: vi.fn() }));
vi.mock("@/features/home/hooks/useHomeData", () => ({ useHomeData: mocks.useHomeData }));
vi.mock("@/lib/i18n/language-context", () => ({ useLanguage: () => ({ t: (s: string) => s }) }));
vi.mock("@/components/ui/LoadingScreen", () => ({ LoadingScreen: () => <div data-testid="auth-loader" /> }));
vi.mock("@/features/home/components/HomeHero", () => ({
    HomeHero: ({ loading }: { loading?: boolean }) => <div data-testid="hero">{loading ? "hero-loading" : "hero-ready"}</div>,
}));
vi.mock("@/components/ui/SectionHeader", () => ({
    SectionHeader: ({ title }: { title: React.ReactNode }) => <h2>{title}</h2>,
}));
vi.mock("@/features/home/components/ContinueListening", () => ({
    ContinueListening: () => <div data-testid="continue-ready" />,
}));
vi.mock("@/features/home/components/ArtistsGrid", () => ({
    ArtistsGrid: () => <div data-testid="artists-ready" />,
    PopularArtistsGrid: () => <div data-testid="popular-ready" />,
}));
vi.mock("@/features/home/components/MixesGrid", () => ({ MixesGrid: () => <div data-testid="mixes-ready" /> }));
vi.mock("@/features/home/components/PodcastsGrid", () => ({ PodcastsGrid: () => <div data-testid="podcasts-ready" /> }));
vi.mock("@/features/home/components/AudiobooksGrid", () => ({ AudiobooksGrid: () => <div data-testid="audiobooks-ready" /> }));
vi.mock("@/features/home/components/LibraryRadioStations", () => ({
    LibraryRadioStations: () => <div data-testid="radio-ready" />,
}));
vi.mock("@/features/home/components/FeaturedPlaylistsGrid", () => ({
    FeaturedPlaylistsGrid: () => <div data-testid="playlists-ready" />,
    FeaturedPlaylistsSkeleton: () => <div data-testid="row-skeleton" />,
}));

import HomePage from "./page";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ready = {
    recentlyListened: false, recentlyAdded: false, recommended: false,
    mixes: false, popularArtists: false, recentPodcasts: false, recentAudiobooks: false,
};
const home = (override: Record<string, unknown> = {}) => ({
    recentlyListened: [], recentlyAdded: [], recommended: [], mixes: [],
    popularArtists: [], recentPodcasts: [], recentAudiobooks: [], featuredPlaylists: [],
    isLoading: false, sectionLoading: { ...ready }, isRefreshingMixes: false,
    isBrowseLoading: false, handleRefreshMixes: vi.fn(async () => {}), ...override,
});

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
});
async function render(data: ReturnType<typeof home>) {
    mocks.useHomeData.mockReturnValue(data);
    await act(async () => root.render(<HomePage />));
}

describe("progressive home shelves", () => {
    it("renders a ready row without waiting on another request", async () => {
        await render(home({
            recommended: [{ id: "ready" }],
            sectionLoading: { ...ready, recentlyListened: true },
        }));
        expect(host.querySelector('[data-tv-section="recommended"] [data-testid="artists-ready"]')).not.toBeNull();
        expect(host.querySelector('[data-tv-section="continue-listening"] [data-testid="row-skeleton"]')).not.toBeNull();
        expect(host.querySelector('[data-testid="auth-loader"]')).toBeNull();
    });

    it("uses a neutral hero while artists load, then hides empty rows", async () => {
        await render(home({ sectionLoading: { ...ready, recentlyAdded: true } }));
        expect(host.querySelector('[data-testid="hero"]')?.textContent).toBe("hero-loading");
        expect(host.querySelector('[data-tv-section="recently-added"] [data-testid="row-skeleton"]')).not.toBeNull();
        await render(home());
        expect(host.querySelector('[data-testid="hero"]')?.textContent).toBe("hero-ready");
        expect(host.querySelector('[data-tv-section="recently-added"]')).toBeNull();
    });

    it("keeps the authentication boundary even when cached rows are ready", async () => {
        await render(home({ isLoading: true, recommended: [{ id: "previous-user" }] }));
        expect(host.querySelector('[data-testid="auth-loader"]')).not.toBeNull();
        expect(host.querySelector('[data-tv-section="recommended"]')).toBeNull();
    });
});
