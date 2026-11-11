/**
 * Native Downtify importer — isolated, no-overwrite publication primitive.
 *
 * Only the internal owner-scoped import runner calls this after a verified
 * original stream and a durable claim. A mandatory complete-recording
 * verification callback runs before any file can appear in the library.
 * There is no HTTP entrypoint for file paths; auto-import is OFF by default.
 *
 * No source deletion, renaming of existing media, overwriting, automatic
 * retry or database mutation is possible here. A successfully published file
 * is NOT an indexed or playable Kima track until the scanner confirms it.
 */
import { createHash, randomUUID } from "crypto";
import { constants as constants, promises as fs } from "fs";
import * as path from "path";
import { trustedNativeMusicDirectory } from "./downtifyNativeDirectorySafety";

export type NativePublishState =
    | "published"
    | "already_present_same_bytes"
    | "destination_conflict"
    | "unsafe_destination"
    | "invalid_source"
    | "incomplete_source"
    | "validation_failed"
    | "unavailable"
    | "uncertain";

export interface NativePublishResult {
    state: NativePublishState;
    /** Never expose the internal hash or relative path via an HTTP response. */
    sha256: string | null;
    bytes: number;
    /** Not an import, scanner or playback receipt. */
    libraryImportVerified: false;
    filesPublished: boolean;
    /** An ambiguous post-link result must NEVER be blindly retried. */
    retryAllowed: false;
}

export interface NativePublishInput {
    /** Existing, trusted library root. Never user-supplied via HTTP. */
    musicRoot: string;
    /** Internal-only Singles/ path produced from reviewed metadata. */
    relativeTarget: string;
    /** Original bytes from the pinned authenticated remote source. */
    chunks: AsyncIterable<Buffer>;
    /** Exact expected byte count from authenticated source evidence. */
    expectedBytes: number;
    /** Only for Lidarr-managed staging. The private temporary file stays 0600
     * until fully verified; its published inode must be readable by Kima
     * after Lidarr copies it under a different user/group. */
    sharedReadableAfterVerification?: boolean;
    /** REQUIRED: independently check complete decode and recording identity
     * on the private temp file before it can enter the Kima library.
     * This is internal-only and must never expose the temp path to HTTP.
     */
    verifyTempFile: (
        absolutePath: string, expected: { bytes: number; sha256: string },
    ) => Promise<boolean>;
}

const MAX_BYTES = 256 * 1024 * 1024;
const MIN_BYTES = 64;
const ALLOWED_EXT = new Set([".flac", ".mp3", ".m4a", ".ogg", ".opus", ".wav"]);
const CONTROL = /[\u0000-\u001f\u007f]/;
const SEGMENT = /[<>:"\\|?*]/;

function outcome(
    state: NativePublishState,
    bytes = 0,
    sha256: string | null = null,
): NativePublishResult {
    return {
        state, sha256, bytes,
        libraryImportVerified: false,
        filesPublished: state === "published",
        retryAllowed: false,
    };
}

export function safeNativeImportTarget(input: unknown): string[] | null {
    if (typeof input !== "string" || input.length > 1024 ||
        path.isAbsolute(input) || input.includes("\\") || CONTROL.test(input)) {
        return null;
    }
    const parts = input.split("/");
    // Restrict the native single-track importer to the Kima Singles tree;
    // it can never write an arbitrary location such as /data or a .env.
    if (parts.length < 3 || parts.length > 8 || parts[0] !== "Singles" ||
        parts.some(part => part.length === 0 || part.length > 180 ||
            part === "." || part === ".." || SEGMENT.test(part) ||
            part.endsWith(".") || part.endsWith(" "))) {
        return null;
    }
    const ext = path.posix.extname(parts[parts.length - 1]).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) return null;
    return parts;
}

async function verifyExistingDirectories(root: string, parts: string[]): Promise<string | null> {
    if (!path.isAbsolute(root) || root === "/" || root.includes("\0") ||
        root.includes("\\") || path.resolve(root) !== root) return null;
    let current = root;
    try {
        for (const part of ["", ...parts]) {
            if (part) current = path.join(current, part);
            const stat = await fs.lstat(current);
            // No world-writable/hostile-group-writable ancestors, even if
            // their names or device numbers appear otherwise correct.
            if (!trustedNativeMusicDirectory(stat)) return null;
            if (await fs.realpath(current) !== current) return null;
        }
        return current;
    } catch {
        return null;
    }
}

