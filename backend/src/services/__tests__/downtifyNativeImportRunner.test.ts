import { prisma } from "../../utils/db";
import { spotifyService } from "../spotify";
import { getDowntifyRuntimeEnv } from "../downtifyIntegrationSettings";
import {
    getVerifiedNativeImportQueue, getVerifiedNativeLibraryChanges,
    openNativeDowntifyOriginal,
} from "../downtifyNativeOriginalTransport";
import {
    claimNativeImport, confirmNativeIndexed, discoverNativeCompleted,
    getNativeImportSummary, holdNativeImportForReview, recordNativePublished,
    releaseNativeUnwrittenClaim,
} from "../downtifyNativeImportLedger";
import { ensureNativeImportDestination, nativeImportDestination } from "../downtifyNativeImportWorkspace";
import { publishNativeAudio } from "../downtifyAtomicPublisher";
import { verifyNativeTemporaryRecording } from "../downtifyNativeAudioVerification";
import { requestScan } from "../../workers/scanRequest";
import { verifyNativeMusicVolume } from "../downtifyNativeMountProof";
import { runNativeImportCycle } from "../downtifyNativeImportRunner";

jest.mock("../../config", () => ({ config: { music: { musicPath: "/music" } } }));
jest.mock("../../utils/db", () => ({
    prisma: {
        downtifyIntegration: { findUnique: jest.fn() },
        downtifyNativeImport: { findMany: jest.fn() },
    },
}));
jest.mock("../spotify", () => ({
    spotifyService: { getTrackBySpotifyId: jest.fn() },
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
    claimNativeImport: jest.fn(),
    confirmNativeIndexed: jest.fn(),
    discoverNativeCompleted: jest.fn(),
    getNativeImportSummary: jest.fn(),
    holdNativeImportForReview: jest.fn(),
    releaseNativeUnwrittenClaim: jest.fn(),
    recordNativePublished: jest.fn(),
}));
jest.mock("../downtifyNativeImportWorkspace", () => ({
    ensureNativeImportDestination: jest.fn(),
    nativeImportDestination: jest.fn(),
}));
jest.mock("../downtifyAtomicPublisher", () => ({
    publishNativeAudio: jest.fn(),
}));
jest.mock("../downtifyNativeAudioVerification", () => ({
    verifyNativeTemporaryRecording: jest.fn(),
}));
jest.mock("../../workers/scanRequest", () => ({
    requestScan: jest.fn(),
}));
jest.mock("../downtifyNativeMountProof", () => ({
    verifyNativeMusicVolume: jest.fn(),
}));

const SPOTIFY = "0123456789ABCDEFGHIJKL";
const volumeProof = "11111111-1111-4111-8111-111111111111";
const owner = {
    kimaUserId: "kima-owner", remoteServerId: "test-server-001",
    remoteUserId: 9,
};
const row = {
    enabled: true, nativeImportEnabled: true,
    nativeImportBaselineAt: new Date("2026-11-07T17:00:00Z"),
    nativeImportLibraryCursor: 6,
    nativeImportMountProof: volumeProof,
    ownerKimaUserId: owner.kimaUserId, expectedServerId: owner.remoteServerId,
    expectedUserId: owner.remoteUserId,
};
const job = { id: "clvimport001", spotifyTrackId: SPOTIFY };
const claim = {
    state: "claimed", id: job.id,
    claimToken: "12345678-1234-1234-1234-123456789abc",
    spotifyTrackId: SPOTIFY,
};
const source = {
    state: "ready",
    remoteTrackId: "t0123456789abcdef",
    remoteFilename: "Songs/song.flac",
    title: "Test song", artist: "Example", album: "Example album",
    durationSeconds: 200, expectedBytes: 1024,
    chunks: (async function* () { yield Buffer.from("fLaC"); })(),
    cancel: jest.fn(),
    autoImportApproved: false, libraryImportVerified: false,
};
const mock = (thing: unknown) => thing as jest.Mock;
const pairing = mock(prisma.downtifyIntegration.findUnique);
const imports = mock(prisma.downtifyNativeImport.findMany);
const getRuntime = mock(getDowntifyRuntimeEnv);
const getQueue = mock(getVerifiedNativeImportQueue);
const getLibrary = mock(getVerifiedNativeLibraryChanges);
const discover = mock(discoverNativeCompleted);
const getSummary = mock(getNativeImportSummary);
const claimImport = mock(claimNativeImport);
const confirm = mock(confirmNativeIndexed);
const hold = mock(holdNativeImportForReview);
const safeRetry = mock(releaseNativeUnwrittenClaim);
const getSource = mock(openNativeDowntifyOriginal);
const getSpotify = mock(spotifyService.getTrackBySpotifyId);
const target = mock(nativeImportDestination);
const workspace = mock(ensureNativeImportDestination);
const publish = mock(publishNativeAudio);
const verify = mock(verifyNativeTemporaryRecording);
const markPublished = mock(recordNativePublished);
const scan = mock(requestScan);
const verifyVolume = mock(verifyNativeMusicVolume);

