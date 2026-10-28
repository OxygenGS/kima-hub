import { describe, expect, it } from "vitest";
import spec from "../../../.github/releases/v1.13.0.json";
import { RELEASES } from "../../../backend/src/services/releases/catalog";
import { localizeRelease } from "../i18n/release-copy";

// Test the generated app catalog, not only the editorial recipe.
describe("v1.13 release copy is complete before publication", () => {
    it("ships exactly the reviewed informational English entry", () => {
        const release = RELEASES.find((entry) => entry.version === "1.13.0");
        expect(release).toEqual(spec.release);
        expect(release?.items).toHaveLength(5);
        expect(release?.items.every((item) => item.kind === "note")).toBe(true);
    });

    it("translates every new item while preserving identifiers and destinations", () => {
        const release = RELEASES.find((entry) => entry.version === "1.13.0")!;
        const translated = localizeRelease(release, "nl");
        expect(translated.title).toBe("Kima Hub 1.13.0 — Een nieuwe uitstraling voor je muziek");
        expect(translated.summary).not.toBe(release.summary);
        for (const [index, item] of translated.items.entries()) {
            const original = release.items[index];
            expect(item.key).toBe(original.key);
            expect(item.kind).toBe(original.kind);
            expect(item.title).not.toBe(original.title);
            expect(item.summary).not.toBe(original.summary);
            expect(item.body).not.toBe(original.body);
            expect(item.links?.map((link) => link.href)).toEqual(original.links?.map((link) => link.href));
        }
        expect(localizeRelease(release, "en")).toEqual(release);
    });
});
