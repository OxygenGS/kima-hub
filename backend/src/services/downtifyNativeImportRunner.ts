/**
 * Native Downtify-to-Kima single-track import cycle.
 *
 * A disabled-by-default, owner-bound engine. Uses Downtify's original
 * authenticated stream, verifies complete recording metadata+decode on a
 * private temporary file, publishes atomically without overwriting, and
 * waits for an exact Kima scanner/file-hash receipt.
 *
 * NEVER removes media from Downtify or deletes/replaces Kima recordings.
 * A claim survives restart in a conservative state; no automatic retries
 * after a possible write or remote connection failure.
 */
import * as path from "path";
import { config } from "../config";
import { prisma } from "../utils/db";
import { spotifyService } from "./spotify";
import { getSpotifyTrackEmbed } from "./downtifySpotifyEmbedEvidence";
import { getDowntifyRuntimeEnv } from "./downtifyIntegrationSettings";
import {
    getVerifiedNativeImportQueue, getVerifiedNativeLibraryChanges,
    openNativeDowntifyOriginal,
} from "./downtifyNativeOriginalTransport";
import {
    claimNativeImport,
    confirmNativeIndexed,
    discoverNativeCompleted,
    getNativeImportSummary,
    holdNativeImportForReview,
    releaseNativeUnwrittenClaim,
    recordNativePublished,
    type PinnedImportOwner,
} from "./downtifyNativeImportLedger";
import { ensureNativeImportDestination, nativeImportDestination } from "./downtifyNativeImportWorkspace";
import { publishNativeAudio } from "./downtifyAtomicPublisher";
import { verifyNativeTemporaryRecording } from "./downtifyNativeAudioVerification";
import { requestScan } from "../workers/scanRequest";
import { verifyNativeMusicVolume } from "./downtifyNativeMountProof";
import {
    type LidarrMountMapping, validateLidarrMountMapping,
} from "./downtifyLidarrMounts";
import { recordLidarrStaged } from "./downtifyNativeLidarrLedger";
import { reconcileLidarrManagedImports } from "./downtifyNativeLidarrCoordinator";

const MAX_IMPORTS_PER_CYCLE = 2;
// Only retry the SCAN of already-published files. This never reopens a
// remote stream, alters an imported file or releases an uncertain claim.
const PENDING_SCAN_RETRY_MS = 15 * 60 * 1000;
let active = false;

export interface NativeImportCycleResult {
    state: "paused" | "busy" | "unavailable" | "checked";
    newJobs: number;
    published: number;
    imported: number;
    heldForReview: number;
    filesDeleted: false;
}

function outcome(
    state: NativeImportCycleResult["state"],
    extra: Partial<Pick<NativeImportCycleResult,
        "newJobs" | "published" | "imported" | "heldForReview">> = {},
): NativeImportCycleResult {
    return {
        state, newJobs: extra.newJobs ?? 0, published: extra.published ?? 0,
        imported: extra.imported ?? 0, heldForReview: extra.heldForReview ?? 0,
        filesDeleted: false,
    };
}

/** Recheck the exact paired owner and switch before each publication. */
async function livePair(owner: PinnedImportOwner): Promise<boolean> {
    const current = await prisma.downtifyIntegration.findUnique({
        where: { id: "default" },
        select: {
            ownerKimaUserId: true, expectedServerId: true,
            expectedUserId: true, enabled: true,
            nativeImportEnabled: true, nativeImportBaselineAt: true,
            nativeImportMountProof: true,
        },
    });
    const stillPaired = current?.ownerKimaUserId === owner.kimaUserId &&
        current.expectedServerId === owner.remoteServerId &&
        current.expectedUserId === owner.remoteUserId &&
        current.enabled === true && current.nativeImportEnabled === true &&
        !!current.nativeImportBaselineAt;
    return stillPaired && await verifyNativeMusicVolume(
        config.music.musicPath, current.nativeImportMountProof,
    );
}

