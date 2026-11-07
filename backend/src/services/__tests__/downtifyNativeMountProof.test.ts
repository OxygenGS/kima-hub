import { promises as fs } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import {
    initializeNativeMusicVolume, verifyNativeMusicVolume,
} from "../downtifyNativeMountProof";

let scratch: string;
let music: string;
const marker = () => path.join(music, ".kima-native-music-volume");
beforeEach(async () => {
    scratch = await fs.mkdtemp(path.join(tmpdir(), "kima-native-volume-"));
    music = path.join(scratch, "music");
    await fs.mkdir(music, { mode: 0o700 });
});
afterEach(async () => {
    await fs.rm(scratch, { recursive: true, force: true });
});

describe("Persistent on-volume identity guard (temporary test mount only)", () => {
    it("initializes once and checks the same marker after a simulated process restart", async () => {
        const token = await initializeNativeMusicVolume(music);
        expect(token).toMatch(/^[0-9a-f-]{36}$/);
        expect(await verifyNativeMusicVolume(music, token)).toBe(true);
        expect(await initializeNativeMusicVolume(music)).toBe(token);
        const stat = await fs.lstat(marker());
        expect(stat.isFile()).toBe(true);
        expect(stat.mode & 0o077).toBe(0);
        expect((await fs.readdir(music)).filter(name => name.startsWith(".kima-native")))
            .toEqual([".kima-native-music-volume"]);
    });

    it("refuses an empty local fallback directory after the expected disk disappears", async () => {
        const token = await initializeNativeMusicVolume(music);
        expect(token).not.toBeNull();
        const offline = path.join(scratch, "unmounted-music");
        await fs.rename(music, offline);
        await fs.mkdir(music, { mode: 0o700 });
        expect(await verifyNativeMusicVolume(music, token)).toBe(false);
        expect(await fs.readdir(music)).toEqual([]);
        await fs.rm(music, { recursive: true, force: true });
        await fs.rename(offline, music);
        expect(await verifyNativeMusicVolume(music, token)).toBe(true);
    });

    it("refuses to adopt the marker from a different external storage volume", async () => {
        const first = await initializeNativeMusicVolume(music);
        expect(first).not.toBeNull();
        const displaced = path.join(scratch, "old-volume");
        await fs.rename(music, displaced);
        await fs.mkdir(music, { mode: 0o700 });
        const replacement = await initializeNativeMusicVolume(music);
        expect(replacement).not.toBe(first);
        expect(await verifyNativeMusicVolume(music, first)).toBe(false);
        expect(await verifyNativeMusicVolume(music, replacement)).toBe(true);
    });

    it("rejects symlinked or broadly writable mount roots", async () => {
        const original = await initializeNativeMusicVolume(music);
        expect(original).not.toBeNull();
        await fs.chmod(music, 0o777);
        expect(await verifyNativeMusicVolume(music, original)).toBe(false);
        expect(await initializeNativeMusicVolume(music)).toBeNull();
        await fs.chmod(music, 0o700);
        const real = path.join(scratch, "true-volume");
        await fs.rename(music, real);
        await fs.symlink(real, music);
        expect(await verifyNativeMusicVolume(music, original)).toBe(false);
        expect(await initializeNativeMusicVolume(music)).toBeNull();
    });

    it("never follows a symlinked proof or accepts a world-readable marker", async () => {
        const token = await initializeNativeMusicVolume(music);
        expect(token).not.toBeNull();
        await fs.chmod(marker(), 0o644);
        expect(await verifyNativeMusicVolume(music, token)).toBe(false);
        await fs.unlink(marker());
        const outside = path.join(scratch, "pretend-proof");
        await fs.writeFile(outside, "kima-native-volume-v1:" + token + "\n", {
            mode: 0o600,
        });
        await fs.symlink(outside, marker());
        expect(await verifyNativeMusicVolume(music, token)).toBe(false);
        expect(await initializeNativeMusicVolume(music)).toBeNull();
        expect(await fs.readFile(outside, "utf8")).toContain(token);
    });

    it("never creates a marker until the parent music root is already present", async () => {
        await fs.rm(music, { recursive: true, force: true });
        expect(await initializeNativeMusicVolume(music)).toBeNull();
        expect(await verifyNativeMusicVolume(music, null)).toBe(false);
        await expect(fs.stat(music)).rejects.toMatchObject({ code: "ENOENT" });
    });
});
