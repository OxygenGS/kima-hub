/**
 * Administrator-only native Downtify importer activation.
 *
 * The normal UI offers a single OFF-by-default control. First enablement
 * requires explicit confirmation that the configured music storage is correct
 * and no other importer is writing to the same library. New installations
 * without another importer do not require a migration or cutover.
 *
 * Kima cannot inspect other containers or host services. The acknowledgement
 * is operational, not independent proof of single-writer safety. Already-done
 * remote jobs are recorded as a baseline and never imported.
 */
import { prisma } from "../utils/db";
import { validateLidarrMountMapping } from "./downtifyLidarrMounts";
import { config } from "../config";
import {
    initializeNativeMusicVolume, verifyNativeMusicVolume,
} from "./downtifyNativeMountProof";
import { getDowntifyRuntimeEnv } from "./downtifyIntegrationSettings";
import { getNativeImportSummary, recordNativeBaseline, retryOneProvenUnwrittenSpotifyClaim } from "./downtifyNativeImportLedger";
import {
    getVerifiedNativeImportQueue, getVerifiedNativeLibraryChanges,
    openNativeDowntifyOriginal, type NativeSourceState,
} from "./downtifyNativeOriginalTransport";

export type NativeAutoImportStatus = {
    state: "unpaired" | "other_owner" | "paused" | "enabled";
    enabled: boolean;
    baselineReady: boolean;
    awaitingImport: number;
    processing: number;
    awaitingScan: number;
    imported: number;
    needsReview: number;
    lidarrPending: number;
    lidarrNeedsMatch: number;
    lidarrImported: number;
    /** Read-only proof that the current music root matches its first-activation disk. */
    storageReady: boolean;
    target: "kima" | "lidarr";
    lidarrStageReady: boolean;
    lidarrDownloads: string | null;
    lidarrMusic: string | null;
    allowArtistCreation: boolean;
};

export class NativeImportSetupError extends Error {
    constructor(public readonly state:
        | "not_paired" | "unauthorized" | "pairing_disabled" |
          "confirmation_required" | "source_unavailable" |
          "invalid_baseline" | "changed_during_setup" | "storage_unavailable") {
        super(state);
    }
}

export async function getNativeAutoImportStatus(
    adminId: string,
): Promise<NativeAutoImportStatus> {
    const row = await prisma.downtifyIntegration.findUnique({
        where: { id: "default" },
        select: {
            ownerKimaUserId: true, expectedServerId: true,
            expectedUserId: true,
            nativeImportEnabled: true, nativeImportBaselineAt: true,
            nativeImportLibraryCursor: true, nativeImportMountProof: true,
            nativeImportTarget: true, nativeLidarrLocalDownloads: true,
            nativeLidarrRemoteDownloads: true,
            nativeLidarrRemoteMusic: true, nativeLidarrStageMountProof: true,
            nativeLidarrAllowArtistCreation: true,
        },
    });
    if (!row) return {
        state: "unpaired", enabled: false, baselineReady: false,
        awaitingImport: 0, processing: 0, awaitingScan: 0,
        imported: 0, needsReview: 0,
        lidarrPending: 0, lidarrNeedsMatch: 0, lidarrImported: 0,
        storageReady: false, target: "kima", lidarrStageReady: false,
        lidarrDownloads: null, lidarrMusic: null,
        allowArtistCreation: false,
    };
    if (row.ownerKimaUserId !== adminId) return {
        state: "other_owner", enabled: false, baselineReady: false,
        awaitingImport: 0, processing: 0, awaitingScan: 0,
        imported: 0, needsReview: 0,
        lidarrPending: 0, lidarrNeedsMatch: 0, lidarrImported: 0,
        storageReady: false, target: "kima", lidarrStageReady: false,
        lidarrDownloads: null, lidarrMusic: null,
        allowArtistCreation: false,
    };
    const summary = await getNativeImportSummary({
        kimaUserId: adminId,
        remoteServerId: row.expectedServerId,
        remoteUserId: row.expectedUserId,
    });
    const musicReady = await verifyNativeMusicVolume(
        config.music.musicPath, row.nativeImportMountProof,
    );
    const target = row.nativeImportTarget === "lidarr" ? "lidarr" : "kima";
    const lidarrStageReady = target === "lidarr" &&
        !!row.nativeLidarrLocalDownloads &&
        !!row.nativeLidarrRemoteDownloads &&
        !!row.nativeLidarrRemoteMusic &&
        validateLidarrMountMapping({
            kimaDownloads: row.nativeLidarrLocalDownloads,
            lidarrDownloads: row.nativeLidarrRemoteDownloads,
            kimaMusic: config.music.musicPath,
            lidarrMusic: row.nativeLidarrRemoteMusic,
        }) &&
        await verifyNativeMusicVolume(
            row.nativeLidarrLocalDownloads, row.nativeLidarrStageMountProof,
        );
    return {
        state: summary.enabled ? "enabled" : "paused",
        enabled: summary.enabled,
        baselineReady: summary.baselineReady,
        awaitingImport: summary.waiting,
        processing: summary.processing,
        awaitingScan: summary.awaitingScan,
        imported: summary.imported,
        needsReview: summary.inReview,
        lidarrPending: summary.lidarrPending ?? 0,
        lidarrNeedsMatch: summary.lidarrNeedsMatch ?? 0,
        lidarrImported: summary.lidarrImported ?? 0,
        storageReady: musicReady && (target === "kima" || !!lidarrStageReady),
        target, lidarrStageReady: !!lidarrStageReady,
        lidarrDownloads: row.nativeLidarrRemoteDownloads,
        lidarrMusic: row.nativeLidarrRemoteMusic,
        allowArtistCreation: row.nativeLidarrAllowArtistCreation === true,
    };
}

