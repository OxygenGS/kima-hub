import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RELEASES, type Release } from "../catalog";

const packageMetadata = JSON.parse(readFileSync(
    resolve(__dirname, "../../../../package.json"), "utf8",
)) as { version: string };
const reviewed = JSON.parse(readFileSync(
    resolve(__dirname, "../../../../../.github/releases/v1.15.0.json"), "utf8",
)) as { release: Release };

describe("v1.15.0 bilingual release candidate", () => {
    it("ships the exact reviewed English notes as the current catalog entry", () => {
        expect(packageMetadata.version).toBe("1.15.0");
        expect(RELEASES[0]).toEqual(reviewed.release);
        expect(RELEASES[0].version).toBe(packageMetadata.version);
        expect(RELEASES[0].items.map((item) => item.key)).toEqual([
            "fork.1150.loading",
            "fork.1150.search",
            "fork.1150.artist",
            "fork.1150.sections",
            "fork.1150.upgrade",
        ]);
        expect(RELEASES[0].items.every((item) => item.kind === "note")).toBe(true);
        expect(RELEASES[0].items.every((item) =>
            item.links?.every((link) => link.href.startsWith("/"))
        )).toBe(true);
    });

    it("retains the released v1.14.0 and v1.13.1 history unchanged", () => {
        expect(RELEASES.some((release) => release.version === "1.14.0")).toBe(true);
        expect(RELEASES.some((release) => release.version === "1.13.1")).toBe(true);
    });
});
