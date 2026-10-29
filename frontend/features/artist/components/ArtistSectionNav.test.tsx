import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/language-context", () => ({
    useLanguage: () => ({ t: (key: string) => key }),
}));

import { ArtistSectionNav } from "./ArtistSectionNav";

const defaults = {
    hasBio: false,
    hasPopularTracks: false,
    hasOwnedAlbums: false,
    hasAvailableAlbums: false,
    hasSimilarArtists: false,
};

function renderNav(props: Partial<typeof defaults> = {}) {
    const html = renderToStaticMarkup(<ArtistSectionNav {...defaults} {...props} />);
    const container = document.createElement("div");
    container.innerHTML = html;
    return container;
}

describe("artist section navigation", () => {
    it("does not add navigation to a page with zero or one populated section", () => {
        expect(renderNav().innerHTML).toBe("");
        expect(renderNav({ hasBio: true }).innerHTML).toBe("");
        expect(renderNav({ hasOwnedAlbums: true }).innerHTML).toBe("");
    });

    it("shows only matching links in the order their sections appear", () => {
        const nav = renderNav({
            hasBio: true,
            hasOwnedAlbums: true,
            hasAvailableAlbums: true,
            hasSimilarArtists: true,
        });
        expect([...nav.querySelectorAll("a")].map((link) => link.getAttribute("href")))
            .toEqual(["#artist-about", "#artist-discography", "#artist-available", "#artist-similar"]);
        expect(nav.textContent).not.toContain("Popular");
    });

    it("exposes a keyboard-reachable, labelled TV-friendly set of links", () => {
        const nav = renderNav({ hasPopularTracks: true, hasOwnedAlbums: true });
        const navigation = nav.querySelector("nav");
        const links = [...nav.querySelectorAll("a")];
        expect(navigation?.getAttribute("aria-label")).toBe("Jump to section");
        expect(navigation?.getAttribute("data-tv-section")).toBe("artist-section-navigation");
        expect(links.map((link) => link.getAttribute("data-tv-card-index"))).toEqual(["0", "1"]);
        expect(links.every((link) => !link.hasAttribute("tabindex"))).toBe(true);
        expect(links.map((link) => link.textContent)).toEqual(["Popular", "Discography"]);
    });
});