/**
 * Explicit, one-claim recovery from the verified pre-write RC3 Spotify 403
 * state. Never auto-resets ambiguous/partially published imports.
 */
export type NativeSourceDiagnosis = {
    state: NativeSourceState | "none" | "paused" | "storage_unavailable";
};

/**
 * Explicit owner-only diagnosis of ONE already-durable waiting import.
 * It inspects source identity, the completed owner job, the exact library
 * filename and original HTTP response headers. It never reads audio bytes
 * into Kima, claims the row, schedules a scan or touches a local music file.
 *
 * This is intentionally separate from the generic setup preflight: that
 * test may select ANOTHER working song and mask a missing source job here.
 */
export async function diagnoseWaitingNativeOriginal(
    adminId: string,
): Promise<NativeSourceDiagnosis> {
    const row = await prisma.downtifyIntegration.findUnique({
        where: { id: "default" },
        select: {
            ownerKimaUserId: true, expectedServerId: true,
            expectedUserId: true, enabled: true,
            nativeImportEnabled: true, nativeImportBaselineAt: true,
            nativeImportLibraryCursor: true, nativeImportMountProof: true,
        },
    });
    if (!row) throw new NativeImportSetupError("not_paired");
    if (row.ownerKimaUserId !== adminId) {
        throw new NativeImportSetupError("unauthorized");
    }
    if (!row.enabled || !row.nativeImportEnabled ||
        !row.nativeImportBaselineAt ||
        row.nativeImportLibraryCursor === null) return { state: "paused" };
    if (!await verifyNativeMusicVolume(
        config.music.musicPath, row.nativeImportMountProof,
    )) return { state: "storage_unavailable" };

    const waiting = await prisma.downtifyNativeImport.findFirst({
        where: {
            ownerKimaUserId: adminId,
            remoteServerId: row.expectedServerId,
            remoteUserId: row.expectedUserId,
            status: "ready",
            discoveredAt: { gt: row.nativeImportBaselineAt },
        },
        select: { spotifyTrackId: true },
        orderBy: { discoveredAt: "asc" },
    });
    if (!waiting) return { state: "none" };

    const env = await getDowntifyRuntimeEnv();
    const original = await openNativeDowntifyOriginal(
        adminId, waiting.spotifyTrackId, env,
    );
    if (original.state === "ready") {
        // Only HTTP response headers were checked. Destroy the open response
        // stream immediately; no full audio transfer, claim or file write.
        original.cancel();
    }
    return { state: original.state };
}

export async function retrySafeSpotifyIdentityClaim(
    adminId: string, acknowledged: boolean,
): Promise<{ state: "requeued" | "none" | "blocked" }> {
    if (!acknowledged) throw new NativeImportSetupError("confirmation_required");
    const row = await prisma.downtifyIntegration.findUnique({
        where: { id: "default" },
        select: {
            ownerKimaUserId: true, expectedServerId: true,
            expectedUserId: true, enabled: true,
            nativeImportEnabled: true, nativeImportBaselineAt: true,
            nativeImportLibraryCursor: true, nativeImportMountProof: true,
        },
    });
    if (!row) throw new NativeImportSetupError("not_paired");
    if (row.ownerKimaUserId !== adminId) {
        throw new NativeImportSetupError("unauthorized");
    }
    if (!row.enabled || !row.nativeImportEnabled ||
        !row.nativeImportBaselineAt ||
        row.nativeImportLibraryCursor === null) {
        throw new NativeImportSetupError("pairing_disabled");
    }
    if (!await verifyNativeMusicVolume(
        config.music.musicPath, row.nativeImportMountProof,
    )) throw new NativeImportSetupError("storage_unavailable");

    const state = await retryOneProvenUnwrittenSpotifyClaim({
        kimaUserId: adminId, remoteServerId: row.expectedServerId,
        remoteUserId: row.expectedUserId,
    });
    return { state };
}

