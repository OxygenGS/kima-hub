/**
 * Administrator-only native Downtify importer activation.
 *
 * The normal UI offers a single OFF-by-default control. First enablement
 * requires one explicit acknowledgement that all external writers targeting
 * the same library have been stopped and a verified snapshot of already-done
 * jobs has been recorded as "baseline" (never imported).
 *
 * The application cannot inspect external Proxmox systemd timers. The
 * acknowledgement is operational and must not be claimed as host proof.
 */
import { prisma } from "../utils/db";
import { getDowntifyRuntimeEnv } from "./downtifyIntegrationSettings";
import { getNativeImportSummary, recordNativeBaseline } from "./downtifyNativeImportLedger";
import {
    getVerifiedNativeImportQueue, getVerifiedNativeLibraryChanges,
} from "./downtifyNativeOriginalTransport";

export type NativeAutoImportStatus = {
    state: "unpaired" | "other_owner" | "paused" | "enabled";
    enabled: boolean;
    baselineReady: boolean;
    awaitingImport: number;
    needsReview: number;
    legacyHostVerified: false;
};

export class NativeImportSetupError extends Error {
    constructor(public readonly state:
        | "not_paired" | "unauthorized" | "pairing_disabled" |
          "confirmation_required" | "source_unavailable" |
          "invalid_baseline" | "changed_during_setup") {
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
            nativeImportLibraryCursor: true,
        },
    });
    if (!row) return {
        state: "unpaired", enabled: false, baselineReady: false,
        awaitingImport: 0, needsReview: 0, legacyHostVerified: false,
    };
    if (row.ownerKimaUserId !== adminId) return {
        state: "other_owner", enabled: false, baselineReady: false,
        awaitingImport: 0, needsReview: 0, legacyHostVerified: false,
    };
    const summary = await getNativeImportSummary({
        kimaUserId: adminId,
        remoteServerId: row.expectedServerId,
        remoteUserId: row.expectedUserId,
    });
    return {
        state: summary.enabled ? "enabled" : "paused",
        enabled: summary.enabled,
        baselineReady: summary.baselineReady,
        awaitingImport: summary.waiting,
        needsReview: summary.inReview,
        legacyHostVerified: false,
    };
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

    const owner = {
        kimaUserId: adminId,
        remoteServerId: row.expectedServerId,
        remoteUserId: row.expectedUserId,
    };
    if (!row.nativeImportBaselineAt || row.nativeImportLibraryCursor === null) {
        const env = await getDowntifyRuntimeEnv();
        const queue = await getVerifiedNativeImportQueue(adminId, env);
        const library = await getVerifiedNativeLibraryChanges(adminId, 0, env);
        if (queue.state !== "ready" || library.state !== "ready" || !library.full) {
            throw new NativeImportSetupError("source_unavailable");
        }
        const seeded = await recordNativeBaseline(owner, queue.queue, library.cursor);
        if (seeded.state !== "recorded") {
            throw new NativeImportSetupError("invalid_baseline");
        }
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
        },
        data: { nativeImportEnabled: true },
    });
    if (updated.count !== 1) {
        throw new NativeImportSetupError("changed_during_setup");
    }
    return getNativeAutoImportStatus(adminId);
}
