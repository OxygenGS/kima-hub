import { prisma } from "../../utils/db";
import {
    initializeNativeMusicVolume, verifyNativeMusicVolume,
} from "../downtifyNativeMountProof";
import { getDowntifyRuntimeEnv } from "../downtifyIntegrationSettings";
import {
    getVerifiedNativeImportQueue, getVerifiedNativeLibraryChanges,
    openNativeDowntifyOriginal,
} from "../downtifyNativeOriginalTransport";
import { getNativeImportSummary, recordNativeBaseline, retryOneProvenUnwrittenSpotifyClaim } from "../downtifyNativeImportLedger";
import {
    getNativeAutoImportStatus, setNativeAutoImport, retrySafeSpotifyIdentityClaim,
    diagnoseWaitingNativeOriginal,
} from "../downtifyNativeAutoImportSettings";

jest.mock("../../config", () => ({ config: { music: { musicPath: "/music" } } }));
jest.mock("../downtifyNativeMountProof", () => ({
    initializeNativeMusicVolume: jest.fn(),
    verifyNativeMusicVolume: jest.fn(),
}));
jest.mock("../../utils/db", () => ({
    prisma: {
        downtifyIntegration: {
            findUnique: jest.fn(), updateMany: jest.fn(),
        },
        downtifyNativeImport: { findFirst: jest.fn() },
    },
}));
jest.mock("../downtifyIntegrationSettings", () => ({
    getDowntifyRuntimeEnv: jest.fn(),
}));
jest.mock("../downtifyNativeOriginalTransport", () => ({
    getVerifiedNativeImportQueue: jest.fn(),
    getVerifiedNativeLibraryChanges: jest.fn(),
    openNativeDowntifyOriginal: jest.fn(),
}));
jest.mock("../downtifyNativeImportLedger", () => ({
    getNativeImportSummary: jest.fn(),
    recordNativeBaseline: jest.fn(),
    retryOneProvenUnwrittenSpotifyClaim: jest.fn(),
}));

const find = prisma.downtifyIntegration.findUnique as jest.Mock;
const update = prisma.downtifyIntegration.updateMany as jest.Mock;
const runtime = getDowntifyRuntimeEnv as jest.Mock;
const queue = getVerifiedNativeImportQueue as jest.Mock;
const library = getVerifiedNativeLibraryChanges as jest.Mock;
const baseline = recordNativeBaseline as jest.Mock;
const summary = getNativeImportSummary as jest.Mock;
const safeRetry = retryOneProvenUnwrittenSpotifyClaim as jest.Mock;
const sourceGet = openNativeDowntifyOriginal as jest.Mock;
const waitingFind = prisma.downtifyNativeImport.findFirst as jest.Mock;
const serverId = "server_identity_123";
const PROOF = "11111111-1111-4111-8111-111111111111";
const initVolume = initializeNativeMusicVolume as jest.Mock;
const verifyVolume = verifyNativeMusicVolume as jest.Mock;
const admin = "owner-1";
let record = {
    ownerKimaUserId: admin, expectedServerId: serverId,
    expectedUserId: 7, enabled: true,
    nativeImportEnabled: false, nativeImportBaselineAt: null as Date | null,
    nativeImportLibraryCursor: null as number | null,
    nativeImportMountProof: null as string | null,
};

beforeEach(() => {
    jest.clearAllMocks();
    record = {
        ownerKimaUserId: admin, expectedServerId: serverId,
        expectedUserId: 7, enabled: true,
        nativeImportEnabled: false, nativeImportBaselineAt: null,
        nativeImportLibraryCursor: null,
        nativeImportMountProof: null,
    };
    find.mockImplementation(async () => record);
    update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(record, data);
        return { count: 1 };
    });
    runtime.mockResolvedValue({ KIMA_DOWNTIFY_ENABLED: "true" });
    queue.mockResolvedValue({ state: "ready", queue: [] });
    library.mockResolvedValue({state:"ready",cursor:7,full:true,tracks:[]});
    initVolume.mockResolvedValue(PROOF);
    verifyVolume.mockResolvedValue(true);
    safeRetry.mockResolvedValue("requeued");
    waitingFind.mockResolvedValue(null);
    sourceGet.mockResolvedValue({ state: "not_completed" });
    baseline.mockImplementation(async () => {
        record.nativeImportBaselineAt = new Date();
        record.nativeImportLibraryCursor = 7;
        record.nativeImportMountProof = PROOF;
        return { state: "recorded", count: 0, ambiguous: 0 };
    });
    summary.mockImplementation(async () => ({
        enabled: record.nativeImportEnabled,
        baselineReady: !!record.nativeImportBaselineAt &&
            record.nativeImportLibraryCursor !== null,
        waiting: 0, processing: 0, awaitingScan: 0, imported: 0, inReview: 0,
    }));
});

