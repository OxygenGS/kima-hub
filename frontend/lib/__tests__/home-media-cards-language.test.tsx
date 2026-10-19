/** Category and count labels translate, artist/music metadata and links do not. */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n/language-context";
import { MixesGrid } from "@/features/home/components/MixesGrid";
import { AudiobooksGrid } from "@/features/home/components/AudiobooksGrid";
import { PodcastsGrid } from "@/features/home/components/PodcastsGrid";
import { ArtistsGrid, PopularArtistsGrid } from "@/features/home/components/ArtistsGrid";

vi.mock("@/components/ui/HorizontalCarousel", () => ({
    HorizontalCarousel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CarouselItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/cards/MediaCard", () => ({
    MediaCard: ({ title, subtitle, href }: { title: string; subtitle: string; href: string }) =>
        <article data-href={href}><h3>{title}</h3><p>{subtitle}</p></article>,
}));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
async function render(node: React.ReactNode) {
    await act(async () => root.render(<LanguageProvider>{node}</LanguageProvider>));
}
async function changeLanguage(locale: "nl" | "en") {
    await act(async () => {
        localStorage.setItem("kima-hub-language", locale);
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

describe("remaining homepage media tile translations", () => {
    it("translates mix counts without rewriting original titles or mix IDs", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        await render(<MixesGrid mixes={[{
            id: "original-mix-id", name: "Original Playlist Title",
            description: "", coverUrls: [], trackCount: 1234,
        }]} />);
        expect(host.textContent).toContain("Original Playlist Title");
        expect(host.textContent).toContain("1.234 nummers");
        expect(host.querySelector("article")?.getAttribute("data-href")).toBe("/mix/original-mix-id");
        await changeLanguage("en");
        expect(host.textContent).toContain("1,234 tracks");
        expect(host.textContent).toContain("Original Playlist Title");
    });
    it("localizes audiobook and podcast fallback types while keeping real authors", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        await render(<>
            <AudiobooksGrid audiobooks={[
                { id: "book-1", title: "Original Book" },
                { id: "book-2", title: "Foreign Title", author: "Original Author" },
            ]} />
            <PodcastsGrid podcasts={[
                { id: "podcast-1", title: "Original Podcast" },
                { id: "podcast-2", title: "Foreign Podcast", author: "Original Host" },
            ]} />
        </>);
        const tiles = [...host.querySelectorAll("article")];
        expect(tiles[0].textContent).toContain("Luisterboek");
        expect(tiles[1].textContent).toContain("Original Author");
        expect(tiles[2].textContent).toContain("Podcast");
        expect(tiles[3].textContent).toContain("Original Host");
        await changeLanguage("en");
        expect(tiles[0].textContent).toContain("Audiobook");
        expect(tiles[1].textContent).toContain("Original Author");
        expect(tiles[0].getAttribute("data-href")).toBe("/audiobooks/book-1");
    });
    it("localizes artist and listener labels, not original external artist search terms", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        await render(<>
            <ArtistsGrid artists={[{ id: "internal-artist", name: "Real Artist" }]} />
            <PopularArtistsGrid artists={[
                { name: "External Artist", listeners: 1 },
                { name: "Another Artist", listeners: 1234 },
                { name: "Count Unavailable" },
            ]} />
        </>);
        const tiles = [...host.querySelectorAll("article")];
        expect(tiles[0].textContent).toContain("Artiest");
        expect(tiles[1].textContent).toContain("1 luisteraar");
        expect(tiles[2].textContent).toContain("1.234 luisteraars");
        expect(tiles[3].textContent).not.toContain("undefined");
        expect(tiles[1].getAttribute("data-href")).toBe("/search?q=External%20Artist");
        await changeLanguage("en");
        expect(tiles[0].textContent).toContain("Artist");
        expect(tiles[1].textContent).toContain("1 listener");
        expect(tiles[2].textContent).toContain("1,234 listeners");
    });
});
