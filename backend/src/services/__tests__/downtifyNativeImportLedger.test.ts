import { prisma } from "../../utils/db";
import {
    claimNativeImport,
    discoverNativeCompleted,
    getNativeImportSummary,
    holdNativeImportForReview,
    recordNativeBaseline,
    selectOwnedCompletedSpotifyJobs,
} from "../downtifyNativeImportLedger";

jest.mock("../../utils/db", () => ({
    prisma: {
        downtifyIntegration: { findUnique: jest.fn(), updateMany: jest.fn() },
        downtifyNativeImport: {
            findFirst: jest.fn(), createMany: jest.fn(),
            updateMany: jest.fn(), groupBy: jest.fn(),
        },
        $transaction: jest.fn(),
    },
}));

const paired = prisma.downtifyIntegration.findUnique as jest.Mock;
const integrationUpdate = prisma.downtifyIntegration.updateMany as jest.Mock;
const importsCreate = prisma.downtifyNativeImport.createMany as jest.Mock;
const importsFind = prisma.downtifyNativeImport.findFirst as jest.Mock;
const importsUpdate = prisma.downtifyNativeImport.updateMany as jest.Mock;
const importsGroups = prisma.downtifyNativeImport.groupBy as jest.Mock;
const transaction = prisma.$transaction as jest.Mock;
const owner = {
    kimaUserId: "admin-1",
    remoteServerId: "server_identity_123",
    remoteUserId: 7,
};
const SPOTIFY_ID = "0123456789ABCDEFGHIJKL";
const OTHER_SPOTIFY_ID = "123456789ABCDEFGHIJKLM";
const queue = (ids: number[] = [7], songId = SPOTIFY_ID) => [{
    status: "done",
    user_ids: ids,
    filename: "untrusted/folder/private.flac",
    song: { source: "spotify", song_id: songId },
}];
const pairing = (enabled = false, baselineAt: Date | null = null) => ({
    ownerKimaUserId: owner.kimaUserId,
    expectedServerId: owner.remoteServerId,
    expectedUserId: owner.remoteUserId,
    enabled: true,
    nativeImportEnabled: enabled,
    nativeImportBaselineAt: baselineAt,
});

beforeEach(() => {
    jest.clearAllMocks();
    paired.mockResolvedValue(pairing());
    integrationUpdate.mockResolvedValue({ count: 1 });
    importsCreate.mockResolvedValue({ count: 1 });
    importsFind.mockResolvedValue({ id: "clvabc1234cuid", status: "ready", spotifyTrackId: SPOTIFY_ID });
    importsUpdate.mockResolvedValue({ count: 1 });
    importsGroups.mockResolvedValue([]);
    transaction.mockImplementation(async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma));
});

describe("Native Downtify import queue selection", () => {
    it("only accepts completed owner-bound Spotify jobs", () => {
        expect(selectOwnedCompletedSpotifyJobs([
            ...queue(),
            ...queue([8], OTHER_SPOTIFY_ID),
            { ...queue()[0], status: "downloading" },
            { ...queue()[0], song: { source: "deezer", song_id: OTHER_SPOTIFY_ID } },
            { ...queue()[0], song: { source: "spotify", song_id: "invalid" } },
        ], 7)).toEqual({
            state: "ok",
            songs: [{ spotifyTrackId: SPOTIFY_ID, source: "spotify" }],
            ambiguous: 0,
        });
    });

    it("rejects invalid or unbounded queue snapshots", () => {
        expect(selectOwnedCompletedSpotifyJobs({}, 7).state).toBe("invalid_snapshot");
        expect(selectOwnedCompletedSpotifyJobs(new Array(5001).fill(null), 7).state)
            .toBe("invalid_snapshot");
        expect(selectOwnedCompletedSpotifyJobs(queue(), -1).state).toBe("invalid_snapshot");
    });

    it("ignores ambiguous duplicate rows instead of guessing which belongs to an owner", () => {
        const result = selectOwnedCompletedSpotifyJobs([...queue(), ...queue()], 7);
        expect(result.songs).toEqual([]);
        expect(result.ambiguous).toBe(1);
    });
});

describe("Durable native import baseline", () => {
    it("stores all pre-existing completed jobs as baseline in one transaction", async () => {
        const result = await recordNativeBaseline(owner, queue());
        expect(result).toEqual({ state: "recorded", count: 1, ambiguous: 0 });
        expect(transaction).toHaveBeenCalledTimes(1);
        expect(integrationUpdate).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                ownerKimaUserId: "admin-1",
                expectedServerId: owner.remoteServerId,
                nativeImportEnabled: false, nativeImportBaselineAt: null,
            }),
        }));
        expect(importsCreate).toHaveBeenCalledWith({
            data: [{
                ownerKimaUserId: "admin-1",
                remoteServerId: owner.remoteServerId,
                remoteUserId: 7,
                spotifyTrackId: SPOTIFY_ID,
                status: "baseline",
            }],
            skipDuplicates: true,
        });
    });

    it("does not reset a baseline or seed history when already initialized or enabled", async () => {
        paired.mockResolvedValueOnce(pairing(false, new Date()));
        expect((await recordNativeBaseline(owner, queue())).state).toBe("blocked");
        paired.mockResolvedValueOnce(pairing(true, new Date()));
        expect((await recordNativeBaseline(owner, queue())).state).toBe("blocked");
        expect(transaction).not.toHaveBeenCalled();
    });

    it("fails closed if the pairing changed or no longer belongs to this user", async () => {
        paired.mockResolvedValueOnce({ ...pairing(), expectedUserId: 200 });
        expect((await recordNativeBaseline(owner, queue())).state).toBe("blocked");
        expect(transaction).not.toHaveBeenCalled();
    });

    it("does not seed a partial baseline with an ambiguous old job", async () => {
        expect((await recordNativeBaseline(owner, [...queue(), ...queue()])).state)
            .toBe("invalid_snapshot");
        expect(transaction).not.toHaveBeenCalled();
    });

    it("rolls back on compare-and-swap conflict", async () => {
        integrationUpdate.mockResolvedValueOnce({ count: 0 });
        expect((await recordNativeBaseline(owner, queue())).state).toBe("blocked");
        expect(importsCreate).not.toHaveBeenCalled();
    });

    it("accepts an empty baseline without any file or remote changes", async () => {
        expect(await recordNativeBaseline(owner, [])).toMatchObject({
            state: "recorded", count: 0,
        });
        expect(importsCreate).not.toHaveBeenCalled();
    });
});

