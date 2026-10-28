import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RELEASES } from "../catalog";

describe("in-app release catalog matches the build", () => {
    const metadata = JSON.parse(
        readFileSync(resolve(__dirname, "../../../../package.json"), "utf8"),
    ) as { version: string };

    it("includes an entry for the exact package version", () => {
        const current = RELEASES.find((release) => release.version === metadata.version);
        expect(current).toBeDefined();
        expect(current?.items.length).toBeGreaterThan(0);
    });

    it("keeps versions and item keys unique", () => {
        expect(new Set(RELEASES.map((release) => release.version)).size).toBe(RELEASES.length);
        for (const release of RELEASES) {
            expect(release.title.trim()).not.toBe("");
            expect(release.summary.trim()).not.toBe("");
            expect(new Set(release.items.map((item) => item.key)).size).toBe(release.items.length);
        }
    });

    it("includes the published Turbo and UI 2.0 history", () => {
        const turbo = RELEASES.find((release) => release.version === "1.12.0");
        expect(turbo?.title).toContain("Project Turbo");
        expect(turbo?.items.some((item) => item.key === "fork.1120.ui")).toBe(true);
        expect(turbo?.items.every((item) => item.kind === "note")).toBe(true);
    });
});
