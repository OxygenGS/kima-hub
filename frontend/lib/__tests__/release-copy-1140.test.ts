import { describe, expect, it } from "vitest";
import { localizeRelease } from "../i18n/release-copy";

const release = {
    version: "1.14.0",
    title: "Kima Hub 1.14.0 — Smoother Artwork & Smarter Search",
    summary: "Less blocking image work and more forgiving local music search, with familiar playback and clients.",
    items: [
        { kind: "note", key: "fork.1140.artwork", title: "Artwork without blocking browsing", summary: "Artwork summary", body: "Artwork details", links: [{ label: "Browse albums", href: "/collection?tab=albums" }] },
        { kind: "note", key: "fork.1140.search", title: "More forgiving music search", summary: "Search summary", body: "Search details", links: [{ label: "Open music library", href: "/collection" }] },
        { kind: "note", key: "fork.1140.upgrade", title: "Safe, additive database upgrade", summary: "Upgrade summary", body: "Upgrade details", links: [{ label: "Open settings", href: "/settings" }] },
    ],
};

describe("v1.14.0 bilingual release notes", () => {
    it("preserves English source copy and release keys", () => {
        expect(localizeRelease(release, "en")).toEqual(release);
    });

    it("localizes the title, all three items and labels but never routes or kinds", () => {
        const translated = localizeRelease(release, "nl");
        expect(translated.title).toBe("Kima Hub 1.14.0 — Soepelere afbeeldingen en slimmer zoeken");
        expect(translated.summary).not.toBe(release.summary);
        expect(translated.items).toHaveLength(3);
        for (const [index, entry] of translated.items.entries()) {
            const original = release.items[index];
            expect(entry.kind).toBe("note");
            expect(entry.key).toBe(original.key);
            expect(entry.title).not.toBe(original.title);
            expect(entry.summary).not.toBe(original.summary);
            expect(entry.body).not.toBe(original.body);
            expect(entry.links?.map((link) => link.href)).toEqual(original.links.map((link) => link.href));
            expect(entry.links?.[0].label).not.toBe(original.links[0].label);
        }
    });
});
