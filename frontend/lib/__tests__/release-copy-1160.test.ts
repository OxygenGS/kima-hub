import { describe, expect, it } from "vitest";
import { localizeRelease } from "../i18n/release-copy";

const release = {
    version: "1.16.0",
    title: "Kima Hub 1.16.0 — Artwork Recovery",
    summary: "Find more local covers and repair missing album and artist artwork from Settings without rescanning your music library.",
    items: [
        {
            kind: "note", key: "fork.1160.folder",
            title: "More album artwork from your music folders",
            summary: "Recognize embedded and nearby cover, folder, front and album pictures when scanning tracks.",
            body: "Embedded and adjacent covers in the same folder",
            links: [{ label: "Browse albums", href: "/collection?tab=albums" }],
        },
        {
            kind: "note", key: "fork.1160.album",
            title: "Repair covers on already-indexed albums",
            summary: "Use Settings to repair missing covers in bounded rounds without a full music scan.",
            body: "Repair covers without rescanning unchanged music",
            links: [{ label: "Open artwork settings", href: "/settings" }],
        },
        {
            kind: "note", key: "fork.1160.artist",
            title: "Recover missing artist portraits",
            summary: "Restore local artist photos or ask trusted artwork providers, while preserving manual choices.",
            body: "Restore missing artist portraits",
            links: [
                { label: "Browse artists", href: "/collection?tab=artists" },
                { label: "Open artwork settings", href: "/settings" },
            ],
        },
        {
            kind: "note", key: "fork.1160.safety",
            title: "Artwork recovery without a database migration",
            summary: "Keep playback and connected clients unchanged; review backups and native-image security findings.",
            body: "Protect music, permissions and existing manual choices",
            links: [{ label: "Open settings", href: "/settings" }],
        },
    ],
};

describe("v1.16.0 Artwork Recovery bilingual release notes", () => {
    it("keeps the canonical English release unchanged", () => {
        expect(localizeRelease(release, "en")).toEqual(release);
    });

    it("localizes all four release items without altering identity or navigation", () => {
        const localized = localizeRelease(release, "nl");
        expect(localized.version).toBe("1.16.0");
        expect(localized.title).toBe("Kima Hub 1.16.0 — Herstel van afbeeldingen");
        expect(localized.summary).not.toBe(release.summary);
        expect(localized.items).toHaveLength(release.items.length);
        localized.items.forEach((item, index) => {
            const original = release.items[index];
            expect(item.kind).toBe("note");
            expect(item.key).toBe(original.key);
            expect(item.title).not.toBe(original.title);
            expect(item.summary).not.toBe(original.summary);
            expect(item.body).not.toBe(original.body);
            expect(item.links?.map(link => link.href))
                .toEqual(original.links.map(link => link.href));
            expect(item.links?.map(link => link.label))
                .not.toEqual(original.links.map(link => link.label));
        });
    });

    it("keeps upgrade guidance and manual-repair labels explicit", () => {
        const localized = localizeRelease(release, "nl");
        expect(localized.items.find(item => item.key === "fork.1160.safety")?.body)
            .toContain("databasemigratie");
        expect(localized.items.find(item => item.key === "fork.1160.album")?.body)
            .toContain("200 albums");
        expect(localized.items.find(item => item.key === "fork.1160.artist")?.body)
            .toContain("100 bestaande artiesten");
    });
});