export async function setNativeAutoImport(
    adminId: string, enable: boolean, acknowledged: boolean,
): Promise<NativeAutoImportStatus> {
    const row = await prisma.downtifyIntegration.findUnique({
        where: { id: "default" },
        select: {
            ownerKimaUserId: true, expectedServerId: true,
            expectedUserId: true, enabled: true,
            nativeImportEnabled: true, nativeImportBaselineAt: true,
            nativeImportLibraryCursor: true, nativeImportMountProof: true,
            nativeImportTarget: true, nativeLidarrLocalDownloads: true,
            nativeLidarrRemoteDownloads: true,
            nativeLidarrRemoteMusic: true, nativeLidarrStageMountProof: true,
            nativeLidarrAllowArtistCreation: true,
        },
    });
    if (!row) throw new NativeImportSetupError("not_paired");
    if (row.ownerKimaUserId !== adminId) throw new NativeImportSetupError("unauthorized");
    if (!enable) {
        // Revoking an already-claimed import pauses all NEW work. Previously
        // published_pending_scan records may still be confirmed safely.
        const changed = await prisma.downtifyIntegration.updateMany({
            where: { id: "default", ownerKimaUserId: adminId },
            data: { nativeImportEnabled: false },
        });
        if (changed.count !== 1) throw new NativeImportSetupError("changed_during_setup");
        return getNativeAutoImportStatus(adminId);
    }
    if (!row.enabled) throw new NativeImportSetupError("pairing_disabled");
    if (!acknowledged) throw new NativeImportSetupError("confirmation_required");
    if (row.nativeImportEnabled) return getNativeAutoImportStatus(adminId);
    if (row.nativeImportTarget === "lidarr") {
        const kimaDownloads = row.nativeLidarrLocalDownloads;
        const lidarrDownloads = row.nativeLidarrRemoteDownloads;
        const lidarrMusic = row.nativeLidarrRemoteMusic;
        if (!kimaDownloads || !lidarrDownloads || !lidarrMusic ||
            !validateLidarrMountMapping({
                kimaDownloads, lidarrDownloads,
                kimaMusic: config.music.musicPath, lidarrMusic,
            }) ||
            !await verifyNativeMusicVolume(
                kimaDownloads, row.nativeLidarrStageMountProof,
            )) throw new NativeImportSetupError("storage_unavailable");
    }

    const owner = {
        kimaUserId: adminId,
        remoteServerId: row.expectedServerId,
        remoteUserId: row.expectedUserId,
    };
    if (!row.nativeImportBaselineAt && row.nativeImportLibraryCursor === null &&
        !row.nativeImportMountProof) {
        const env = await getDowntifyRuntimeEnv();
        const queue = await getVerifiedNativeImportQueue(adminId, env);
        const library = await getVerifiedNativeLibraryChanges(adminId, 0, env);
        if (queue.state !== "ready" || library.state !== "ready" || !library.full) {
            throw new NativeImportSetupError("source_unavailable");
        }
        // Only on explicit first activation and after the owner verified
        // their actual music mount. The marker is on THAT filesystem.
        const proof = await initializeNativeMusicVolume(config.music.musicPath);
        if (!proof) throw new NativeImportSetupError("storage_unavailable");
        const seeded = await recordNativeBaseline(
            owner, queue.queue, library.cursor, proof,
        );
        if (seeded.state !== "recorded") {
            throw new NativeImportSetupError("invalid_baseline");
        }
    } else if (!row.nativeImportBaselineAt ||
        row.nativeImportLibraryCursor === null ||
        !await verifyNativeMusicVolume(
            config.music.musicPath, row.nativeImportMountProof,
        )) {
        throw new NativeImportSetupError("storage_unavailable");
    }
    // Never use an unconditional update: an intervening re-pair resets
    // baseline and must invalidate this authorization.
    const updated = await prisma.downtifyIntegration.updateMany({
        where: {
            id: "default", ownerKimaUserId: adminId,
            expectedServerId: owner.remoteServerId,
            expectedUserId: owner.remoteUserId,
            enabled: true, nativeImportEnabled: false,
            nativeImportBaselineAt: { not: null },
            nativeImportLibraryCursor: { not: null },
            nativeImportMountProof: { not: null },
        },
        data: { nativeImportEnabled: true },
    });
    if (updated.count !== 1) {
        throw new NativeImportSetupError("changed_during_setup");
    }
    return getNativeAutoImportStatus(adminId);
}
