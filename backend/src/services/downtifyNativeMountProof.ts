/**
 * Persistent identity proof for Kima's configured music mount.
 *
 * A Docker bind target like /music can remain a writable *local fallback*
 * directory after the external disk disappears. Checking "directory exists"
 * and even its device number is insufficient across container restarts.
 *
 * On explicit first activation, the operator confirms the correct disk is
 * mounted and Kima creates ONE hidden 0600 UUID marker inside that disk.
 * Its UUID is saved in the owner-bound integration row in PostgreSQL.
 * Every future media write requires the same marker on the current root.
 *
 * A marker alone cannot attest that an operator chose the right disk on
 * first activation. An independent single-writer/mount check is still a
 * deployment prerequisite. This module never unmounts/renames media.
 */
import { randomUUID, timingSafeEqual } from "crypto";
import { constants, promises as fs } from "fs";
import * as path from "path";

const MARKER = ".kima-native-music-volume";
const PREFIX = "kima-native-volume-v1:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_MARKER_BYTES = 128;

type RootInfo = Awaited<ReturnType<typeof fs.lstat>>;

async function verifiedMusicRoot(musicRoot: string): Promise<RootInfo | null> {
    if (typeof musicRoot !== "string" || !path.isAbsolute(musicRoot) ||
        musicRoot === "/" || musicRoot.includes("\\") ||
        musicRoot.includes("\0") || path.resolve(musicRoot) !== musicRoot) return null;
    try {
        const stat = await fs.lstat(musicRoot);
        if (!stat.isDirectory() || stat.isSymbolicLink() ||
            (stat.mode & 0o022) !== 0 ||
            await fs.realpath(musicRoot) !== musicRoot) return null;
        return stat;
    } catch {
        return null;
    }
}
async function readVolumeProof(
    musicRoot: string, root: RootInfo,
): Promise<string | null> {
    let file: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
        file = await fs.open(
            path.join(musicRoot, MARKER),
            constants.O_RDONLY | constants.O_NOFOLLOW,
        );
        const before = await file.stat();
        if (!before.isFile() || before.nlink !== 1 ||
            before.dev !== root.dev || (before.mode & 0o077) !== 0 ||
            before.size < PREFIX.length + 36 ||
            before.size > MAX_MARKER_BYTES) return null;
        const text = (await file.readFile({ encoding: "utf8" })).trim();
        const after = await file.stat();
        if (after.dev !== before.dev || after.ino !== before.ino ||
            after.size !== before.size || after.mtimeMs !== before.mtimeMs ||
            after.ctimeMs !== before.ctimeMs) return null;
        if (!text.startsWith(PREFIX)) return null;
        const id = text.slice(PREFIX.length);
        return UUID.test(id) ? id : null;
    } catch {
        return null;
    } finally {
        if (file) await file.close().catch(() => undefined);
    }
}
async function syncMusicRoot(musicRoot: string) {
    const dir = await fs.open(
        musicRoot, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try { await dir.sync(); }
    finally { await dir.close(); }
}

/** Invoked only after first-time operator cutover confirmation. No audio I/O. */
export async function initializeNativeMusicVolume(
    musicRoot: string,
): Promise<string | null> {
    const root = await verifiedMusicRoot(musicRoot);
    if (!root) return null;

    const previous = await readVolumeProof(musicRoot, root);
    if (previous) {
        try { await syncMusicRoot(musicRoot); return previous; }
        catch { return null; }
    }
    const markerPath = path.join(musicRoot, MARKER);
    let file: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
        const token = randomUUID();
        file = await fs.open(
            markerPath,
            constants.O_WRONLY | constants.O_CREAT |
                constants.O_EXCL | constants.O_NOFOLLOW,
            0o600,
        );
        await file.writeFile(PREFIX + token + "\n", { encoding: "utf8" });
        await file.sync();
        await file.close();
        file = undefined;
        const afterRoot = await verifiedMusicRoot(musicRoot);
        if (!afterRoot || afterRoot.dev !== root.dev ||
            afterRoot.ino !== root.ino ||
            await readVolumeProof(musicRoot, afterRoot) !== token) return null;
        await syncMusicRoot(musicRoot);
        return token;
    } catch {
        // A file may already exist or an I/O error may have happened.
        // Never overwrite, unlink or replace a marker on an unknown mount.
        return null;
    } finally {
        if (file) await file.close().catch(() => undefined);
    }
}

/** Read-only guard before each import and again immediately before publish. */
export async function verifyNativeMusicVolume(
    musicRoot: string, expected: string | null | undefined,
): Promise<boolean> {
    if (!expected || !UUID.test(expected)) return false;
    const root = await verifiedMusicRoot(musicRoot);
    if (!root) return false;
    const found = await readVolumeProof(musicRoot, root);
    if (!found) return false;
    const a = Buffer.from(found, "ascii"), b = Buffer.from(expected, "ascii");
    return a.length === b.length && timingSafeEqual(a, b);
}
