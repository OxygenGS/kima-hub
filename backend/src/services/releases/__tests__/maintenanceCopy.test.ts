import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RELEASES, type Release } from "../catalog";

const packageMetadata = JSON.parse(readFileSync(
    resolve(__dirname, "../../../../package.json"), "utf8",
)) as { version: string };
const recipe = JSON.parse(readFileSync(
    resolve(__dirname, "../../../../../.github/releases/v1.13.1.json"), "utf8",
)) as { release: Release };

describe("reviewed artist-loading maintenance release", () => {
    it("ships the exact reviewed bilingual-recipe English entry", () => {
        const release = RELEASES.find((entry) => entry.version === "1.13.1");
        expect(release).toEqual(recipe.release);
        expect(release?.items.map((item) => item.key)).toEqual([
            "fork.1131.local-first", "fork.1131.continuity",
        ]);
        expect(release?.items.every((item) => item.kind === "note")).toBe(true);
    });

    it("keeps the installed version at the head of the catalog and retains UI history", () => {
        expect(RELEASES[0].version).toBe(packageMetadata.version);
        expect(RELEASES.some((entry) => entry.version === "1.13.0")).toBe(true);
    });
});