describe("One-switch Downtify native import activation", () => {
    it("starts OFF and returns no token, server ID or remote user ID", async () => {
        const response = await getNativeAutoImportStatus(admin);
        expect(response).toEqual({
            state: "paused", enabled: false, baselineReady: false,
            awaitingImport: 0, processing: 0, awaitingScan: 0,
            imported: 0, needsReview: 0,
            storageReady: true,
        });
        expect(JSON.stringify(response)).not.toContain(serverId);
        expect(runtime).not.toHaveBeenCalled();
        expect(queue).not.toHaveBeenCalled();
    });

    it("returns only owner-scoped aggregate counts, without remote details", async () => {
        summary.mockResolvedValueOnce({
            enabled: true, baselineReady: true, waiting: 3,
            processing: 2, awaitingScan: 4, imported: 5, inReview: 1,
        });
        const result = await getNativeAutoImportStatus(admin);
        expect(result).toEqual({
            state: "enabled", enabled: true, baselineReady: true,
            awaitingImport: 3, processing: 2, awaitingScan: 4,
            imported: 5, needsReview: 1, storageReady: true,
        });
        const payload = JSON.stringify(result);
        expect(payload).not.toContain(serverId);
        expect(payload).not.toContain(PROOF);
        expect(payload).not.toContain("remoteUserId");
    });

    it("refuses an incorrect administrator without contacting Downtify", async () => {
        await expect(setNativeAutoImport("other", true, true))
            .rejects.toMatchObject({ state: "unauthorized" });
        expect(runtime).not.toHaveBeenCalled();
        expect(queue).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });

    it("requires explicit single-writer confirmation BEFORE baseline or switch", async () => {
        await expect(setNativeAutoImport(admin, true, false))
            .rejects.toMatchObject({ state: "confirmation_required" });
        expect(runtime).not.toHaveBeenCalled();
        expect(queue).not.toHaveBeenCalled();
        expect(baseline).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });

    it("does not enable the importer if the paired device is disabled", async () => {
        record.enabled = false;
        await expect(setNativeAutoImport(admin, true, true))
            .rejects.toMatchObject({ state: "pairing_disabled" });
        expect(runtime).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });

    it("records current completed jobs as baseline before enabling anything", async () => {
        const result = await setNativeAutoImport(admin, true, true);
        expect(result).toEqual({
            state: "enabled", enabled: true, baselineReady: true,
            awaitingImport: 0, processing: 0, awaitingScan: 0,
            imported: 0, needsReview: 0,
            storageReady: true,
        });
        expect(queue).toHaveBeenCalledTimes(1);
        expect(baseline).toHaveBeenCalledWith({
            kimaUserId: admin, remoteServerId: serverId, remoteUserId: 7,
        }, [], 7, PROOF);
        expect(library).toHaveBeenCalledWith(admin, 0, expect.any(Object));
        expect(update).toHaveBeenCalledWith({
            where: expect.objectContaining({
                nativeImportEnabled: false,
                ownerKimaUserId: admin, nativeImportBaselineAt: { not: null },
            }),
            data: { nativeImportEnabled: true },
        });
    });

    it("fails closed on an incomplete remote queue snapshot", async () => {
        queue.mockResolvedValueOnce({ state: "unavailable", queue: [] });
        await expect(setNativeAutoImport(admin, true, true))
            .rejects.toMatchObject({ state: "source_unavailable" });
        expect(baseline).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
    });

    it("never enables native importing on an ambiguous baseline", async () => {
        baseline.mockResolvedValueOnce({ state: "invalid_snapshot", count: 0, ambiguous: 2 });
        await expect(setNativeAutoImport(admin, true, true))
            .rejects.toMatchObject({ state: "invalid_baseline" });
        expect(update).not.toHaveBeenCalled();
    });

    it("does not silently enable after another request changed pairing", async () => {
        update.mockResolvedValueOnce({ count: 0 });
        await expect(setNativeAutoImport(admin, true, true))
            .rejects.toMatchObject({ state: "changed_during_setup" });
    });

    it("pauses new work without changing the historic baseline or deleting files", async () => {
        record.nativeImportEnabled = true;
        record.nativeImportBaselineAt = new Date();
        record.nativeImportLibraryCursor = 7;
        record.nativeImportMountProof = PROOF;
        const state = await setNativeAutoImport(admin, false, false);
        expect(state.enabled).toBe(false);
        expect(state.baselineReady).toBe(true);
        expect(update).toHaveBeenCalledWith({
            where: { id: "default", ownerKimaUserId: admin },
            data: { nativeImportEnabled: false },
        });
        expect(runtime).not.toHaveBeenCalled();
        expect(queue).not.toHaveBeenCalled();
    });

    it("reports unavailable music storage without exposing the private volume identity", async () => {
        record.nativeImportBaselineAt = new Date();
        record.nativeImportLibraryCursor = 7;
        record.nativeImportMountProof = PROOF;
        record.nativeImportEnabled = true;
        verifyVolume.mockResolvedValueOnce(false);
        const result=await getNativeAutoImportStatus(admin);
        expect(result).toMatchObject({
            state:"enabled",enabled:true,storageReady:false,
        });
        expect(JSON.stringify(result)).not.toContain(PROOF);
    });

    it("never enables the importer while the original DAS volume proof is missing", async () => {
        record.nativeImportBaselineAt = new Date();
        record.nativeImportLibraryCursor = 7;
        record.nativeImportMountProof = PROOF;
        verifyVolume.mockResolvedValueOnce(false);
        await expect(setNativeAutoImport(admin,true,true))
            .rejects.toMatchObject({state:"storage_unavailable"});
        expect(update).not.toHaveBeenCalled();
        expect(queue).not.toHaveBeenCalled();
        expect(baseline).not.toHaveBeenCalled();
    });
    it("does not create a volume marker for an unavailable remote source", async () => {
        queue.mockResolvedValueOnce({state:"unavailable",queue:[]});
        await expect(setNativeAutoImport(admin,true,true))
            .rejects.toMatchObject({state:"source_unavailable"});
        expect(initVolume).not.toHaveBeenCalled();
    });

    it("does not reseed a complete baseline when a paused importer is re-enabled", async () => {
        record.nativeImportBaselineAt = new Date();
        record.nativeImportLibraryCursor = 7;
        record.nativeImportMountProof = PROOF;
        await setNativeAutoImport(admin, true, true);
        expect(baseline).not.toHaveBeenCalled();
        expect(queue).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalledTimes(1);
    });
});
describe("Operator-authorized safe Spotify recovery", () => {
    function enabled() {
        record.nativeImportEnabled=true;
        record.nativeImportBaselineAt=new Date("2026-11-08");
        record.nativeImportLibraryCursor=12;
        record.nativeImportMountProof=PROOF;
    }
    it("refuses attempts by a different admin or without explicit consent", async () => {
        enabled();
        await expect(retrySafeSpotifyIdentityClaim(admin,false))
            .rejects.toMatchObject({state:"confirmation_required"});
        await expect(retrySafeSpotifyIdentityClaim("stranger",true))
            .rejects.toMatchObject({state:"unauthorized"});
        expect(safeRetry).not.toHaveBeenCalled();
    });
    it("refuses a stopped importer or a missing music volume", async () => {
        await expect(retrySafeSpotifyIdentityClaim(admin,true))
            .rejects.toMatchObject({state:"pairing_disabled"});
        enabled();
        verifyVolume.mockResolvedValueOnce(false);
        await expect(retrySafeSpotifyIdentityClaim(admin,true))
            .rejects.toMatchObject({state:"storage_unavailable"});
        expect(safeRetry).not.toHaveBeenCalled();
    });
    it("retries only the linked owner's narrowly proven prewrite claim", async () => {
        enabled();
        expect(await retrySafeSpotifyIdentityClaim(admin,true))
            .toEqual({state:"requeued"});
        expect(safeRetry).toHaveBeenCalledWith({
            kimaUserId:admin,remoteServerId:serverId,remoteUserId:7,
        });
        expect(update).not.toHaveBeenCalled();
        expect(runtime).not.toHaveBeenCalled();
        expect(queue).not.toHaveBeenCalled();
    });
});



