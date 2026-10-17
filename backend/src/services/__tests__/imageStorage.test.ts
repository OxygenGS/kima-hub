import fs from "fs";
import path from "path";

jest.mock("../../config", () => ({
    config: {
        music: {
            transcodeCachePath: `/tmp/kima-test-cache-${process.pid}/transcode`,
        },
    },
    USER_AGENT: "Kima/test",
}));

import { nativeFileExists, getCanonicalCoverFilePath, getLocalImagePath } from "../imageStorage";

describe("nativeFileExists", () => {
    const cacheRoot = `/tmp/kima-test-cache-${process.pid}`;
    const coversBase = path.join(cacheRoot, "covers");

    beforeAll(() => {
        fs.mkdirSync(path.join(coversBase, "artists"), { recursive: true });
        fs.mkdirSync(path.join(coversBase, "albums"), { recursive: true });
    });

    afterAll(() => {
        fs.rmSync(cacheRoot, { recursive: true, force: true });
    });

    it("returns true for existing native file", () => {
        const filePath = path.join(coversBase, "artists", "test123.jpg");
        fs.writeFileSync(filePath, "fake image data here!");
        expect(nativeFileExists("native:artists/test123.jpg")).toBe(true);
    });

    it("returns false for missing native file", () => {
        expect(nativeFileExists("native:artists/nonexistent.jpg")).toBe(false);
    });

    it("returns false for non-native paths", () => {
        expect(nativeFileExists("http://example.com/image.jpg")).toBe(false);
    });

    it("returns false for null/empty", () => {
        expect(nativeFileExists(null)).toBe(false);
        expect(nativeFileExists("")).toBe(false);
    });

    it("returns false for path traversal attempts", () => {
        expect(nativeFileExists("native:../../etc/passwd")).toBe(false);
    });

    it("refuses a native cover whose symlink resolves outside the covers root", () => {
        const outside = path.join(cacheRoot, "private-file.jpg");
        const link = path.join(coversBase, "albums", "external.jpg");
        fs.writeFileSync(outside, "private test fixture");
        fs.symlinkSync(outside, link);
        expect(nativeFileExists("native:albums/external.jpg")).toBe(false);
        expect(getLocalImagePath("native:albums/external.jpg")).toBeNull();
        expect(getCanonicalCoverFilePath(link)).toBeNull();
    });

    it("rejects a resized-cache symlink escaping the root", () => {
        const outside = path.join(cacheRoot, "other-image.jpg");
        const resized = path.join(coversBase, "albums", "safe_w500.jpg");
        fs.writeFileSync(outside, "not a shared cover");
        fs.symlinkSync(outside, resized);
        expect(getCanonicalCoverFilePath(resized)).toBeNull();
    });

    it("allows a regular existing cover and its resized variant inside covers", () => {
        const original = path.join(coversBase, "albums", "legitimate.jpg");
        const resized = path.join(coversBase, "albums", "legitimate_w500.jpg");
        fs.writeFileSync(original, "authorized cover");
        fs.writeFileSync(resized, "authorized resized cover");
        expect(getLocalImagePath("native:albums/legitimate.jpg")).toBe(fs.realpathSync(original));
        expect(getCanonicalCoverFilePath(resized)).toBe(fs.realpathSync(resized));
    });

    it("refuses a directory masquerading as a native cover", () => {
        expect(getLocalImagePath("native:albums")).toBeNull();
    });
});