async function syncDirectory(parent: string): Promise<void> {
    const dir = await fs.open(
        parent, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try { await dir.sync(); }
    finally { await dir.close(); }
}

type ExistingHash = "equal" | "different" | "unknown";

/**
 * Exact-byte comparison on an opened O_NOFOLLOW inode. Never assume that
 * identical filenames, file lengths or source titles mean duplicate media.
 */
async function compareExisting(
    target: string, expectedBytes: number, expectedSha: string,
): Promise<ExistingHash> {
    let f: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
        f = await fs.open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
        const initial = await f.stat();
        if (!initial.isFile() || initial.size !== expectedBytes) return "different";
        const digest = createHash("sha256");
        let offset = 0;
        while (offset < expectedBytes) {
            const buffer = Buffer.allocUnsafe(Math.min(128 * 1024, expectedBytes - offset));
            const { bytesRead } = await f.read(buffer, 0, buffer.byteLength, offset);
            if (bytesRead <= 0 || bytesRead > buffer.byteLength) return "unknown";
            digest.update(buffer.subarray(0, bytesRead));
            offset += bytesRead;
        }
        const final = await f.stat();
        if (final.dev !== initial.dev || final.ino !== initial.ino ||
            final.size !== initial.size || final.mtimeMs !== initial.mtimeMs ||
            final.ctimeMs !== initial.ctimeMs) return "unknown";
        return digest.digest("hex") === expectedSha ? "equal" : "different";
    } catch {
        return "unknown";
    } finally {
        if (f) await f.close().catch(() => undefined);
    }
}

/**
 * File copy into an existing directory in the trusted Singles music tree.
 *
 * The private temporary file is on the *destination* filesystem; fs.link()
 * publishes it atomically without replacing anything. fsync() on both the
 * file and parent directory establishes a durability checkpoint. If an
 * error happens after publication, the state is UNCERTAIN: a caller must
 * re-inspect before proceeding, never blindly retry or claim completion.
 *
 * No implicit mkdir: unsafe symlinks, unexpected mounts and storage
 * disconnections must be resolved by a separate operator-reviewed setup.
 */
