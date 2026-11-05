import { verifySavedSpotifyTrack } from "./unifiedVerification";

const ROOT = "/download-manager/spotify/intents/saved-1/";
const done = {
    state: "verified", remotePhase: "downloaded",
    remoteOwnershipVerified: true, libraryVerification: "not_checked",
    playbackVerified: false, filesChanged: false, retryAllowed: false,
};
const source = {
    state: "candidate_present_unverified", remotePhase: "downloaded",
    regularFileObserved: true, recordingVerified: false,
    audioDecoded: false, stableMountVerified: false,
    libraryImportVerified: false, filesChanged: false, retryAllowed: false,
};
const header = {
    state: "header_observed_unverified", container: "flac",
    headerMatchedExtension: true, audioDecoded: false,
    recordingVerified: false, wholeFileIntegrityVerified: false,
    stableMountVerified: false, libraryImportVerified: false,
    filesChanged: false, retryAllowed: false,
};
const decoded = {
    state: "stream_decoded_unmatched", container: "flac",
    fullFileSha256Calculated: true, audioDecoded: true,
    wholeFileIntegrityVerified: false, recordingVerified: false,
    stableMountVerified: false, libraryImportVerified: false,
    filesChanged: false, retryAllowed: false,
};
const tag = {
    state: "metadata_consistent_untrusted",
    isrcMatches: true, durationMatches: true,
    recordingVerified: false, audioDecoded: false,
    wholeFileIntegrityVerified: false, stableMountVerified: false,
    libraryImportVerified: false, filesChanged: false, retryAllowed: false,
};
const responses: Record<string, unknown> = {
    "remote-status": done, "source-file": source,
    "audio-header": header, "full-audio": decoded,
    "recording-tags": tag,
};
const get = jest.fn(async (url: string): Promise<unknown> => {
    const suffix = url.slice(ROOT.length);
    return responses[suffix];
});

beforeEach(() => jest.clearAllMocks());

describe("D9 one explicit, fail-closed read-only verification", () => {
    it("runs exactly five owner-scoped GETs, in order, without claiming import", async () => {
        const progress = jest.fn();
        const result = await verifySavedSpotifyTrack("saved-1", get, progress);
        expect(result).toEqual({
            state: "consistent_untrusted", step: "tags",
            recordingVerified: false, libraryImportVerified: false,
            filesChanged: false, retryAllowed: false,
        });
        expect(get.mock.calls.map(([url]) => url)).toEqual([
            ROOT + "remote-status", ROOT + "source-file",
            ROOT + "audio-header", ROOT + "full-audio",
            ROOT + "recording-tags",
        ]);
        expect(progress.mock.calls.map(([step]) => step)).toEqual([
            "remote", "source", "header", "decode", "tags",
        ]);
    });

    it("rejects invalid intent IDs before network activity", async () => {
        const result = await verifySavedSpotifyTrack("../other-user", get);
        expect(result).toMatchObject({
            state: "unverified", step: "remote", recordingVerified: false,
        });
        expect(get).not.toHaveBeenCalled();
    });

    it("does not check source or touch audio for another user's unverifiable job", async () => {
        get.mockResolvedValueOnce({
            ...done, remoteOwnershipVerified: false,
        });
        const result = await verifySavedSpotifyTrack("saved-1", get);
        expect(result.state).toBe("unverified");
        expect(result.step).toBe("remote");
        expect(get).toHaveBeenCalledTimes(1);
    });

    it.each([
        ["source-file", { ...source, state: "source_unavailable", regularFileObserved: false }, "source"],
        ["audio-header", { ...header, headerMatchedExtension: false }, "header"],
        ["full-audio", { ...decoded, audioDecoded: false }, "decode"],
        ["recording-tags", { ...tag, state: "tag_conflict", isrcMatches: false }, "tags"],
    ] as const)("stops at %s and does not call any later stage", async (suffix, response, stage) => {
        const read = jest.fn(async (url: string) =>
            url.endsWith(suffix) ? response : responses[url.slice(ROOT.length)]
        );
        const result = await verifySavedSpotifyTrack("saved-1", read);
        expect(result).toMatchObject({ state: "unverified", step: stage });
        expect(read.mock.calls[read.mock.calls.length - 1][0]).toBe(ROOT + suffix);
    });

    it("fails closed for malformed status and never reflects malicious upstream errors", async () => {
        get.mockResolvedValueOnce({ state: "verified", remotePhase: "downloaded",
            remoteOwnershipVerified: true, filesChanged: false,
            retryAllowed: false, libraryImportVerified: true,
        });
        expect((await verifySavedSpotifyTrack("saved-1", get)).state).toBe("unverified");
        expect(get).toHaveBeenCalledTimes(1);
        jest.clearAllMocks();
        get.mockRejectedValueOnce(new Error("secret token /music/private.flac"));
        const result = await verifySavedSpotifyTrack("saved-1", get);
        expect(result).toMatchObject({
            state: "unavailable", step: "remote", filesChanged: false, retryAllowed: false,
        });
        expect(JSON.stringify(result)).not.toContain("secret");
        expect(JSON.stringify(result)).not.toContain("/music");
    });

    it("does not continue after invalid payloads or skip proof stages", async () => {
        get.mockResolvedValueOnce(null);
        expect((await verifySavedSpotifyTrack("saved-1", get)).step).toBe("remote");
        expect(get).toHaveBeenCalledTimes(1);
    });

    it("aborts future remote/file reads if the user's session changes while a request is pending", async () => {
        let deliver!: (payload: unknown) => void;
        const pending = new Promise<unknown>(resolve => { deliver = resolve; });
        const read = jest.fn(async () => pending);
        let sameAccount = true;
        const run = verifySavedSpotifyTrack(
            "saved-1", read, () => undefined, () => sameAccount,
        );
        expect(read).toHaveBeenCalledTimes(1);
        sameAccount = false;
        deliver(done);
        const result = await run;
        expect(result).toMatchObject({ state: "unavailable", step: "remote" });
        expect(read).toHaveBeenCalledTimes(1);
    });

    it("never initiates the first API request after logout", async () => {
        const result = await verifySavedSpotifyTrack(
            "saved-1", get, () => undefined, () => false,
        );
        expect(result.state).toBe("unavailable");
        expect(get).not.toHaveBeenCalled();
    });
});
