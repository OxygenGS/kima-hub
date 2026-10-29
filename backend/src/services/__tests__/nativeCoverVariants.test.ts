import fs from "fs";
import os from "os";
import path from "path";
import sharp from "sharp";

jest.mock("../../config", () => ({
    config: { music: { transcodeCachePath: "/tmp/kima-native-variant-test/transcode" } },
    USER_AGENT: "Kima/test",
}));

import * as imageStorage from "../imageStorage";
import { getOrCreateNativeCoverVariant } from "../nativeCoverVariants";

describe("non-blocking native cover variants", () => {
    let root: string;
    let covers: string;
    let jpeg: Buffer;

    beforeAll(async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "kima-native-variants-"));
        covers = path.join(root, "covers");
        fs.mkdirSync(covers, { recursive: true });
        jpeg = await sharp({
            create: { width: 320, height: 200, channels: 3, background: { r: 32, g: 64, b: 96 } },
        }).jpeg().toBuffer();
    });

    afterAll(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    it("builds one complete JPEG for simultaneous requests for the same variant", async () => {
        const original = path.join(covers, "album-a.jpg");
        await fs.promises.writeFile(original, jpeg);
        const returned = await Promise.all(
            Array.from({ length: 10 }, () => getOrCreateNativeCoverVariant(original, 96)),
        );
        expect(new Set(returned).size).toBe(1);
        const target = returned[0];
        expect(target).toBe(path.join(covers, "album-a_w96.jpg"));
        expect((await fs.promises.lstat(target)).isFile()).toBe(true);
        const meta = await sharp(await fs.promises.readFile(target)).metadata();
        expect(meta.width).toBe(96);
        expect(meta.format).toBe("jpeg");
        expect((await fs.promises.readdir(covers)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    });

    it("never follows a resized-cache symlink or alters its destination", async () => {
        const original = path.join(covers, "album-b.jpg");
        await fs.promises.writeFile(original, jpeg);
        const outside = path.join(root, "private-fixture.txt");
        await fs.promises.writeFile(outside, "should remain private");
        const cached = path.join(covers, "album-b_w80.jpg");
        await fs.promises.symlink(outside, cached);
        expect(await getOrCreateNativeCoverVariant(original, 80)).toBe(cached);
        expect((await fs.promises.lstat(cached)).isSymbolicLink()).toBe(false);
        expect(await fs.promises.readFile(outside, "utf8")).toBe("should remain private");
        expect((await sharp(cached).metadata()).width).toBe(80);
    });

    it("bounds distinct cold resizes to three concurrent operations", async () => {
        let active = 0;
        let peak = 0;
        const spy = jest.spyOn(imageStorage, "resizeImageBuffer").mockImplementation(async (input) => {
            active++;
            peak = Math.max(peak, active);
            await new Promise<void>((resolve) => setTimeout(resolve, 20));
            active--;
            return input;
        });
        try {
            const originals = Array.from({ length: 8 }, (_, i) => path.join(covers, `limit-${i}.jpg`));
            await Promise.all(originals.map((original) => fs.promises.writeFile(original, jpeg)));
            const targets = await Promise.all(
                originals.map((original) => getOrCreateNativeCoverVariant(original, 48)),
            );
            expect(targets).toHaveLength(8);
            expect(peak).toBeLessThanOrEqual(3);
            expect(peak).toBeGreaterThan(1);
            expect(spy).toHaveBeenCalledTimes(8);
        } finally {
            spy.mockRestore();
        }
    });

    it("rejects invalid widths and never writes cache files for them", async () => {
        const original = path.join(covers, "invalid.jpg");
        await fs.promises.writeFile(original, jpeg);
        await expect(getOrCreateNativeCoverVariant(original, 0)).rejects.toThrow(RangeError);
        await expect(getOrCreateNativeCoverVariant(original, 4096)).rejects.toThrow(RangeError);
        expect((await fs.promises.readdir(covers)).filter((name) => name.startsWith("invalid_w"))).toEqual([]);
    });
});
