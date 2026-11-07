import { createHash } from "crypto";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import { prisma } from "../../utils/db";
import {
    claimNativeImport,
    confirmNativeIndexed,
    discoverNativeCompleted,
    getNativeImportSummary,
    holdNativeImportForReview,
    releaseNativeUnwrittenClaim,
    recordNativePublished,
    recordNativeBaseline,
    selectOwnedCompletedSpotifyJobs, selectFreshNativeSongs,
} from "../downtifyNativeImportLedger";

jest.mock("../../utils/db", () => ({
    prisma: {
        downtifyIntegration: { findUnique: jest.fn(), updateMany: jest.fn() },
        downtifyNativeImport: {
            findFirst: jest.fn(), createMany: jest.fn(),
            updateMany: jest.fn(), groupBy: jest.fn(),
        },
        track: { findUnique: jest.fn() },
        $transaction: jest.fn(),
    },
}));

const paired = prisma.downtifyIntegration.findUnique as jest.Mock;
const integrationUpdate = prisma.downtifyIntegration.updateMany as jest.Mock;
const importsCreate = prisma.downtifyNativeImport.createMany as jest.Mock;
const importsFind = prisma.downtifyNativeImport.findFirst as jest.Mock;
const importsUpdate = prisma.downtifyNativeImport.updateMany as jest.Mock;
const importsGroups = prisma.downtifyNativeImport.groupBy as jest.Mock;
const trackFind = prisma.track.findUnique as jest.Mock;
const transaction = prisma.$transaction as jest.Mock;
const owner = {
    kimaUserId: "admin-1",
    remoteServerId: "server_identity_123",
    remoteUserId: 7,
};
const SPOTIFY_ID = "0123456789ABCDEFGHIJKL";
const VOLUME_PROOF = "11111111-1111-4111-8111-111111111111";
const OTHER_SPOTIFY_ID = "123456789ABCDEFGHIJKLM";
const queue = (ids: number[] = [7], songId = SPOTIFY_ID) => [{
    status: "done",
    user_ids: ids,
    filename: "untrusted/folder/private.flac",
    song: { source: "spotify", song_id: songId },
}];
const pairing = (enabled = false, baselineAt: Date | null = null) => ({
    nativeImportLibraryCursor: baselineAt ? 8 : null,
    nativeImportMountProof: baselineAt ? VOLUME_PROOF : null,
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

describe("New-only mobile library cursors", () => {
    it("excludes completed jobs that did not arrive as a new library entry", () => {
        const now = new Date();
        expect(selectFreshNativeSongs(queue(), [], 7, now).songs).toEqual([]);
        expect(selectFreshNativeSongs(queue(), [{
            id: "t0123456789abcdef", file: "untrusted/folder/private.flac",
            added: Math.floor(now.getTime()/1000)-86400,
        }], 7, now).songs).toEqual([]);
    });
    it("admits only a newly added track with an exact owner-bound job and timestamp", () => {
        const now = new Date();
        expect(selectFreshNativeSongs(queue(), [{
            id: "t0123456789abcdef", file: "untrusted/folder/private.flac",
            added: Math.floor(now.getTime()/1000)+60,
        }], 7, now).songs).toEqual([
            {spotifyTrackId:SPOTIFY_ID,source:"spotify"},
        ]);
    });
    it("defers a new library event while the owner's Spotify job still downloads", () => {
        const now = new Date();
        const changed = [{
            id:"t0123456789abcdef",file:"untrusted/folder/private.flac",
            added: Math.floor(now.getTime()/1000)+60,
        }];
        const active = [{
            ...queue()[0], status:"downloading", filename:null,
        }];
        const selection = selectFreshNativeSongs(active, changed, 7, now);
        expect(selection.songs).toEqual([]);
        expect(selection.deferred).toBe(1);
        expect(selectFreshNativeSongs(queue(), changed, 7, now).songs)
            .toEqual([{spotifyTrackId:SPOTIFY_ID,source:"spotify"}]);
    });
    it("does not defer for a foreign account's active download", () => {
        const now = new Date();
        const changed = [{
            id:"t0123456789abcdef",file:"untrusted/folder/private.flac",
            added: Math.floor(now.getTime()/1000)+60,
        }];
        const active = [{
            ...queue()[0], status:"downloading", filename:null, user_ids:[8],
        }];
        const selection = selectFreshNativeSongs(active,changed,7,now);
        expect(selection.deferred).toBe(0);
    });
    it("never treats a pre-activation recording as new even within thirty seconds", () => {
        const now = new Date();
        const justBefore = [{
            id:"t0123456789abcdef",file:"untrusted/folder/private.flac",
            added: Math.floor(now.getTime()/1000)-1,
        }];
        expect(selectFreshNativeSongs(queue(),justBefore,7,now).songs).toEqual([]);
    });
    it("rejects duplicate library filenames and jobs from a different remote user", () => {
        const now = new Date();
        const row = {id:"t0123456789abcdef",file:"untrusted/folder/private.flac",
            added:Math.floor(now.getTime()/1000)+60};
        expect(selectFreshNativeSongs(queue([8]), [row], 7, now).songs).toEqual([]);
        expect(selectFreshNativeSongs(queue(), [row,row], 7, now).songs).toEqual([]);
    });
});

describe("Durable native import baseline", () => {
    it("stores all pre-existing completed jobs as baseline in one transaction", async () => {
        const result = await recordNativeBaseline(owner, queue(), 8, VOLUME_PROOF);
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
        expect((await recordNativeBaseline(owner, queue(), 8, VOLUME_PROOF)).state).toBe("blocked");
        paired.mockResolvedValueOnce(pairing(true, new Date()));
        expect((await recordNativeBaseline(owner, queue(), 8, VOLUME_PROOF)).state).toBe("blocked");
        expect(transaction).not.toHaveBeenCalled();
    });

    it("fails closed if the pairing changed or no longer belongs to this user", async () => {
        paired.mockResolvedValueOnce({ ...pairing(), expectedUserId: 200 });
        expect((await recordNativeBaseline(owner, queue(), 8, VOLUME_PROOF)).state).toBe("blocked");
        expect(transaction).not.toHaveBeenCalled();
    });

    it("does not seed a partial baseline with an ambiguous old job", async () => {
        expect((await recordNativeBaseline(owner, [...queue(), ...queue()], 8, VOLUME_PROOF)).state)
            .toBe("invalid_snapshot");
        expect(transaction).not.toHaveBeenCalled();
    });

    it("rolls back on compare-and-swap conflict", async () => {
        integrationUpdate.mockResolvedValueOnce({ count: 0 });
        expect((await recordNativeBaseline(owner, queue(), 8, VOLUME_PROOF)).state).toBe("blocked");
        expect(importsCreate).not.toHaveBeenCalled();
    });

    it("accepts an empty baseline without any file or remote changes", async () => {
        expect(await recordNativeBaseline(owner, [], 8, VOLUME_PROOF)).toMatchObject({
            state: "recorded", count: 0,
        });
        expect(importsCreate).not.toHaveBeenCalled();
    });
});

describe("Native import discovery and durable claims", () => {
    it("cannot discover new songs while disabled or before baseline", async () => {
        expect((await discoverNativeCompleted(owner, queue(), {cursor:9,full:false,tracks:[{
    id:"t0123456789abcdef",file:"untrusted/folder/private.flac",
    added:Math.floor(Date.now()/1000)+60,
}]})).state).toBe("blocked");
        expect(importsCreate).not.toHaveBeenCalled();
        paired.mockResolvedValueOnce(pairing(true, null));
        expect((await discoverNativeCompleted(owner, queue(), {cursor:9,full:false,tracks:[{
    id:"t0123456789abcdef",file:"untrusted/folder/private.flac",
    added:Math.floor(Date.now()/1000)+60,
}]})).state).toBe("blocked");
        expect(importsCreate).not.toHaveBeenCalled();
    });

    it("keeps the stored cursor unchanged while a recent owner download is active", async () => {
        paired.mockResolvedValueOnce(pairing(true,new Date()));
        const newTrack={id:"t0123456789abcdef",file:"untrusted/folder/private.flac",
            added:Math.floor(Date.now()/1000)+60};
        const downloading=[{...queue()[0],status:"downloading",filename:null}];
        const result=await discoverNativeCompleted(owner,downloading,
            {cursor:9,full:false,tracks:[newTrack]});
        expect(result).toEqual({state:"deferred",count:0,ambiguous:0});
        expect(transaction).not.toHaveBeenCalled();
        expect(integrationUpdate).not.toHaveBeenCalled();
        expect(importsCreate).not.toHaveBeenCalled();
    });
    it("uses a unique createMany skipDuplicates instead of resetting existing jobs", async () => {
        paired.mockResolvedValueOnce(pairing(true, new Date()));
        const result = await discoverNativeCompleted(owner, queue(), {cursor:9,full:false,tracks:[{
    id:"t0123456789abcdef",file:"untrusted/folder/private.flac",
    added:Math.floor(Date.now()/1000)+60,
}]});
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

    it("releases only explicitly unwritten claims, preserving durable backoff history", async () => {
        const token="12345678-1234-1234-1234-123456789abc";
        const changed=await releaseNativeUnwrittenClaim(
            owner,"clvabc1234cuid",token,"remote_temporarily_unavailable",
        );
        expect(changed).toBe(true);
        expect(importsUpdate).toHaveBeenCalledWith({
            where:expect.objectContaining({
                id:"clvabc1234cuid",status:"claimed",
                claimToken:token,ownerKimaUserId:owner.kimaUserId,
                remoteServerId:owner.remoteServerId,
            }),
            data:{
                status:"ready",claimToken:null,
                reviewReason:"remote_temporarily_unavailable",
            },
        });
        expect(importsUpdate.mock.calls[0][0].data.claimedAt).toBeUndefined();
    });
    it("does not automatically release a claim after an unknown DB outcome", async () => {
        importsUpdate.mockRejectedValueOnce(new Error("temporary database outage"));
        expect(await releaseNativeUnwrittenClaim(
            owner,"clvabc1234cuid",
            "12345678-1234-1234-1234-123456789abc",
            "storage_temporarily_unavailable",
        )).toBe(false);
    });
    it("applies the same 15-minute cooldown to findFirst and claim CAS", async () => {
        paired.mockResolvedValue(pairing(true,new Date()));
        const result=await claimNativeImport(owner,"clvabc1234cuid");
        expect(result.state).toBe("claimed");
        const findQuery=importsFind.mock.calls[0][0].where;
        const updateQuery=importsUpdate.mock.calls[0][0].where;
        expect(findQuery.OR).toBeDefined();
        expect(updateQuery.OR).toBeDefined();
        expect(findQuery.OR[0]).toEqual({claimedAt:null});
        expect(findQuery.OR[1].claimedAt.lt).toBeInstanceOf(Date);
        expect(findQuery.OR[1].claimedAt.lt.getTime()).toBeLessThan(Date.now());
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


describe("Native import publication ledger and physical Kima index receipt", () => {
    const token = "12345678-1234-1234-1234-123456789abc";
    const id = "clvabc1234cuid";
    const relative = "Singles/Artist/Track.flac";
    const audio = Buffer.concat([Buffer.from("fLaC"), Buffer.alloc(512, 0x55)]);
    const sha = createHash("sha256").update(audio).digest("hex");
    let musicRoot = "";
    const baseFile = () => path.join(musicRoot, "Singles", "Artist", "Track.flac");

    beforeEach(async () => {
        musicRoot = await fs.mkdtemp(path.join(tmpdir(), "kima-index-receipt-"));
        await fs.mkdir(path.join(musicRoot, "Singles", "Artist"), { recursive: true });
        await fs.writeFile(baseFile(), audio, { mode: 0o600 });
        importsFind.mockResolvedValue({
            outputRelativePath: relative,
            expectedBytes: audio.length,
            fullSha256: sha,
        });
        trackFind.mockResolvedValue({
            id: "local-scanned-track-1", fileSize: audio.length,
            missingSince: null, corrupt: false,
            album: { location: "LIBRARY" },
        });
    });
    afterEach(async () => {
        await fs.rm(musicRoot, { recursive: true, force: true });
    });

    it("records a published file while preserving an unverified scanner state", async () => {
        expect(await recordNativePublished(owner, id, token, {
            expectedBytes: audio.length,
            relativeTarget: relative, fullSha256: sha,
            remoteLibraryTrackId: "t0123456789abcdef",
        })).toBe(true);
        expect(importsUpdate).toHaveBeenCalledWith({
            where: expect.objectContaining({
                id, claimToken: token, status: "claimed",
                ownerKimaUserId: "admin-1",
            }),
            data: expect.objectContaining({
                status: "published_pending_scan",
                fullSha256: sha,
                outputRelativePath: relative,
            }),
        });
    });

    it("rejects unsafe paths or missing source identity even before database writes", async () => {
        const result = await recordNativePublished(owner, id, token, {
            expectedBytes: audio.length,
            relativeTarget: "../.env", fullSha256: sha,
            remoteLibraryTrackId: "t0123456789abcdef",
        });
        expect(result).toBe(false);
        expect(importsUpdate).not.toHaveBeenCalled();
    });

    it("marks an import complete only after its Kima Track and physical hash match", async () => {
        const receipt = await confirmNativeIndexed(owner, id, token, musicRoot);
        expect(receipt).toEqual({
            state: "imported", indexedTrackId: "local-scanned-track-1",
        });
        expect(trackFind).toHaveBeenCalledWith({
            where: { filePath: relative },
            select: {
                id: true, fileSize: true, missingSince: true,
                corrupt: true, album: { select: { location: true } },
            },
        });
        expect(importsUpdate).toHaveBeenCalledWith({
            where: expect.objectContaining({
                status: "published_pending_scan",
                claimToken: token, fullSha256: sha,
            }),
            data: {
                status: "imported",
                indexedTrackId: "local-scanned-track-1",
                reviewReason: null,
            },
        });
    });

    it("holds a missing or unindexed local track rather than claiming imported", async () => {
        trackFind.mockResolvedValueOnce(null);
        expect((await confirmNativeIndexed(owner, id, token, musicRoot)).state)
            .toBe("not_indexed");
        expect(importsUpdate).not.toHaveBeenCalled();
    });

    it("rejects an absent DAS file without touching the Kima track row", async () => {
        await fs.unlink(baseFile());
        expect((await confirmNativeIndexed(owner, id, token, musicRoot)).state)
            .toBe("not_verified");
        expect(importsUpdate).not.toHaveBeenCalled();
    });

    it("does not accept a different recording under an identical filename", async () => {
        await fs.writeFile(baseFile(), Buffer.alloc(audio.length, 0x33));
        expect((await confirmNativeIndexed(owner, id, token, musicRoot)).state)
            .toBe("not_verified");
        expect(importsUpdate).not.toHaveBeenCalled();
    });

    it("rejects a symlink to a file outside the intended library inode", async () => {
        const external = path.join(musicRoot, "Other.flac");
        await fs.rename(baseFile(), external);
        await fs.symlink(external, baseFile());
        expect((await confirmNativeIndexed(owner, id, token, musicRoot)).state)
            .toBe("not_verified");
        expect(importsUpdate).not.toHaveBeenCalled();
    });

    it("does not mark a corrupt Kima Track, missing association, or catalog-only album as imported", async () => {
        for(const data of [
            { id: "x", fileSize: audio.length, missingSince: new Date(), corrupt: false,
                album: { location: "LIBRARY" } },
            { id: "x", fileSize: audio.length, missingSince: null, corrupt: true,
                album: { location: "LIBRARY" } },
            { id: "x", fileSize: audio.length, missingSince: null, corrupt: false,
                album: { location: "CATALOG" } },
        ]) {
            trackFind.mockResolvedValueOnce(data);
            expect((await confirmNativeIndexed(owner, id, token, musicRoot)).state)
                .toBe("not_indexed");
        }
        expect(importsUpdate).not.toHaveBeenCalled();
    });

    it("cannot mark imported if another worker changed the claim after scanning", async () => {
        importsUpdate.mockResolvedValueOnce({ count: 0 });
        expect((await confirmNativeIndexed(owner, id, token, musicRoot)).state)
            .toBe("blocked");
    });
});
