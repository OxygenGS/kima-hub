/**
 * Persistent mount identity for Kima's native Downtify importer.
 *
 * The marker is anchored to the existing music filesystem, not /data.
 * On common root-owned bind/NAS mounts the service cannot write /music,
 * and should NOT be granted access to the complete music collection.
 *
 * A new marker therefore lives exclusively inside the dedicated writable
 * /music/Singles/Downtify directory. Previously enrolled installations
 * with a valid root-level marker remain readable for compatibility.
 *
 * Directory ownership, device, traversal and symlink checks fail closed.
 * A marker still cannot prove the operator selected the right disk on the
 * first activation: the admin must independently verify the mount.
 */
import { randomUUID, timingSafeEqual } from "crypto";
import { constants, promises as fs } from "fs";
import * as path from "path";
import { trustedNativeMusicDirectory } from "./downtifyNativeDirectorySafety";

const MARKER = ".kima-native-music-volume";
const PREFIX = "kima-native-volume-v1:";
const IMPORT_DIR = ["Singles", "Downtify"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_MARKER_BYTES = 128;
type RootInfo = Awaited<ReturnType<typeof fs.lstat>>;

async function verifiedMusicRoot(musicRoot: string): Promise<RootInfo | null> {
    if (typeof musicRoot !== "string" || !path.isAbsolute(musicRoot) ||
        musicRoot === "/" || musicRoot.includes("\\") ||
        musicRoot.includes("\0") || path.resolve(musicRoot) !== musicRoot) return null;
    try {
        const stat = await fs.lstat(musicRoot);
        if (!trustedNativeMusicDirectory(stat) ||
            await fs.realpath(musicRoot) !== musicRoot) return null;
        return stat;
    } catch {
        return null;
    }
}

/** Only these two directories may be created, without recursion or takeover. */
async function verifiedImportDirectory(
    musicRoot: string, root: RootInfo, create: boolean,
): Promise<string | null> {
    let current = musicRoot;
    for (const segment of IMPORT_DIR) {
        current = path.join(current, segment);
        if (create) {
            try {
                await fs.mkdir(current, { mode: 0o755 });
            } catch (err: unknown) {
                if ((err as NodeJS.ErrnoException)?.code !== "EEXIST") return null;
            }
        }
        let stat: RootInfo;
        try {
            stat = await fs.lstat(current);
            if (!trustedNativeMusicDirectory(stat) || stat.dev !== root.dev ||
                await fs.realpath(current) !== current) return null;
        } catch {
            return null;
        }
    }
    return current;
}

async function readVolumeProof(
    markerPath: string, root: RootInfo,
): Promise<string | null> {
    let file: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
        file = await fs.open(markerPath, constants.O_RDONLY | constants.O_NOFOLLOW);
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

/** Distinguish a missing marker from an invalid, unreadable or linked one. */
async function markerIsAbsent(filename: string): Promise<boolean> {
    try {
        await fs.lstat(filename);
        return false;
    } catch (err: unknown) {
        return (err as NodeJS.ErrnoException)?.code === "ENOENT";
    }
}
async function syncDirectory(directory: string) {
    const dir = await fs.open(
        directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try { await dir.sync(); }
    finally { await dir.close(); }
}
function equalProof(found: string | null, expected: string): boolean {
    if (!found) return false;
    const a = Buffer.from(found, "ascii"), b = Buffer.from(expected, "ascii");
    return a.length === b.length && timingSafeEqual(a, b);
}

/** Only after explicit admin consent and independent mount verification. */
export async function initializeNativeMusicVolume(
    musicRoot: string,
): Promise<string | null> {
    const root = await verifiedMusicRoot(musicRoot);
    if (!root) return null;

    // Existing RC2 installations: never adopt a different mount/proof
    // location when the legacy root-level marker exists or is malformed.
    const legacyMarker = path.join(musicRoot, MARKER);
    const legacy = await readVolumeProof(legacyMarker, root);
    if (legacy) {
        try { await syncDirectory(musicRoot); return legacy; }
        catch { return null; }
    }
    if (!await markerIsAbsent(legacyMarker)) return null;

    const proofDir = await verifiedImportDirectory(musicRoot, root, true);
    if (!proofDir) return null;
    const markerPath = path.join(proofDir, MARKER);
    const previous = await readVolumeProof(markerPath, root);
    if (previous) {
        try { await syncDirectory(proofDir); return previous; }
        catch { return null; }
    }
    if (!await markerIsAbsent(markerPath)) return null;

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
        const afterDir = afterRoot
            ? await verifiedImportDirectory(musicRoot, afterRoot, false) : null;
        if (!afterRoot || afterRoot.dev !== root.dev ||
            afterRoot.ino !== root.ino || afterDir !== proofDir ||
            await readVolumeProof(markerPath, afterRoot) !== token) return null;
        await syncDirectory(proofDir);
        return token;
    } catch {
        // Never overwrite an existing marker or guess about partial writes.
        return null;
    } finally {
        if (file) await file.close().catch(() => undefined);
    }
}

/** Read-only proof before each import and again before publishing media. */
export async function verifyNativeMusicVolume(
    musicRoot: string, expected: string | null | undefined,
): Promise<boolean> {
    if (!expected || !UUID.test(expected)) return false;
    const root = await verifiedMusicRoot(musicRoot);
    if (!root) return false;

    const legacyMarker = path.join(musicRoot, MARKER);
    const legacy = await readVolumeProof(legacyMarker, root);
    if (legacy) return equalProof(legacy, expected);
    // An invalid existing legacy marker must not be bypassed with a new one.
    if (!await markerIsAbsent(legacyMarker)) return false;

    const proofDir = await verifiedImportDirectory(musicRoot, root, false);
    if (!proofDir) return false;
    const current = await readVolumeProof(path.join(proofDir, MARKER), root);
    return equalProof(current, expected);
}
