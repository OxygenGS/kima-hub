/** Translate only presentation labels; keep original external playlist and author data. */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n/language-context";
import { HomeHero } from "@/features/home/components/HomeHero";
import { FeaturedPlaylistsGrid } from "@/features/home/components/FeaturedPlaylistsGrid";
import { ContinueListening } from "@/features/home/components/ContinueListening";

vi.mock("@/components/ui/HorizontalCarousel", () => ({
    HorizontalCarousel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CarouselItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/cards/MediaCard", () => ({
    MediaCard: ({ title, subtitle, href }: { title: string; subtitle: string; href: string }) =>
        <article data-href={href}><h3>{title}</h3><p>{subtitle}</p></article>,
}));
vi.mock("@/components/layout/PageHeader", () => ({
    PageHeader: ({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) =>
        <header><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></header>,
}));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
async function render(node: React.ReactNode) {
    await act(async () => root.render(<LanguageProvider>{node}</LanguageProvider>));
}
async function changeLanguage(next: "en" | "nl") {
    await act(async () => {
        localStorage.setItem("kima-hub-language", next);
        window.dispatchEvent(new Event("kima-hub-language-change"));
    });
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

describe("home-page presentation-only localization", () => {
    it("translates the welcome header and keeps the same home page", async () => {
        const hours = vi.spyOn(Date.prototype, "getHours").mockReturnValue(9);
        try {
            localStorage.setItem("kima-hub-language", "nl");
            await render(<HomeHero />);
            expect(host.textContent).toContain("Goedemorgen");
            expect(host.textContent).toContain("Je bibliotheek in één oogopslag");
            await changeLanguage("en");
            expect(host.textContent).toContain("Good morning");
            expect(host.textContent).toContain("Your library at a glance");
        } finally { hours.mockRestore(); }
    });

    it("localizes counts without modifying playlist titles, IDs or links", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        const playlist = {
            id: "unchanged-playlist-id", source: "deezer", type: "playlist",
            title: "Original Foreign Playlist Title", description: null,
            creator: "Original Creator", imageUrl: null, trackCount: 1234,
            url: "https://example.invalid/playlist",
        };
        await render(<FeaturedPlaylistsGrid playlists={[playlist]} />);
        expect(host.textContent).toContain("Original Foreign Playlist Title");
        expect(host.textContent).toContain("1.234 nummers");
        expect(host.querySelector("article")?.getAttribute("data-href")).toBe("/browse/playlists/unchanged-playlist-id");
        await changeLanguage("en");
        expect(host.textContent).toContain("1,234 tracks");
        expect(host.textContent).toContain("Original Foreign Playlist Title");
    });

    it("translates only media category fallback, never original author or artist names", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        await render(<ContinueListening items={[
            { id: "artist-1", name: "Original Artist", type: "artist" },
            { id: "podcast-2", name: "Original Podcast", type: "podcast", author: "Real Author" },
            { id: "podcast-3", name: "Foreign Podcast", type: "podcast" },
        ]} />);
        const cards = [...host.querySelectorAll("article")];
        expect(cards[0].textContent).toContain("Artiest");
        expect(cards[1].textContent).toContain("Real Author");
        expect(cards[2].textContent).toContain("Podcast");
        await changeLanguage("en");
        expect(cards[0].textContent).toContain("Artist");
        expect(cards[1].textContent).toContain("Real Author");
        expect(cards[2].getAttribute("data-href")).toBe("/podcasts/podcast-3");
    });
});
