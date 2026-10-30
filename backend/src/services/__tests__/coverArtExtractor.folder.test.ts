/**
 * Local cover recovery is deliberately local-only: no remote provider calls.
 * Synthetic images exercise real decoding, JPEG normalization and symlink guards.
 */
jest.mock("music-metadata", () => ({ parseFile: jest.fn() }), { virtual: true });
jest.mock("../../utils/logger", () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import { parseFile } from "music-metadata";
import { CoverArtExtractor } from "../coverArtExtractor";

let root: string;
let albumDir: string;
let cacheDir: string;
let track: string;
let extractor: CoverArtExtractor;

async function sampleImage(format: "jpeg" | "png", base: number): Promise<Buffer> {
    const width = 100, height = 100;
    const pixels = Buffer.alloc(width * height * 3);
    for (let i = 0; i < pixels.length; i += 3) {
        pixels[i] = (base + i / 3 * 13) % 256;
        pixels[i + 1] = (base + i / 3 * 7) % 256;
        pixels[i + 2] = (base + i / 3 * 19) % 256;
    }
    const image = sharp(pixels, { raw: { width, height, channels: 3 } });
    return format === "png" ? image.png().toBuffer() : image.jpeg().toBuffer();
}

beforeEach(() => {
    jest.clearAllMocks();
    root = fs.mkdtempSync(path.join(os.tmpdir(), "kima-local-cover-"));
    albumDir = path.join(root, "music", "Artist", "Album");
    cacheDir = path.join(root, "cache");
    fs.mkdirSync(albumDir, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
    track = path.join(albumDir, "01.flac");
    fs.writeFileSync(track, "synthetic audio");
    extractor = new CoverArtExtractor(cacheDir);
    (parseFile as jest.Mock).mockResolvedValue({ common: { picture: [] } });
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

describe("cover extraction from nearby album folders", () => {
    it("recovers cover.jpg when the file contains no embedded art", async () => {
        fs.writeFileSync(path.join(albumDir, "cover.jpg"), await sampleImage("jpeg", 19));
        expect(await extractor.extractCoverArt(track, "alb-1")).toBe("alb-1.jpg");

        const output = fs.readFileSync(path.join(cacheDir, "alb-1.jpg"));
        expect(output.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
        const metadata = await sharp(output).metadata();
        expect(metadata.format).toBe("jpeg");
    });

    it("finds case-insensitive folder.png and converts to an actual JPEG", async () => {
        fs.writeFileSync(path.join(albumDir, "FOLDER.PNG"), await sampleImage("png", 56));
        expect(await extractor.extractCoverArt(track, "alb-png")).toBe("alb-png.jpg");
        const metadata = await sharp(path.join(cacheDir, "alb-png.jpg")).metadata();
        expect(metadata.format).toBe("jpeg");
        expect(metadata.width).toBe(100);
    });

    it("prefers embedded cover bytes over any sidecar image", async () => {
        const embedded = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x45]);
        (parseFile as jest.Mock).mockResolvedValue({
            common: { picture: [{ data: embedded, format: "image/jpeg" }] },
        });
        fs.writeFileSync(path.join(albumDir, "cover.jpg"), await sampleImage("jpeg", 19));
        expect(await extractor.extractCoverArt(track, "alb-embedded")).toBe("alb-embedded.jpg");
        expect(fs.readFileSync(path.join(cacheDir, "alb-embedded.jpg"))).toEqual(embedded);
    });

    it("tries the next named cover if the first is corrupt", async () => {
        fs.writeFileSync(path.join(albumDir, "cover.jpg"), Buffer.alloc(1200, 3));
        fs.writeFileSync(path.join(albumDir, "front.webp"), await sampleImage("png", 40));
        expect(await extractor.extractCoverArt(track, "alb-fallback")).toBe("alb-fallback.jpg");
        expect((await sharp(path.join(cacheDir, "alb-fallback.jpg")).metadata()).format).toBe("jpeg");
    });

    it("can find folder art when audio metadata parsing fails", async () => {
        (parseFile as jest.Mock).mockRejectedValue(new Error("Unsupported audio format"));
        fs.writeFileSync(path.join(albumDir, "album.png"), await sampleImage("png", 110));
        expect(await extractor.extractCoverArt(track, "alb-unreadable")).toBe("alb-unreadable.jpg");
    });

    it("never reads a symlink to an unrelated image", async () => {
        const outside = path.join(root, "outside.jpg");
        fs.writeFileSync(outside, await sampleImage("jpeg", 150));
        fs.symlinkSync(outside, path.join(albumDir, "cover.jpg"));
        expect(await extractor.extractCoverArt(track, "alb-symlink")).toBeNull();
        expect(fs.existsSync(path.join(cacheDir, "alb-symlink.jpg"))).toBe(false);
    });

    it("does not write outside the cache for unexpected album ids", async () => {
        fs.writeFileSync(path.join(albumDir, "cover.jpg"), await sampleImage("jpeg", 19));
        expect(await extractor.extractCoverArt(track, "../escape")).toBeNull();
        expect(parseFile).not.toHaveBeenCalled();
    });

    it("reuses a cached cover without re-reading the music file", async () => {
        const cached = path.join(cacheDir, "alb-cached.jpg");
        fs.writeFileSync(cached, await sampleImage("jpeg", 8));
        expect(await extractor.extractCoverArt(track, "alb-cached")).toBe("alb-cached.jpg");
        expect(parseFile).not.toHaveBeenCalled();
    });

    it("returns null without a valid embedded or sidecar image", async () => {
        expect(await extractor.extractCoverArt(track, "alb-missing")).toBeNull();
        expect(fs.existsSync(path.join(cacheDir, "alb-missing.jpg"))).toBe(false);
    });
});
