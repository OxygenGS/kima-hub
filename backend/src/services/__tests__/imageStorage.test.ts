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

import { nativeFileExists, getCanonicalCoverFilePath, getLocalImagePath, getLocalImagePathAsync, findLocalArtistImage } from "../imageStorage";

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
    it("resolves a regular native image asynchronously to its canonical path", async () => {
        const file = path.join(coversBase, "artists", "async.jpg");
        fs.writeFileSync(file, "synthetic cover");
        expect(await getLocalImagePathAsync("native:artists/async.jpg")).toBe(
            fs.realpathSync(file),
        );
    });

    it("rejects missing, traversal, directory, and escaping symlinks asynchronously", async () => {
        const outside = path.join(cacheRoot, "private-async.jpg");
        const symlink = path.join(coversBase, "artists", "outside-async.jpg");
        fs.writeFileSync(outside, "must not serve");
        fs.symlinkSync(outside, symlink);
        await expect(getLocalImagePathAsync("native:artists/outside-async.jpg")).resolves.toBeNull();
        await expect(getLocalImagePathAsync("native:../private-async.jpg")).resolves.toBeNull();
        await expect(getLocalImagePathAsync("native:artists")).resolves.toBeNull();
        await expect(getLocalImagePathAsync("native:artists/absent.jpg")).resolves.toBeNull();
        await expect(getLocalImagePathAsync("https://example.invalid/image")).resolves.toBeNull();
    });

});

describe("local artist portrait recovery", () => {
    const root = `/tmp/kima-test-artist-portraits-${process.pid}`;
    const artistDir = path.join(root, "music", "Artist");
    const albumDir = path.join(artistDir, "Album");
    const cacheRoot = `/tmp/kima-test-cache-${process.pid}`;
    const coversDir = path.join(cacheRoot, "covers", "artists");

    beforeEach(() => {
        fs.mkdirSync(albumDir, { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    it("does not use an album folder.jpg as the artist portrait in recovery mode", async () => {
        fs.writeFileSync(path.join(albumDir, "folder.jpg"), Buffer.alloc(1300, 12));
        expect(await findLocalArtistImage(
            path.join(root, "music"), "Artist/Album/01.flac", "artist-id",
            { artistOnly: true, cacheId: "recovery-artist-id" },
        )).toBeNull();
        expect(fs.existsSync(path.join(coversDir, "recovery-artist-id.jpg"))).toBe(false);
    });

    it("uses an explicit artist.png in the parent folder and a unique cache name", async () => {
        fs.writeFileSync(path.join(albumDir, "folder.jpg"), Buffer.alloc(1300, 12));
        fs.writeFileSync(path.join(artistDir, "artist.png"), Buffer.alloc(1400, 34));
        expect(await findLocalArtistImage(
            path.join(root, "music"), "Artist/Album/01.flac", "artist-id",
            { artistOnly: true, cacheId: "recovery-artist-id" },
        )).toBe("native:artists/recovery-artist-id.png");
        expect(fs.existsSync(path.join(coversDir, "recovery-artist-id.png"))).toBe(true);
        expect(fs.existsSync(path.join(coversDir, "artist-id.png"))).toBe(false);
    });

    it("rejects a directory symlink that points outside the music library", async () => {
        const outside = path.join(root, "outside");
        fs.mkdirSync(outside, { recursive: true });
        fs.writeFileSync(path.join(outside, "artist.jpg"), Buffer.alloc(1400, 2));
        fs.symlinkSync(outside, path.join(root, "music", "Linked"));
        expect(await findLocalArtistImage(
            path.join(root, "music"), "Linked/Album/01.flac", "artist-id",
            { artistOnly: true, cacheId: "recovery-linked" },
        )).toBeNull();
    });
});