describe("Owner-scoped read-only diagnostic of an actual pending source", () => {
    function enabled() {
        record.nativeImportEnabled = true;
        record.nativeImportBaselineAt = new Date("2026-11-07");
        record.nativeImportLibraryCursor = 10;
        record.nativeImportMountProof = PROOF;
    }

    it("never contacts Downtify for unpaired, other owner, disabled or missing music volume", async () => {
        enabled();
        await expect(diagnoseWaitingNativeOriginal("another-admin"))
            .rejects.toMatchObject({ state: "unauthorized" });
        record.nativeImportEnabled = false;
        expect(await diagnoseWaitingNativeOriginal(admin))
            .toEqual({ state: "paused" });
        record.nativeImportEnabled = true;
        verifyVolume.mockResolvedValueOnce(false);
        expect(await diagnoseWaitingNativeOriginal(admin))
            .toEqual({ state: "storage_unavailable" });
        expect(waitingFind).not.toHaveBeenCalled();
        expect(sourceGet).not.toHaveBeenCalled();
    });

    it("does not query the remote server when no eligible owner-bound waiting row exists", async () => {
        enabled();
        expect(await diagnoseWaitingNativeOriginal(admin))
            .toEqual({ state: "none" });
        expect(sourceGet).not.toHaveBeenCalled();
        const where = waitingFind.mock.calls[0][0].where;
        expect(where).toMatchObject({
            ownerKimaUserId: admin, remoteServerId: serverId,
            remoteUserId: 7, status: "ready",
        });
        expect(where.discoveredAt.gt).toEqual(record.nativeImportBaselineAt);
    });

    it("reports a missing completed queue job without exposing its Spotify ID or device token", async () => {
        enabled();
        waitingFind.mockResolvedValueOnce({spotifyTrackId:"0123456789ABCDEFGHIJKL"});
        const result = await diagnoseWaitingNativeOriginal(admin);
        expect(result).toEqual({ state: "not_completed" });
        expect(sourceGet).toHaveBeenCalledWith(
            admin, "0123456789ABCDEFGHIJKL",
            { KIMA_DOWNTIFY_ENABLED: "true" },
        );
        expect(JSON.stringify(result)).not.toContain("0123456789ABCDEFGHIJKL");
        expect(JSON.stringify(result)).not.toContain(serverId);
        expect(update).not.toHaveBeenCalled();
        expect(safeRetry).not.toHaveBeenCalled();
        expect(queue).not.toHaveBeenCalled();
        expect(library).not.toHaveBeenCalled();
    });

    it("closes a successful remote HTTP stream without consuming bytes or importing files", async () => {
        enabled();
        waitingFind.mockResolvedValueOnce({spotifyTrackId:"0123456789ABCDEFGHIJKL"});
        const cancel = jest.fn();
        const chunks = { [Symbol.asyncIterator]: jest.fn() };
        sourceGet.mockResolvedValueOnce({state:"ready",cancel,chunks});
        expect(await diagnoseWaitingNativeOriginal(admin))
            .toEqual({ state: "ready" });
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(chunks[Symbol.asyncIterator]).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
        expect(safeRetry).not.toHaveBeenCalled();
    });

    it("preserves distinct remote source failure states without exposing raw errors", async () => {
        enabled();
        for (const state of ["stream_unavailable","not_in_library","ambiguous_job","invalid_metadata","unavailable"]) {
            waitingFind.mockResolvedValueOnce({spotifyTrackId:"0123456789ABCDEFGHIJKL"});
            sourceGet.mockResolvedValueOnce({state});
            expect(await diagnoseWaitingNativeOriginal(admin)).toEqual({state});
        }
    });
});
