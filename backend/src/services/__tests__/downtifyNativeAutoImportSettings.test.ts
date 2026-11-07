import { prisma } from "../../utils/db";
import {
    initializeNativeMusicVolume, verifyNativeMusicVolume,
} from "../downtifyNativeMountProof";
import { getDowntifyRuntimeEnv } from "../downtifyIntegrationSettings";
import {
    getVerifiedNativeImportQueue, getVerifiedNativeLibraryChanges,
} from "../downtifyNativeOriginalTransport";
import { getNativeImportSummary, recordNativeBaseline } from "../downtifyNativeImportLedger";
import {
    getNativeAutoImportStatus, setNativeAutoImport,
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
    },
}));
jest.mock("../downtifyIntegrationSettings", () => ({
    getDowntifyRuntimeEnv: jest.fn(),
}));
jest.mock("../downtifyNativeOriginalTransport", () => ({
    getVerifiedNativeImportQueue: jest.fn(),
    getVerifiedNativeLibraryChanges: jest.fn(),
}));
jest.mock("../downtifyNativeImportLedger", () => ({
    getNativeImportSummary: jest.fn(),
    recordNativeBaseline: jest.fn(),
}));

const find = prisma.downtifyIntegration.findUnique as jest.Mock;
const update = prisma.downtifyIntegration.updateMany as jest.Mock;
const runtime = getDowntifyRuntimeEnv as jest.Mock;
const queue = getVerifiedNativeImportQueue as jest.Mock;
const library = getVerifiedNativeLibraryChanges as jest.Mock;
const baseline = recordNativeBaseline as jest.Mock;
const summary = getNativeImportSummary as jest.Mock;
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
        waiting: 0, inReview: 0,
    }));
});

describe("One-switch Downtify native import activation", () => {
    it("starts OFF and returns no token, server ID or remote user ID", async () => {
        const response = await getNativeAutoImportStatus(admin);
        expect(response).toEqual({
            state: "paused", enabled: false, baselineReady: false,
            awaitingImport: 0, needsReview: 0, legacyHostVerified: false,
            storageReady: true,
        });
        expect(JSON.stringify(response)).not.toContain(serverId);
        expect(runtime).not.toHaveBeenCalled();
        expect(queue).not.toHaveBeenCalled();
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
            awaitingImport: 0, needsReview: 0, legacyHostVerified: false,
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