beforeEach(() => {
    jest.clearAllMocks();
    pairing.mockResolvedValue(row);
    verifyVolume.mockResolvedValue(true);
    imports.mockResolvedValue([]);
    getRuntime.mockResolvedValue({ KIMA_DOWNTIFY_ENABLED: "true" });
    getQueue.mockResolvedValue({ state: "ready", queue: [] });
    getLibrary.mockResolvedValue({state:"ready",cursor:7,full:false,tracks:[]});
    discover.mockResolvedValue({ state: "recorded", count: 0, ambiguous: 0 });
    getSummary.mockResolvedValue({ enabled: true, baselineReady: true, waiting: 0, inReview: 0 });
    claimImport.mockResolvedValue(claim);
    confirm.mockResolvedValue({ state: "not_indexed" });
    hold.mockResolvedValue(true);
    safeRetry.mockResolvedValue(true);
    getSource.mockImplementation(async () => ({ ...source, cancel: jest.fn() }));
    getSpotify.mockResolvedValue({
        spotifyId: SPOTIFY, title: "Test song", artist: "Example",
        album: "Example album", durationMs: 200000, isrc: "USABC1234567",
    });
    target.mockReturnValue("Singles/Downtify/Example/Test song.flac");
    workspace.mockResolvedValue({
        state: "ready",
        relativeTarget: "Singles/Downtify/Example/Test song.flac",
    });
    verify.mockResolvedValue({ verifiedForPublication: true });
    publish.mockImplementation(async ({
        verifyTempFile,
    }: { verifyTempFile: (file: string, source: object) => Promise<boolean> }) => {
        const valid = await verifyTempFile("/music/private-file", {
            bytes: 1024, sha256: "a".repeat(64),
        });
        return valid ? {
            state: "published", sha256: "a".repeat(64), bytes: 1024,
        } : {
            state: "validation_failed", sha256: null, bytes: 1024,
        };
    });
    markPublished.mockResolvedValue(true);
    scan.mockResolvedValue({ queued: true, jobId: "scan-full" });
});