export async function publishNativeAudio(input: NativePublishInput): Promise<NativePublishResult> {
    const parts = safeNativeImportTarget(input.relativeTarget);
    if (!parts) return outcome("unsafe_destination");
    if (!Number.isSafeInteger(input.expectedBytes) ||
        input.expectedBytes < MIN_BYTES || input.expectedBytes > MAX_BYTES) {
        return outcome("invalid_source");
    }
    const parent = await verifyExistingDirectories(
        input.musicRoot, parts.slice(0, -1),
    );
    if (!parent) return outcome("unsafe_destination");

    const target = path.join(parent, parts[parts.length - 1]);
    const pending = path.join(parent, ".kima-import-" + randomUUID() + ".part");
    let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
    let pendingCreated = false;
    let linked = false;
    let bytes = 0;
    let hash: string | null = null;
    let result: NativePublishResult = outcome("unavailable");

    try {
        handle = await fs.open(
            pending,
            constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
            0o600,
        );
        pendingCreated = true;
        const digest = createHash("sha256");
        for await (const chunk of input.chunks) {
            if (!Buffer.isBuffer(chunk) || chunk.length === 0 ||
                bytes + chunk.length > input.expectedBytes) {
                result = outcome("incomplete_source", bytes);
                return result;
            }
            let offset = 0;
            while (offset < chunk.length) {
                const written = await handle.write(chunk, offset, chunk.length - offset, bytes + offset);
                if (written.bytesWritten <= 0) throw new Error("partial write");
                offset += written.bytesWritten;
            }
            digest.update(chunk);
            bytes += chunk.length;
        }
        if (bytes !== input.expectedBytes) {
            result = outcome("incomplete_source", bytes);
            return result;
        }
        hash = digest.digest("hex");
        await handle.sync();
        const finalTempStat = await handle.stat();
        if (!finalTempStat.isFile() || finalTempStat.size !== bytes) {
            result = outcome("incomplete_source", bytes);
            return result;
        }
        await handle.close();
        handle = undefined;

        // Do not expose untrusted remote audio to the music scanner until
        // a separate complete-recording verification has succeeded.
        // This mandatory callback operates only on our private 0600 temp.
        const approved = await input.verifyTempFile(pending, {
            bytes, sha256: hash,
        });
        const afterVerification = await fs.lstat(pending);
        if (!approved || !afterVerification.isFile() ||
            afterVerification.isSymbolicLink() ||
            afterVerification.dev !== finalTempStat.dev ||
            afterVerification.ino !== finalTempStat.ino ||
            afterVerification.size !== finalTempStat.size ||
            afterVerification.mtimeMs !== finalTempStat.mtimeMs ||
            afterVerification.ctimeMs !== finalTempStat.ctimeMs) {
            result = outcome("validation_failed", bytes, hash);
            return result;
        }

        // Ensure parents have not been replaced between the initial check
        // and the publication. The complete build must run under trusted
        // directory ownership: JavaScript has no openat2 RESOLVE_BENEATH.
        if (await verifyExistingDirectories(input.musicRoot, parts.slice(0, -1)) !== parent) {
            result = outcome("unsafe_destination", bytes, hash);
            return result;
        }
        if (input.sharedReadableAfterVerification === true) {
            // Lidarr may run as a different user (including root) and copy the
            // source file mode into /music. A 0600 source becomes an unreadable
            // root-owned 0600 destination for the non-root Kima scanner.
            // Change ONLY the verified, unpublished audio inode; keep untrusted
            // temporary data private and preserve default Kima-only 0600 mode.
            const readable = await fs.open(
                pending, constants.O_RDONLY | constants.O_NOFOLLOW,
            );
            try {
                const beforeMode = await readable.stat();
                if (!beforeMode.isFile() ||
                    beforeMode.dev !== finalTempStat.dev ||
                    beforeMode.ino !== finalTempStat.ino ||
                    beforeMode.size !== finalTempStat.size ||
                    beforeMode.mtimeMs !== finalTempStat.mtimeMs ||
                    beforeMode.ctimeMs !== finalTempStat.ctimeMs ||
                    (beforeMode.mode & 0o777) !== 0o600) {
                    result = outcome("validation_failed", bytes, hash);
                    return result;
                }
                await readable.chmod(0o644);
                await readable.sync();
                const afterMode = await readable.stat();
                if (afterMode.dev !== beforeMode.dev ||
                    afterMode.ino !== beforeMode.ino ||
                    afterMode.size !== beforeMode.size ||
                    (afterMode.mode & 0o777) !== 0o644) {
                    result = outcome("unavailable", bytes, hash);
                    return result;
                }
            } finally {
                await readable.close();
            }
        }
        try {
            await fs.link(pending, target);
            linked = true;
        } catch (error: unknown) {
            if ((error as NodeJS.ErrnoException)?.code === "EEXIST") {
                const existing = await compareExisting(target, bytes, hash);
                result = outcome(
                    existing === "equal" ? "already_present_same_bytes" :
                        existing === "different" ? "destination_conflict" : "uncertain",
                    bytes, hash,
                );
                return result;
            }
            throw error;
        }
        await syncDirectory(parent);
        result = outcome("published", bytes, hash);
        return result;
    } catch {
        // The link may have succeeded before syncDirectory failed. Retrying
        // automatically could duplicate the recording or corrupt the ledger.
        result = outcome(linked ? "uncertain" : "unavailable", bytes, hash);
        if (linked) result.filesPublished = true;
        return result;
    } finally {
        if (handle) await handle.close().catch(() => undefined);
        if (pendingCreated) {
            try {
                await fs.unlink(pending);
                if (linked) await syncDirectory(parent);
            } catch {
                // A cleanup or second directory fsync failure after linking
                // means durability/completeness cannot be claimed.
                if (linked) {
                    result.state = "uncertain";
                    result.filesPublished = true;
                }
            }
        }
    }
}
