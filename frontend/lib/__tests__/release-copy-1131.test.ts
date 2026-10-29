import { describe, expect, it } from "vitest";
import { localizeRelease } from "../i18n/release-copy";

const release = {
    version: "1.13.1",
    title: "Kima Hub 1.13.1 \u2014 Faster Artist Pages",
    summary: "Open saved artist information and local albums without waiting for external metadata providers.",
    items: [
        { kind: "note", key: "fork.1131.local-first", title: "English title", summary: "English summary", body: "English body", links: [{ label: "Browse artists", href: "/collection?tab=artists" }] },
        { kind: "note", key: "fork.1131.continuity", title: "English title", summary: "English summary", body: "English body", links: [{ label: "Open collection", href: "/collection" }] },
    ],
};

describe("artist-loading release translations", () => {
    it("leaves the original English catalog untouched", () => {
        expect(localizeRelease(release, "en")).toEqual(release);
    });
    it("translates both informational items without changing keys or routes", () => {
        const localized = localizeRelease(release, "nl");
        expect(localized.title).toBe("Kima Hub 1.13.1 \u2014 Snellere artiestpagina's");
        expect(localized.summary).not.toBe(release.summary);
        for (const [index, item] of localized.items.entries()) {
            const original = release.items[index];
            expect(item.key).toBe(original.key);
            expect(item.kind).toBe("note");
            expect(item.title).not.toBe(original.title);
            expect(item.summary).not.toBe(original.summary);
            expect(item.body).not.toBe(original.body);
            expect(item.links?.map((link) => link.href)).toEqual(original.links.map((link) => link.href));
        }
        expect(localized.items[0].links?.[0].label).toBe("Blader door artiesten");
        expect(localized.items[1].links?.[0].label).toBe("Open bibliotheek");
        expect(release.items[0].title).toBe("English title");
    });
});