describe("Native Downtify auto-import coordinator", () => {
    it("makes no remote calls or media writes when the one-switch feature is OFF", async () => {
        pairing.mockResolvedValueOnce({ ...row, nativeImportEnabled: false });
        const result = await runNativeImportCycle();
        expect(result).toEqual({
            state: "paused", newJobs: 0, published: 0,
            imported: 0, heldForReview: 0, filesDeleted: false,
        });
        expect(getRuntime).not.toHaveBeenCalled();
        expect(getQueue).not.toHaveBeenCalled();
        expect(publish).not.toHaveBeenCalled();
        expect(scan).not.toHaveBeenCalled();
    });

    it("never accesses Downtify or a local fallback directory when the mount proof is missing", async () => {
        verifyVolume.mockResolvedValueOnce(false);
        const result=await runNativeImportCycle();
        expect(result).toMatchObject({state:"unavailable",published:0,imported:0});
        expect(getRuntime).not.toHaveBeenCalled();
        expect(getQueue).not.toHaveBeenCalled();
        expect(publish).not.toHaveBeenCalled();
        expect(scan).not.toHaveBeenCalled();
    });

    it("does not process any item when pinned remote queue authentication fails", async () => {
        getQueue.mockResolvedValueOnce({ state: "unauthorized", queue: [] });
        expect((await runNativeImportCycle()).state).toBe("unavailable");
        expect(discover).not.toHaveBeenCalled();
        expect(publish).not.toHaveBeenCalled();
    });

    it("does not copy existing baseline songs or create any unclaimed file writes", async () => {
        const result = await runNativeImportCycle();
        expect(result.state).toBe("checked");
        expect(getSource).not.toHaveBeenCalled();
        expect(publish).not.toHaveBeenCalled();
        expect(confirm).not.toHaveBeenCalled();
    });

    it("claims and verifies one song, publishes without overwrite, then requests a scan", async () => {
        imports.mockResolvedValueOnce([])
            .mockResolvedValueOnce([job]);
        const result = await runNativeImportCycle();
        expect(result).toMatchObject({
            state: "checked", published: 1,
            imported: 0, heldForReview: 0, filesDeleted: false,
        });
        expect(claimImport).toHaveBeenCalledWith(owner, job.id);
        expect(getSource).toHaveBeenCalledWith(owner.kimaUserId, SPOTIFY, expect.any(Object));
        expect(getSpotify).toHaveBeenCalledWith(SPOTIFY);
        expect(workspace).toHaveBeenCalledWith("/music",
            "Singles/Downtify/Example/Test song.flac");
        expect(verify).toHaveBeenCalledTimes(1);
        expect(markPublished).toHaveBeenCalledWith(owner, claim.id, claim.claimToken, {
            expectedBytes: 1024,
            relativeTarget: "Singles/Downtify/Example/Test song.flac",
            fullSha256: "a".repeat(64),
            remoteLibraryTrackId: "t0123456789abcdef",
        });
        expect(scan).toHaveBeenCalledWith({
            source: "downtify-native-import", userId: owner.kimaUserId,
        });
        expect(hold).not.toHaveBeenCalled();
    });

    it("reconciles an already published file WITHOUT making another remote download", async () => {
        imports.mockResolvedValueOnce([{
            id: "clvprevious", claimToken: claim.claimToken,
        }]).mockResolvedValueOnce([]);
        confirm.mockResolvedValueOnce({
            state: "imported", indexedTrackId: "local-track-123",
        });
        const result = await runNativeImportCycle();
        expect(result).toMatchObject({
            state: "checked", published: 0, imported: 1,
        });
        expect(getSource).not.toHaveBeenCalled();
        expect(publish).not.toHaveBeenCalled();
        expect(confirm).toHaveBeenCalledWith(owner, "clvprevious", claim.claimToken);
    });

    it("holds unknown or conflicting Spotify identity for review without any file writes", async () => {
        imports.mockResolvedValueOnce([]).mockResolvedValueOnce([job]);
        getSpotify.mockResolvedValueOnce(null);
        const result = await runNativeImportCycle();
        expect(result).toMatchObject({
            state: "checked", heldForReview: 1,
            published: 0,
        });
        expect(publish).not.toHaveBeenCalled();
        expect(scan).not.toHaveBeenCalled();
        expect(hold).toHaveBeenCalledWith(owner, claim.id, claim.claimToken,
            "spotify_identity_unavailable");
    });

    it("automatically releases a verified pre-write remote outage without copying media", async () => {
        imports.mockResolvedValueOnce([]).mockResolvedValueOnce([job]);
        getSource.mockResolvedValueOnce({state:"unavailable"});
        const result=await runNativeImportCycle();
        expect(result).toMatchObject({state:"checked",published:0,heldForReview:0});
        expect(safeRetry).toHaveBeenCalledWith(
            owner,claim.id,claim.claimToken,"remote_temporarily_unavailable",
        );
        expect(publish).not.toHaveBeenCalled();
        expect(scan).not.toHaveBeenCalled();
        expect(hold).not.toHaveBeenCalled();
    });

    it("retries a missing storage mount only before any file is opened", async () => {
        imports.mockResolvedValueOnce([]).mockResolvedValueOnce([job]);
        workspace.mockResolvedValueOnce({state:"storage_unavailable"});
        const result=await runNativeImportCycle();
        expect(result).toMatchObject({state:"checked",published:0,heldForReview:0});
        expect(safeRetry).toHaveBeenCalledWith(
            owner,claim.id,claim.claimToken,"storage_temporarily_unavailable",
        );
        expect(publish).not.toHaveBeenCalled();
        expect(scan).not.toHaveBeenCalled();
    });

    it("does not release a claim when the publisher reports an uncertain write", async () => {
        imports.mockResolvedValueOnce([]).mockResolvedValueOnce([job]);
        publish.mockResolvedValueOnce({state:"uncertain",sha256:null,bytes:1024});
        const result=await runNativeImportCycle();
        expect(result.heldForReview).toBe(1);
        expect(hold).toHaveBeenCalledWith(
            owner,claim.id,claim.claimToken,"publish_uncertain",
        );
        expect(safeRetry).not.toHaveBeenCalled();
    });

    it("refuses a source if its remote server/account cannot verify ownership", async () => {
        imports.mockResolvedValueOnce([]).mockResolvedValueOnce([job]);
        getSource.mockResolvedValueOnce({ state: "unauthorized" });
        expect((await runNativeImportCycle()).heldForReview).toBe(1);
        expect(publish).not.toHaveBeenCalled();
        expect(hold).toHaveBeenCalledWith(owner, claim.id, claim.claimToken,
            "remote_source_unavailable");
    });

    it("stops automatically when the pairing is disabled mid-stream", async () => {
        imports.mockResolvedValueOnce([]).mockResolvedValueOnce([job]);
        pairing.mockResolvedValueOnce(row)
            .mockResolvedValueOnce({ ...row, nativeImportEnabled: false });
        const result = await runNativeImportCycle();
        expect(result).toMatchObject({
            state: "checked", heldForReview: 1, published: 0,
        });
        expect(publish).not.toHaveBeenCalled();
        expect(hold).toHaveBeenCalledWith(owner, claim.id, claim.claimToken,
            "pairing_disabled");
    });

    it("does not mark an incomplete or conflicting destination as imported", async () => {
        imports.mockResolvedValueOnce([]).mockResolvedValueOnce([job]);
        publish.mockResolvedValueOnce({ state: "destination_conflict", sha256: null, bytes: 1024 });
        const result = await runNativeImportCycle();
        expect(result).toMatchObject({ state: "checked", heldForReview: 1, published: 0 });
        expect(markPublished).not.toHaveBeenCalled();
        expect(scan).not.toHaveBeenCalled();
        expect(hold).toHaveBeenCalledWith(owner, claim.id, claim.claimToken, "publish_uncertain");
    });

    it("keeps published state durable when scanner cannot be enqueued", async () => {
        imports.mockResolvedValueOnce([]).mockResolvedValueOnce([job]);
        scan.mockRejectedValueOnce(new Error("Redis temporarily disconnected"));
        const result = await runNativeImportCycle();
        expect(result.published).toBe(1);
        expect(markPublished).toHaveBeenCalledTimes(1);
        expect(hold).not.toHaveBeenCalled();
    });

    it("never processes more than two new song claims in one scan cycle", async () => {
        const jobs = [
            { id: "clv1", spotifyTrackId: SPOTIFY },
            { id: "clv2", spotifyTrackId: SPOTIFY },
        ];
        imports.mockResolvedValueOnce([]).mockResolvedValueOnce(jobs);
        await runNativeImportCycle();
        expect(imports).toHaveBeenCalledWith(expect.objectContaining({
            select: { id: true, spotifyTrackId: true },
            take: 2,
        }));
        expect(claimImport).toHaveBeenCalledTimes(2);
        expect(publish).toHaveBeenCalledTimes(2);
    });

    it("does not retry an import claimed in a prior process or after a crash", async () => {
        imports.mockResolvedValueOnce([]).mockResolvedValueOnce([job]);
        claimImport.mockResolvedValueOnce({ state: "claimed_elsewhere" });
        const result = await runNativeImportCycle();
        expect(result.published).toBe(0);
        expect(publish).not.toHaveBeenCalled();
        expect(hold).not.toHaveBeenCalled();
    });
});
