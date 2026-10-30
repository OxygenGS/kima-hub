/**
 * These tests run real decoding, JPEG conversion and symlink defense with
 * synthetic artwork. No provider calls or files outside a test temp root.
 */
jest.mock("../../utils/logger", () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";
import { recoverLocalArtistPortrait } from "../artistPortraitExtractor";

let root: string;
let music: string;
let artistDir: string;
let albumDir: string;
let track: string;
let covers: string;

async function syntheticImage(base: number): Promise<Buffer> {
    const pixels = Buffer.alloc(120 * 120 * 3);
    // Pseudorandom pixels make a PNG safely larger than the 1 KB minimum.
    let state = base + 1;
    for (let i = 0; i < pixels.length; i++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        pixels[i] = (state >>> 16) & 255;
    }
    return sharp(pixels, { raw: { width: 120, height: 120, channels: 3 } }).png().toBuffer();
}

async function recover(id = "artist-1") {
    return recoverLocalArtistPortrait(track, "The Artist", id, music, covers);
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "kima-artist-image-"));
    music = path.join(root, "music");
    artistDir = path.join(music, "The Artist");
    albumDir = path.join(artistDir, "Album");
    covers = path.join(root, "covers");
    fs.mkdirSync(albumDir, { recursive: true });
    fs.mkdirSync(covers);
    track = path.join(albumDir, "01.flac");
    fs.writeFileSync(track, "synthetic audio bytes");
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("local artist portrait recovery", () => {
    it("uses artist.png from the parent artist folder and caches real JPEG bytes", async () => {
        fs.writeFileSync(path.join(artistDir, "ARTIST.PNG"), await syntheticImage(31));
        const result = await recover();
        expect(result).toBe("native:artists/artist-1-recovered.jpg");
        const output = path.join(covers, "artists", "artist-1-recovered.jpg");
        expect((await sharp(output).metadata()).format).toBe("jpeg");
        expect(fs.readFileSync(output).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    });

    it("never uses an album's folder.jpg as an artist image", async () => {
        fs.writeFileSync(path.join(albumDir, "folder.jpg"), await syntheticImage(77));
        expect(await recover()).toBeNull();
    });

    it("accepts folder.png only in a directory named after the artist", async () => {
        fs.writeFileSync(path.join(artistDir, "FOLDER.PNG"), await syntheticImage(52));
        expect(await recover()).toBe("native:artists/artist-1-recovered.jpg");
    });

    it("uses explicit artist.png rather than album art when both exist", async () => {
        fs.writeFileSync(path.join(albumDir, "folder.jpg"), await syntheticImage(77));
        fs.writeFileSync(path.join(artistDir, "artist.png"), await syntheticImage(52));
        expect(await recover()).toBe("native:artists/artist-1-recovered.jpg");
    });

    it("rejects image symlinks and paths physically outside the music root", async () => {
        const outside = path.join(root, "secret.png");
        fs.writeFileSync(outside, await syntheticImage(62));
        fs.symlinkSync(outside, path.join(artistDir, "artist.png"));
        expect(await recover()).toBeNull();
        const rogueTrack = path.join(root, "outside.flac");
        fs.writeFileSync(rogueTrack, "synthetic audio bytes");
        expect(await recoverLocalArtistPortrait(rogueTrack, "The Artist", "artist-1", music, covers)).toBeNull();
    });

    it("rejects invalid artist ids and corrupt image bytes", async () => {
        fs.writeFileSync(path.join(artistDir, "artist.jpg"), Buffer.alloc(1500, 3));
        expect(await recover("../escape")).toBeNull();
        expect(await recover()).toBeNull();
        expect(fs.existsSync(path.join(covers, "artists", "artist-1-recovered.jpg"))).toBe(false);
    });

    it("reuses a cached recovery image without overwriting it", async () => {
        fs.writeFileSync(path.join(artistDir, "artist.png"), await syntheticImage(20));
        expect(await recover()).not.toBeNull();
        const output = path.join(covers, "artists", "artist-1-recovered.jpg");
        const before = fs.readFileSync(output);
        fs.writeFileSync(path.join(artistDir, "artist.png"), await syntheticImage(70));
        expect(await recover()).not.toBeNull();
        expect(fs.readFileSync(output)).toEqual(before);
    });
});
