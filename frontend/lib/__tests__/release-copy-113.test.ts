import { describe, expect, it } from "vitest";
import { localizeRelease } from "../i18n/release-copy";

// Keep frontend tests self-contained: the Docker frontend context need not
// include repository automation recipes or backend source files.
const release = {
    version: "1.13.0",
    title: "Kima Hub 1.13.0 — A New Look for Your Music",
    summary: "A redesigned home, music pages, players and queue, with the same music library and familiar controls.",
    items: ["home", "details", "players", "queue", "continuity"].map((part) => ({
        kind: "note", key: `fork.1130.${part}`, title: "English item title",
        summary: "English item summary", body: "English item body",
        links: part === "queue" ? [{ label: "Open queue", href: "/queue" }] : undefined,
    })),
};

describe("v1.13 release translations are complete before publication", () => {
    it("preserves the original English release", () => {
        expect(localizeRelease(release, "en")).toEqual(release);
    });
    it("translates every stable item key without altering behavior or destinations", () => {
        const translated = localizeRelease(release, "nl");
        expect(translated.title).toBe("Kima Hub 1.13.0 — Een nieuwe uitstraling voor je muziek");
        expect(translated.summary).not.toBe(release.summary);
        for (const [index, item] of translated.items.entries()) {
            const original = release.items[index];
            expect(item.key).toBe(original.key);
            expect(item.kind).toBe("note");
            expect(item.title).not.toBe(original.title);
            expect(item.summary).not.toBe(original.summary);
            expect(item.body).not.toBe(original.body);
            expect(item.links?.map((link) => link.href)).toEqual(original.links?.map((link) => link.href));
        }
        expect(translated.items[3].links?.[0].label).toBe("Open wachtrij");
    });
});
