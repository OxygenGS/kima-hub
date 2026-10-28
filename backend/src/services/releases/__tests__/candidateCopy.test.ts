import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RELEASES, type Release } from "../catalog";

// Runs on the checked-out CI repository, not in the frontend build context.
describe("reviewed v1.13 source release copy", () => {
    it("ships exactly the reviewed informational catalog entry", () => {
        const recipe = JSON.parse(readFileSync(
            resolve(__dirname, "../../../../../.github/releases/v1.13.0.json"), "utf8",
        )) as { release: Release };
        const release = RELEASES.find((entry) => entry.version === "1.13.0");
        expect(release).toEqual(recipe.release);
        expect(release?.items).toHaveLength(5);
        expect(release?.items.every((item) => item.kind === "note")).toBe(true);
    });
});
