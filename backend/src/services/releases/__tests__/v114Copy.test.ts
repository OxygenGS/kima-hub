import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RELEASES, type Release } from "../catalog";

const recipe = JSON.parse(readFileSync(
    resolve(__dirname, "../../../../../.github/releases/v1.14.0.json"), "utf8",
)) as { release: Release };

describe("reviewed v1.14.0 performance and music search release", () => {
    it("ships the exact reviewed English item content and keys", () => {
        // Retain the exact published release, even after newer versions are
        // inserted ahead of it. This test must not pin the catalog's head.
        const published = RELEASES.find((release) => release.version === "1.14.0");
        expect(published).toEqual(recipe.release);
        expect(published?.items.map((item) => item.key)).toEqual([
            "fork.1140.artwork", "fork.1140.search", "fork.1140.upgrade",
        ]);
        expect(published?.items.every((item) => item.kind === "note")).toBe(true);
    });

    it("retains v1.13.1 and v1.13.0 release history", () => {
        expect(RELEASES.some((release) => release.version === "1.13.1")).toBe(true);
        expect(RELEASES.some((release) => release.version === "1.13.0")).toBe(true);
    });
});
