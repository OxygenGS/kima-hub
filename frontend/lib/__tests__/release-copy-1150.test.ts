import { describe, expect, it } from "vitest";
import { localizeRelease } from "../i18n/release-copy";

const release = {
    version: "1.15.0",
    title: "Kima Hub 1.15.0 — Faster Artist Navigation & Clearer Browsing",
    summary: "Local-first artist navigation, more consistent search tabs and clearer music browsing without changing playback or native clients.",
    items: [
        { kind: "note", key: "fork.1150.loading", title: "Smoother page transitions", summary: "English loading summary", body: "English loading description", links: [{ label: "Browse your collection", href: "/collection" }] },
        { kind: "note", key: "fork.1150.search", title: "Search tabs that respect their source", summary: "English search summary", body: "English search description", links: [{ label: "Open search", href: "/search" }] },
        { kind: "note", key: "fork.1150.artist", title: "Artist pages show local details first", summary: "English artist summary", body: "English artist description", links: [{ label: "Browse artists", href: "/collection?tab=artists" }] },
        { kind: "note", key: "fork.1150.sections", title: "Jump straight to artist sections", summary: "English sections summary", body: "English sections description", links: [{ label: "View artist collection", href: "/collection?tab=artists" }] },
        { kind: "note", key: "fork.1150.upgrade", title: "Compatibility and safe updates", summary: "English upgrade summary", body: "English upgrade description", links: [{ label: "Open settings", href: "/settings" }] },
    ],
};

describe("v1.15.0 bilingual release notes", () => {
    it("preserves the English release identity, source and routes", () => {
        expect(localizeRelease(release, "en")).toEqual(release);
    });

    it("translates all five notes while preserving item identities and navigation", () => {
        const translated = localizeRelease(release, "nl");
        expect(translated.version).toBe("1.15.0");
        expect(translated.title).toBe("Kima Hub 1.15.0 — Sneller naar artiesten en duidelijker bladeren");
        expect(translated.summary).not.toBe(release.summary);
        expect(translated.items).toHaveLength(5);
        translated.items.forEach((item, index) => {
            const source = release.items[index];
            expect(item.kind).toBe(source.kind);
            expect(item.key).toBe(source.key);
            expect(item.title).not.toBe(source.title);
            expect(item.summary).not.toBe(source.summary);
            expect(item.body).not.toBe(source.body);
            expect(item.links?.map((link) => link.href))
                .toEqual(source.links.map((link) => link.href));
            expect(item.links?.[0].label).not.toBe(source.links[0].label);
        });
    });
});