export async function runNativeImportCycle(): Promise<NativeImportCycleResult> {
    if (active) return outcome("busy");
    active = true;
    let newJobs = 0;
    let published = 0;
    let imported = 0;
    let heldForReview = 0;
    try {
        const settings = await prisma.downtifyIntegration.findUnique({
            where: { id: "default" },
            select: {
                enabled: true, nativeImportEnabled: true,
                nativeImportBaselineAt: true, nativeImportLibraryCursor: true,
                nativeImportMountProof: true, nativeImportTarget: true,
                nativeLidarrLocalDownloads: true, nativeLidarrRemoteDownloads: true,
                nativeLidarrRemoteMusic: true, nativeLidarrStageMountProof: true,
                ownerKimaUserId: true, expectedServerId: true,
                expectedUserId: true,
            },
        });
        if (!settings?.enabled || !settings.nativeImportEnabled ||
            !settings.nativeImportBaselineAt ||
            settings.nativeImportLibraryCursor === null) return outcome("paused");
        // A Docker bind target can survive USB/NAS loss as an empty, writable
        // local directory. The on-volume marker is mandatory before any I/O.
        if (!await verifyNativeMusicVolume(
            config.music.musicPath, settings.nativeImportMountProof,
        )) return outcome("unavailable");
        const owner: PinnedImportOwner = {
            kimaUserId: settings.ownerKimaUserId,
            remoteServerId: settings.expectedServerId,
            remoteUserId: settings.expectedUserId,
        };
        const target = settings.nativeImportTarget === "lidarr" ? "lidarr" : "kima";
        let lidarrRoots: LidarrMountMapping | null = null;
        if (target === "lidarr") {
            const kimaDownloads = settings.nativeLidarrLocalDownloads;
            const lidarrDownloads = settings.nativeLidarrRemoteDownloads;
            const lidarrMusic = settings.nativeLidarrRemoteMusic;
            if (!kimaDownloads || !lidarrDownloads || !lidarrMusic) {
                return outcome("unavailable");
            }
            lidarrRoots = {
                kimaDownloads, lidarrDownloads,
                kimaMusic: config.music.musicPath, lidarrMusic,
            };
            if (!validateLidarrMountMapping(lidarrRoots) ||
                !await verifyNativeMusicVolume(
                    kimaDownloads, settings.nativeLidarrStageMountProof,
                )) return outcome("unavailable");
        }
        // Local scanner receipts must be reconciled even when Downtify or its
        // credentials are temporarily unavailable. This work NEVER re-copies
        // media or calls the remote server.
        // Finish index receipts from earlier cycles WITHOUT re-copying them.
        const waitingForIndex = await prisma.downtifyNativeImport.findMany({
            where: {
                ownerKimaUserId: owner.kimaUserId,
                remoteServerId: owner.remoteServerId,
                remoteUserId: owner.remoteUserId,
                status: "published_pending_scan",
            },
            select: { id: true, claimToken: true, updatedAt: true },
            orderBy: { updatedAt: "asc" }, take: 30,
        });
        const staleReceipts: typeof waitingForIndex = [];
        const scanRetryBefore = Date.now() - PENDING_SCAN_RETRY_MS;
        for (const row of waitingForIndex) {
            if (!row.claimToken) continue;
            const receipt = await confirmNativeIndexed(owner, row.id, row.claimToken);
            if (receipt.state === "imported") {
                imported++;
            } else if (receipt.state === "not_indexed" &&
                row.updatedAt instanceof Date &&
                row.updatedAt.getTime() < scanRetryBefore) {
                staleReceipts.push(row);
            }
        }
        if (staleReceipts.length) {
            // All outstanding rows share ONE throttled full scan. An earlier
            // scan may have failed or may have missed a file added mid-walk.
            // The retry key is separate from scan-full and initial import keys.
            // Update the durable cooldown only AFTER Redis acknowledges the
            // request. On a queue outage, the next cycle can try again.
            try {
                await requestScan({
                    source: "downtify-native-receipt-retry",
                    userId: owner.kimaUserId,
                    downtifyNativeImportId: "pending-receipts",
                });
                const now = new Date();
                for (const row of staleReceipts) {
                    await prisma.downtifyNativeImport.updateMany({
                        where: {
                            id: row.id, claimToken: row.claimToken,
                            status: "published_pending_scan",
                            ownerKimaUserId: owner.kimaUserId,
                            remoteServerId: owner.remoteServerId,
                            remoteUserId: owner.remoteUserId,
                            updatedAt: row.updatedAt,
                        },
                        data: { updatedAt: now },
                    });
                }
            } catch {
                // No media or import-claim state changes when scanning fails.
            }
        }

        if (lidarrRoots) {
            // Reconcile staged media and previously acknowledged Lidarr
            // commands BEFORE asking Downtify for new jobs. A Downtify outage
            // cannot prevent finishing a Lidarr/Kima scanner receipt.
            await reconcileLidarrManagedImports(owner,lidarrRoots);
        }

        const env = await getDowntifyRuntimeEnv();
        // Read the library cursor BEFORE the queue, so a remote track
        // completed between the two reads is considered on a later cycle
        // rather than advancing the cursor past a missing queue receipt.
        const library = await getVerifiedNativeLibraryChanges(
            owner.kimaUserId, settings.nativeImportLibraryCursor, env,
        );
        if (library.state !== "ready") return outcome("unavailable", { imported });
        const queue = await getVerifiedNativeImportQueue(owner.kimaUserId, env);
        if (queue.state !== "ready") return outcome("unavailable", { imported });
        const observed = await discoverNativeCompleted(owner, queue.queue, {
            cursor: library.cursor, full: library.full, tracks: library.tracks,
        });
        if (observed.state !== "recorded" && observed.state !== "deferred") {
            return outcome("unavailable", { imported });
        }
        // A deferred cursor does not stop reconciliation of already-published
        // files or already-approved claims from earlier cycles.
        newJobs = observed.count;
        if (observed.ambiguous > 0) {
            // A duplicate remote job is not a unique source. Never guess.
            heldForReview += observed.ambiguous;
        }

        const ready = await prisma.downtifyNativeImport.findMany({
            where: {
                ownerKimaUserId: owner.kimaUserId,
                remoteServerId: owner.remoteServerId,
                remoteUserId: owner.remoteUserId,
                status: "ready",
                discoveredAt: { gt: settings.nativeImportBaselineAt },
                OR: [
                    { claimedAt: null },
                    { claimedAt: { lt: new Date(Date.now() - 15 * 60 * 1000) } },
                ],
            },
            select: { id: true, spotifyTrackId: true },
            orderBy: { discoveredAt: "asc" }, take: MAX_IMPORTS_PER_CYCLE,
        });
        // The scanner walks the entire music tree. Batch up to two claims per
        // cycle, then request exactly one scan AFTER all links are visible.
        // Every batch has its own dedupe key, distinct from a live scan-full.
        const scanBatchIds: string[] = [];
        for (const candidate of ready) {
            // This CAS is the only entry to potentially writable work.
            const claim = await claimNativeImport(owner, candidate.id);
            if (claim.state !== "claimed") continue;
            const hold = async (reason: string) => {
                heldForReview++;
                await holdNativeImportForReview(owner, claim.id, claim.claimToken, reason);
            };
            // Only safe before publishNativeAudio: no destination file has
            // been created, so the next 15-minute recheck cannot overwrite.
            const deferUnwritten = async (
                reason: "remote_temporarily_unavailable" |
                    "storage_temporarily_unavailable",
            ) => {
                if (!await releaseNativeUnwrittenClaim(
                    owner, claim.id, claim.claimToken, reason,
                )) await hold("claim_state_uncertain");
            };
            let cancelOriginal: (() => void) | undefined;
            try {
                // No remote song, token or path comes from an HTTP request.
                const original = await openNativeDowntifyOriginal(
                    owner.kimaUserId, claim.spotifyTrackId, env,
                );
                if (original.state !== "ready") {
                    if (original.state === "unavailable" ||
                        original.state === "stream_unavailable" ||
                        original.state === "not_completed") {
                        await deferUnwritten("remote_temporarily_unavailable");
                    } else {
                        await hold("remote_source_unavailable");
                    }
                    continue;
                }
                cancelOriginal = original.cancel;
                // Prefer independent, token-free Spotify embed metadata.
                // Only if the embed is temporarily unavailable, try the
                // existing authorized track API path as a compatibility fallback.
                // A mismatched embed ID must NEVER fall back to another source.
                const embed = await getSpotifyTrackEmbed(claim.spotifyTrackId);
                if (embed.state === "identity_mismatch") {
                    await hold("spotify_identity_mismatch");
                    continue;
                }
                const expected = embed.state === "ready" ? embed.track :
                    await spotifyService.getTrackBySpotifyId(claim.spotifyTrackId);
                if (!expected) {
                    // No output path was opened yet. Release exclusively this
                    // unwritten claim with the persistent 15-minute cooldown.
                    await deferUnwritten("remote_temporarily_unavailable");
                    continue;
                }
                if (expected.spotifyId !== claim.spotifyTrackId ||
                    !Number.isSafeInteger(expected.durationMs) ||
                    expected.durationMs < 1000 ||
                    Math.abs(expected.durationMs -
                        original.durationSeconds * 1000) > 4000) {
                    await hold("spotify_identity_mismatch");
                    continue;
                }
                if (target === "lidarr" &&
                    (!original.album?.trim() ||
                     /^(unknown|n\/a|none|singles?)$/i.test(original.album.trim()))) {
                    // Lidarr needs a real MusicBrainz release. Do not invent an
                    // album merely to get a green import status.
                    await hold("lidarr_album_missing");
                    continue;
                }
                const extension = path.posix.extname(original.remoteFilename).toLowerCase();
                const relativeTarget = nativeImportDestination(
                    expected.artist || original.artist,
                    expected.title || original.title,
                    claim.spotifyTrackId, extension,
                );
                if (!relativeTarget) {
                    await hold("unsafe_destination");
                    continue;
                }
                const publishRoot = target === "lidarr"
                    ? lidarrRoots!.kimaDownloads : config.music.musicPath;
                const prepared = await ensureNativeImportDestination(
                    publishRoot, relativeTarget,
                );
                if (prepared.state !== "ready") {
                    if (prepared.state === "storage_unavailable") {
                        await deferUnwritten("storage_temporarily_unavailable");
                    } else {
                        await hold("unsafe_destination");
                    }
                    continue;
                }
                if (!await livePair(owner)) {
                    await hold("pairing_disabled");
                    continue;
                }
                const installed = await publishNativeAudio({
                    musicRoot: publishRoot,
                    relativeTarget, expectedBytes: original.expectedBytes,
                    chunks: original.chunks,
                    verifyTempFile: async (file, source) => {
                        // A pairing disabled while streaming must prevent
                        // untrusted bytes being linked into the library.
                        if (!await livePair(owner)) return false;
                        const checked = await verifyNativeTemporaryRecording(
                            file,
                            {
                                spotifyId: claim.spotifyTrackId,
                                expectedSpotifyId: expected.spotifyId,
                                isrc: expected.isrc, durationMs: expected.durationMs,
                                title: expected.title, artist: expected.artist,
                                extension,
                            },
                            source,
                        );
                        return checked.verifiedForPublication &&
                            await livePair(owner);
                    },
                });
                if (installed.state !== "published" &&
                    installed.state !== "already_present_same_bytes") {
                    await hold(installed.state === "validation_failed"
                        ? "recording_needs_review" : "publish_uncertain");
                    continue;
                }
                if (target === "lidarr") {
                    // This is a *staged* file outside the music library.
                    // Never request a Kima scan or call it imported here.
                    if (!installed.sha256 || !await recordLidarrStaged(
                        owner,claim.id,claim.claimToken,{
                            relative:relativeTarget,bytes:installed.bytes,
                            sha256:installed.sha256,
                            artist:expected.artist,album:original.album.trim(),
                            title:expected.title,durationMs:expected.durationMs,
                            remoteTrackId:original.remoteTrackId,
                        },
                    )) {
                        await hold("lidarr_staging_receipt_missing");
                    }
                    continue;
                }
                if (!installed.sha256 || !await recordNativePublished(
                    owner, claim.id, claim.claimToken,
                    {
                        expectedBytes: installed.bytes,
                        relativeTarget, fullSha256: installed.sha256,
                        remoteLibraryTrackId: original.remoteTrackId,
                    },
                )) {
                    await hold("publication_receipt_missing");
                    continue;
                }
                published += installed.state === "published" ? 1 : 0;
                // Both newly linked and verified existing files need indexing.
                scanBatchIds.push(claim.id);
            } catch {
                await hold("import_incomplete");
            } finally {
                // Stops an unused/unfinished authenticated HTTP stream.
                // This also executes for all "continue" branches above.
                cancelOriginal?.();
            }
        }

        // One scan per finished batch. If Redis is unavailable or this cycle
        // crashes before enqueueing, each durable pending receipt is retried
        // later by the throttled scanner-only recovery above. NEVER recopy.
        if (scanBatchIds.length) {
            try {
                await requestScan({
                    source: "downtify-native-import",
                    userId: owner.kimaUserId,
                    downtifyNativeImportId: "batch-" + scanBatchIds.join("-"),
                });
            } catch {
                // Durable published_pending_scan rows survive queue outages.
            }
        }

        // Summary is intentionally scoped; do not log source paths or tokens.
        await getNativeImportSummary(owner);
        return outcome("checked", { newJobs, published, imported, heldForReview });
    } catch {
        return outcome("unavailable", { newJobs, published, imported, heldForReview });
    } finally {
        active = false;
    }
}
