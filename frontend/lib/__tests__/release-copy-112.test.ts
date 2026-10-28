import { describe, expect, it } from "vitest";
import { localizeRelease } from "../i18n/release-copy";

const turbo = {
    version: "1.12.0",
    title: "Kima Hub 1.12.0 — Project Turbo + UI 2.0",
    summary: "Faster artist and album browsing, less waiting, and smoother controls on desktop and mobile.",
    items: [
        {
            key: "fork.1120.turbo",
            title: "Project Turbo: faster music browsing",
            summary: "Reuse cached artist and album information instead of requesting it again.",
            body: "Artist pages load independent detail requests concurrently.",
            links: [{ label: "Browse your collection", href: "/collection" }],
        },
    ],
};

describe("v1.12 in-app release copy", () => {
    it("localizes the new release in Dutch without changing stable keys or routes", () => {
        const localized = localizeRelease(turbo, "nl");
        expect(localized.summary).toMatch(/Sneller door artiesten/);
        expect(localized.items[0].title).toContain("sneller");
        expect(localized.items[0].key).toBe(turbo.items[0].key);
        expect(localized.items[0].links?.[0].href).toBe("/collection");
        expect(localized.items[0].links?.[0].label).toBe("Open je bibliotheek");
    });

    it("keeps English unchanged", () => {
        expect(localizeRelease(turbo, "en")).toEqual(turbo);
    });

    it("translates the 1.12.1 release history correction", () => {
        const patch = localizeRelease({
            version: "1.12.1",
            title: "Kima Hub 1.12.1 — Release Notes Update",
            summary: "The in-app release history now includes Project Turbo + UI 2.0 and the latest fork improvements.",
            items: [{
                key: "fork.1121.release-history",
                title: "Release history, brought up to date",
                summary: "The What's New window now includes the missing 1.12.0 release notes.",
                body: "This patch adds the notes.",
            }],
        }, "nl");
        expect(patch.title).toContain("bijgewerkt");
        expect(patch.items[0].summary).toContain("ontbrekende");
    });
});