describe("Native import discovery and durable claims", () => {
    it("cannot discover new songs while disabled or before baseline", async () => {
        expect((await discoverNativeCompleted(owner, queue())).state).toBe("blocked");
        expect(importsCreate).not.toHaveBeenCalled();
        paired.mockResolvedValueOnce(pairing(true, null));
        expect((await discoverNativeCompleted(owner, queue())).state).toBe("blocked");
        expect(importsCreate).not.toHaveBeenCalled();
    });

    it("uses a unique createMany skipDuplicates instead of resetting existing jobs", async () => {
        paired.mockResolvedValueOnce(pairing(true, new Date()));
        const result = await discoverNativeCompleted(owner, queue());
        expect(result).toEqual({ state: "recorded", count: 1, ambiguous: 0 });
        expect(importsCreate).toHaveBeenCalledWith({
            data: [{
                ownerKimaUserId: owner.kimaUserId,
                remoteServerId: owner.remoteServerId,
                remoteUserId: 7,
                spotifyTrackId: SPOTIFY_ID,
                status: "ready",
            }],
            skipDuplicates: true,
        });
    });

    it("claims exactly one ready row using an atomic status compare-and-swap", async () => {
        paired.mockResolvedValue(pairing(true, new Date()));
        const result = await claimNativeImport(owner, "clvabc1234cuid");
        expect(result.state).toBe("claimed");
        if (result.state !== "claimed") throw new Error("unreachable");
        expect(result.spotifyTrackId).toBe(SPOTIFY_ID);
        expect(result.claimToken).toMatch(/^[0-9a-f-]{36}$/);
        expect(importsUpdate).toHaveBeenCalledWith({
            where: expect.objectContaining({
                status: "ready", ownerKimaUserId: "admin-1",
                remoteServerId: owner.remoteServerId, remoteUserId: 7,
            }),
            data: expect.objectContaining({
                status: "claimed", claimToken: result.claimToken,
            }),
        });
    });

    it("never double claims after a race or a restart", async () => {
        paired.mockResolvedValue(pairing(true, new Date()));
        importsUpdate.mockResolvedValueOnce({ count: 0 });
        expect((await claimNativeImport(owner, "clvabc1234cuid")).state)
            .toBe("claimed_elsewhere");
        importsFind.mockResolvedValueOnce({
            id: "clvabc1234cuid", status: "claimed", spotifyTrackId: SPOTIFY_ID,
        });
        expect((await claimNativeImport(owner, "clvabc1234cuid")).state)
            .toBe("claimed_elsewhere");
        expect(importsUpdate).toHaveBeenCalledTimes(1);
    });

    it("does not claim while disabled even if an import row is ready", async () => {
        expect((await claimNativeImport(owner, "clvabc1234cuid")).state).toBe("blocked");
        expect(importsUpdate).not.toHaveBeenCalled();
    });

    it("can hold a claimed row for human review but never reset it to ready", async () => {
        expect(await holdNativeImportForReview(
            owner, "clvabc1234cuid",
            "12345678-1234-1234-1234-123456789abc",
            "source_mismatch",
        )).toBe(true);
        expect(importsUpdate).toHaveBeenCalledWith({
            where: expect.objectContaining({
                status: "claimed", claimToken: "12345678-1234-1234-1234-123456789abc",
            }),
            data: { status: "uncertain", reviewReason: "source_mismatch" },
        });
        expect(importsUpdate).not.toHaveBeenCalledWith(expect.objectContaining({
            data: { status: "ready" },
        }));
    });

    it("summarizes the current owner without exposing remote IDs or filenames", async () => {
        paired.mockResolvedValueOnce(pairing(true, new Date()));
        importsGroups.mockResolvedValueOnce([
            { status: "ready", _count: { _all: 2 } },
            { status: "claimed", _count: { _all: 1 } },
            { status: "uncertain", _count: { _all: 3 } },
        ]);
        const result = await getNativeImportSummary(owner);
        expect(result).toEqual({
            enabled: true, baselineReady: true, waiting: 2, inReview: 4,
        });
        expect(JSON.stringify(result)).not.toContain(owner.remoteServerId);
    });
});
