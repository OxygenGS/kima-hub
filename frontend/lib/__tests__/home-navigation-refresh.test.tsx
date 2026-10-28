/* eslint-disable @next/next/no-img-element -- Plain image stub for deterministic DOM tests. */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { translate } from "@/lib/i18n/translations";
import { HomeHero } from "@/features/home/components/HomeHero";
import { DesktopNavigation, isNavigationActive } from "@/components/layout/DesktopNavigation";
import { getHomeCopy } from "@/features/home/homeCopy";

const state = vi.hoisted(() => ({ locale: "en" as "en" | "nl" }));
const coverUrl = vi.hoisted(() => vi.fn((cover: string, size: number) => `/art/${cover}?size=${size}`));
vi.mock("@/lib/api", () => ({ api: { getCoverArtUrl: coverUrl } }));
vi.mock("@/lib/i18n/language-context", () => ({
    useLanguage: () => ({ locale: state.locale, t: (key: string) => translate(state.locale, key) }),
}));
vi.mock("next/link", () => ({
    default: ({ children, href, prefetch, ...props }: React.ComponentProps<"a"> & { prefetch?: boolean }) => (
        <a {...props} href={href} data-prefetch={prefetch === false ? "off" : "on"}>{children}</a>
    ),
}));
vi.mock("@/components/ui/CachedImage", () => ({
    CachedImage: ({ src, alt, loading }: { src: string; alt: string; loading?: "lazy" | "eager" }) => (
        <img src={src} alt={alt} loading={loading} />
    ),
}));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
    state.locale = "en";
    coverUrl.mockClear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const artists = [
    { id: "artist-a", name: "Northbound", coverArt: "a" },
    { id: "artist-b", name: "Glass Garden", coverArt: "b" },
    { id: "artist-c", name: "Quiet Current", coverArt: "c" },
    { id: "artist-d", name: "Fourth artist", coverArt: "d" },
];

describe("home dashboard", () => {
    it("renders honest empty-state copy and working collection shortcuts", () => {
        act(() => root.render(<HomeHero />));
        expect(host.querySelectorAll("h1")).toHaveLength(1);
        expect(host.textContent).toContain("A home for your music.");
        expect(host.querySelectorAll('a[href^="/artist/"]')).toHaveLength(0);
        expect(coverUrl).not.toHaveBeenCalled();
        const hrefs = Array.from(host.querySelectorAll("a")).map((a) => a.getAttribute("href"));
        expect(hrefs).toEqual(["/collection", "/discover", "/collection?tab=albums", "/collection?tab=tracks", "/vibe", "/radio"]);
        expect(host.querySelectorAll('[data-prefetch="on"]')).toHaveLength(0);
    });

    it("reuses at most three distinct supplied artists without inventing totals or issuing data requests", () => {
        act(() => root.render(<HomeHero artists={[artists[0], artists[0], ...artists.slice(1)]} />));
        expect(host.querySelectorAll('a[href^="/artist/"]')).toHaveLength(3);
        expect(coverUrl).toHaveBeenCalledTimes(3);
        expect(coverUrl).toHaveBeenCalledWith("a", 300);
        expect(host.querySelectorAll('img[loading="eager"]')).toHaveLength(1);
        expect(host.querySelectorAll('img[alt=""]')).toHaveLength(3);
        expect(host.textContent).not.toContain("Fourth artist");
    });

    it("changes editorial copy with the language while preserving library metadata and routes", () => {
        act(() => root.render(<HomeHero artists={artists} />));
        expect(host.querySelector("h1")?.textContent).toBe(getHomeCopy("en").headline);
        state.locale = "nl";
        act(() => root.render(<HomeHero artists={artists} />));
        expect(host.querySelector("h1")?.textContent).toBe(getHomeCopy("nl").headline);
        expect(host.textContent).toContain("Open bibliotheek");
        expect(host.textContent).toContain("Northbound");
        expect(host.querySelector('a[href="/artist/artist-a"]')).not.toBeNull();
    });

    it("keeps a navigable fallback for artists without artwork", () => {
        act(() => root.render(<HomeHero artists={[{ id: "no-cover", name: "Unpictured" }]} />));
        expect(host.querySelectorAll("img")).toHaveLength(0);
        expect(host.querySelector('a[href="/artist/no-cover"]')?.textContent).toBe("Unpictured");
        expect(coverUrl).not.toHaveBeenCalled();
    });
});

describe("desktop navigation", () => {
    it("selects parent routes without prefix collisions", () => {
        expect(isNavigationActive("/", "/")).toBe(true);
        expect(isNavigationActive("/collection", "/")).toBe(false);
        expect(isNavigationActive("/collection?tab=albums", "/collection")).toBe(true);
        expect(isNavigationActive("/artist/someone", "/collection")).toBe(true);
        expect(isNavigationActive("/album/record", "/collection")).toBe(true);
        expect(isNavigationActive("/radio/station", "/radio")).toBe(true);
        expect(isNavigationActive("/radio-other", "/radio")).toBe(false);
        expect(isNavigationActive("/browse/playlists/one", "/browse/playlists")).toBe(true);
        expect(isNavigationActive("/browse-other", "/browse/playlists")).toBe(false);
    });

    it("respects optional media features and exposes exactly one current page", () => {
        act(() => root.render(<DesktopNavigation pathname="/album/record" audiobookshelfEnabled={false} />));
        expect(host.querySelector('a[href="/audiobooks"]')).toBeNull();
        expect(host.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
        expect(host.querySelector('[aria-current="page"]')?.getAttribute("href")).toBe("/collection");
        act(() => root.render(<DesktopNavigation pathname="/audiobooks/book" audiobookshelfEnabled />));
        expect(host.querySelector('[aria-current="page"]')?.getAttribute("href")).toBe("/audiobooks");
    });

    it("translates visible navigation text, not only accessibility attributes", () => {
        state.locale = "nl";
        act(() => root.render(<DesktopNavigation pathname="/" audiobookshelfEnabled={false} />));
        expect(host.textContent).toContain("Jouw muziek");
        expect(host.querySelector('a[href="/collection"]')?.textContent).toContain(translate("nl", "Collection"));
        expect(host.querySelector("nav")?.getAttribute("aria-label")).toBe(translate("nl", "Main navigation"));
    });
});
