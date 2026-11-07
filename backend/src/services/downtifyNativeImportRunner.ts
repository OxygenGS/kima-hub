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
    recordNativePublished,
    type PinnedImportOwner,
} from "./downtifyNativeImportLedger";
import { ensureNativeImportDestination, nativeImportDestination } from "./downtifyNativeImportWorkspace";
import { publishNativeAudio } from "./downtifyAtomicPublisher";
import { verifyNativeTemporaryRecording } from "./downtifyNativeAudioVerification";
import { requestScan } from "../workers/scanRequest";

const MAX_IMPORTS_PER_CYCLE = 2;
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
        },
    });
    return current?.ownerKimaUserId === owner.kimaUserId &&
        current.expectedServerId === owner.remoteServerId &&
        current.expectedUserId === owner.remoteUserId &&
        current.enabled === true && current.nativeImportEnabled === true &&
        !!current.nativeImportBaselineAt;
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
                ownerKimaUserId: true, expectedServerId: true,
                expectedUserId: true,
            },
        });
        if (!settings?.enabled || !settings.nativeImportEnabled ||
            !settings.nativeImportBaselineAt ||
            settings.nativeImportLibraryCursor === null) return outcome("paused");
        const owner: PinnedImportOwner = {
            kimaUserId: settings.ownerKimaUserId,
            remoteServerId: settings.expectedServerId,
            remoteUserId: settings.expectedUserId,
        };
        const env = await getDowntifyRuntimeEnv();
        const queue = await getVerifiedNativeImportQueue(owner.kimaUserId, env);
        if (queue.state !== "ready") return outcome("unavailable");

        const library = await getVerifiedNativeLibraryChanges(
            owner.kimaUserId, settings.nativeImportLibraryCursor, env,
        );
        if (library.state !== "ready") return outcome("unavailable");
        const observed = await discoverNativeCompleted(owner, queue.queue, {
            cursor: library.cursor, full: library.full, tracks: library.tracks,
        });
        if (observed.state !== "recorded") return outcome("unavailable");
        newJobs = observed.count;
        if (observed.ambiguous > 0) {
            // A duplicate remote job is not a unique source. Never guess.
            heldForReview += observed.ambiguous;
        }

        // Finish index receipts from earlier cycles WITHOUT re-copying them.
        const waitingForIndex = await prisma.downtifyNativeImport.findMany({
            where: {
                ownerKimaUserId: owner.kimaUserId,
                remoteServerId: owner.remoteServerId,
                remoteUserId: owner.remoteUserId,
                status: "published_pending_scan",
            },
            select: { id: true, claimToken: true },
            orderBy: { updatedAt: "asc" }, take: 30,
        });
        for(const row of waitingForIndex) {
            if (!row.claimToken) continue;
            const receipt = await confirmNativeIndexed(
                owner, row.id, row.claimToken,
            );
            if (receipt.state === "imported") imported++;
        }

        const ready = await prisma.downtifyNativeImport.findMany({
            where: {
                ownerKimaUserId: owner.kimaUserId,
                remoteServerId: owner.remoteServerId,
                remoteUserId: owner.remoteUserId,
                status: "ready",
                discoveredAt: { gt: settings.nativeImportBaselineAt },
            },
            select: { id: true, spotifyTrackId: true },
            orderBy: { discoveredAt: "asc" }, take: MAX_IMPORTS_PER_CYCLE,
        });
        for (const candidate of ready) {
            // This CAS is the only entry to potentially writable work.
            const claim = await claimNativeImport(owner, candidate.id);
            if (claim.state !== "claimed") continue;
            const hold = async (reason: string) => {
                heldForReview++;
                await holdNativeImportForReview(owner, claim.id, claim.claimToken, reason);
            };
            let cancelOriginal: (() => void) | undefined;
            try {
                // No remote song, token or path comes from an HTTP request.
                const original = await openNativeDowntifyOriginal(
                    owner.kimaUserId, claim.spotifyTrackId, env,
                );
                if (original.state !== "ready") {
                    await hold("remote_source_unavailable");
                    continue;
                }
                cancelOriginal = original.cancel;
                const expected = await spotifyService.getTrackBySpotifyId(
                    claim.spotifyTrackId,
                );
                if (!expected || expected.spotifyId !== claim.spotifyTrackId ||
                    !Number.isSafeInteger(expected.durationMs) ||
                    expected.durationMs < 1000 ||
                    Math.abs(expected.durationMs -
                        original.durationSeconds * 1000) > 4000) {
                    await hold("spotify_identity_unavailable");
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
                const prepared = await ensureNativeImportDestination(
                    config.music.musicPath, relativeTarget,
                );
                if (prepared.state !== "ready") {
                    await hold("storage_unavailable");
                    continue;
                }
                if (!await livePair(owner)) {
                    await hold("pairing_disabled");
                    continue;
                }
                const installed = await publishNativeAudio({
                    musicRoot: config.music.musicPath,
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
                // The scanner may be unavailable; the durable state remains
                // published_pending_scan and this cycle never copies it again.
                try {
                    await requestScan({
                        source: "downtify-native-import",
                        userId: owner.kimaUserId,
                    });
                } catch {
                    // No automatic retry of the file installation.
                }
            } catch {
                await hold("import_incomplete");
            } finally {
                // Stops an unused/unfinished authenticated HTTP stream.
                // This also executes for all "continue" branches above.
                cancelOriginal?.();
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
