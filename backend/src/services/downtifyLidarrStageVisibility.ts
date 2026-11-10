/**
 * Prove, before authorizing Lidarr mode, that Lidarr can SEE Kima's real
 * pinned shared-staging mount. Merely configuring two strings named
 * "/downloads" does not prove they refer to the same Docker filesystem.
 *
 * One unpredictable short-lived non-audio marker is created exclusively in
 * Kima's already-verified staging directory, then checked via Lidarr's
 * read-only GET /api/v1/filesystem/type endpoint. It is removed with an
 * inode check. The remote response never grants permission to copy media.
 */
import { randomBytes } from "crypto";
import { constants, promises as fs } from "fs";
import * as path from "path";
import type { AxiosInstance } from "axios";
import { verifyNativeMusicVolume } from "./downtifyNativeMountProof";
import {
    type LidarrMountMapping, validateLidarrMountMapping,
    verifySeparateLidarrLocalRoots,
} from "./downtifyLidarrMounts";

const markerDirectory = ["Singles", "Downtify"] as const;
const markerPrefix = ".kima-lidarr-visibility-";
type FileIdentity = {dev: number; ino: number};

/**
 * Must run only after explicit administrator consent and creation of
 * Kima's stage volume proof. No music is written, imported or deleted.
 * A missing Lidarr mount, changed device, API error or failed cleanup
 * returns false. Does not reveal either a token or a host path to the UI.
 */
export async function verifySharedLidarrStaging(
    lidarr: Pick<AxiosInstance, "get">,
    roots: LidarrMountMapping,
    stageProof: string | null,
): Promise<boolean> {
    if (!validateLidarrMountMapping(roots) ||
        !await verifySeparateLidarrLocalRoots(roots) ||
        !await verifyNativeMusicVolume(roots.kimaDownloads, stageProof)) {
        return false;
    }
    const stageDirectory = path.posix.join(
        roots.kimaDownloads, ...markerDirectory,
    );
    const probeName = markerPrefix + randomBytes(16).toString("hex") + ".probe";
    const localProbe = path.posix.join(stageDirectory, probeName);
    const remoteProbe = path.posix.join(
        roots.lidarrDownloads, ...markerDirectory, probeName,
    );
    let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
    let identity: FileIdentity | undefined;
    let verified = false;
    let cleaned = false;
    try {
        const dir = await fs.lstat(stageDirectory);
        if (!dir.isDirectory() || dir.isSymbolicLink() ||
            await fs.realpath(stageDirectory) !== stageDirectory) return false;
        handle = await fs.open(localProbe,
            constants.O_WRONLY | constants.O_CREAT |
            constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        const st = await handle.stat();
        // Pin the newly created inode before checking its attributes so
        // even a failed permission/type check can clean up our own probe.
        identity = {dev: st.dev, ino: st.ino};
        if (!st.isFile() || st.dev !== dir.dev || st.nlink !== 1 ||
            (st.mode & 0o077) !== 0) return false;
        await handle.writeFile("kima-lidarr-visibility-v1\n", {encoding:"utf8"});
        await handle.sync();
        const response = await lidarr.get("/api/v1/filesystem/type", {
            params:{path:remoteProbe},
            timeout:12000,maxRedirects:0,proxy:false,
            maxContentLength:4096,
        });
        const after = await fs.lstat(localProbe);
        const afterDir = await fs.lstat(stageDirectory);
        verified = response.data?.type === "file" &&
            after.isFile() && !after.isSymbolicLink() &&
            after.dev === identity.dev && after.ino === identity.ino &&
            afterDir.dev === dir.dev && afterDir.ino === dir.ino &&
            await verifyNativeMusicVolume(roots.kimaDownloads, stageProof);
    } catch {
        // A remote error is never evidence of a shared staging filesystem.
    } finally {
        if (handle) await handle.close().catch(() => undefined);
        if (identity) {
            try {
                const existing = await fs.lstat(localProbe);
                if (existing.isFile() && !existing.isSymbolicLink() &&
                    existing.dev === identity.dev && existing.ino === identity.ino) {
                    await fs.unlink(localProbe);
                    cleaned = true;
                }
            } catch {
                // Do not delete a substituted path or claim a clean probe.
            }
        }
    }
    return verified && cleaned;
}
