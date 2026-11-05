import { constants as flags } from "fs";
import {
    compareRecordingTags, getRecordingTagCapability, inspectDowntifyRecordingTags,
} from "../downtifyRecordingTagsEvidence";
import type {
    ObserveValidatedStagingCandidate, SourceFileEvidence,
} from "../downtifySourceFileEvidence";

jest.mock("../../config", () => ({ config: { music: { musicPath: "/music" } } }));
jest.mock("../../utils/db", () => ({ prisma: { spotifyDownloadIntent: {} } }));

const ID = "0123456789ABCDEFGHIJKL";
const ISRC = "USRC17607839";
const env = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
    KIMA_SPOTIFY_INTENTS_ENABLED: "true",
    KIMA_DOWNTIFY_ENABLED: "true",
    KIMA_DOWNTIFY_RECONCILIATION_ENABLED: "true",
    KIMA_DOWNTIFY_STORAGE_PREFLIGHT_ENABLED: "true",
    KIMA_DOWNTIFY_SOURCE_EVIDENCE_ENABLED: "true",
    KIMA_DOWNTIFY_AUDIO_HEADER_ENABLED: "true",
    KIMA_DOWNTIFY_FULL_AUDIO_CHECK_ENABLED: "true",
    KIMA_DOWNTIFY_RECORDING_TAG_CHECK_ENABLED: "true",
    KIMA_DOWNTIFY_URL: "http://downtify:8000",
    KIMA_DOWNTIFY_DEVICE_TOKEN: "dtfy_synthetic_device_token_test_1234567890",
    KIMA_DOWNTIFY_OWNER_KIMA_USER_ID: "owner-1",
    KIMA_DOWNTIFY_EXPECTED_USERNAME: "owner",
    KIMA_DOWNTIFY_EXPECTED_USER_ID: "9",
    KIMA_DOWNTIFY_EXPECTED_SERVER_ID: "cf12b3c4f530731551690cc62b1365a1",
    KIMA_DOWNTIFY_STAGING_ROOT: "/staging/downloads",
    ...overrides,
});
const source: SourceFileEvidence = {
    state: "candidate_present_unverified", remotePhase: "downloaded",
    regularFileObserved: true, recordingVerified: false,
    audioDecoded: false, stableMountVerified: false,
    libraryImportVerified: false, filesChanged: false, retryAllowed: false,
};
const candidate = {
    absolutePath: "/staging/downloads/Artist/Track.flac",
    dev: 12, ino: 243, size: 4096,
};
const intent = () => ({
    kind: "track", spotifyId: ID, canonicalUrl: "https://open.spotify.com/track/" + ID,
    status: "dispatch_unknown", remoteSongId: ID,
});
const spotify = () => ({ spotifyId: ID, isrc: ISRC, durationMs: 183000 });
function deps() {
    const identity = {
        dev: 12, ino: 243, size: 4096,
        mtimeMs: 123456, ctimeMs: 123456, isFile: () => true,
    };
    const handle = {
        stat: jest.fn(async () => identity),
        read: jest.fn(async (buffer: Buffer, _offset: number, len: number) => {
            buffer.fill(65, 0, len);
            return { bytesRead: len };
        }),
        close: jest.fn(async () => undefined),
    };
    const inspectSource = jest.fn(async (
        _user: string, _id: string, _env: NodeJS.ProcessEnv, _root: string,
        observer: ObserveValidatedStagingCandidate,
    ): Promise<SourceFileEvidence> => {
        await observer(candidate);
        return source;
    });
    const getOwnedIntent = jest.fn(async () => intent());
    const getSpotify = jest.fn(async () => spotify());
    const open = jest.fn(async () => handle);
    const parse = jest.fn(async (chunks: AsyncIterable<Buffer>, _size: number) => {
        let consumed = 0;
        for await (const chunk of chunks) consumed += chunk.length;
        if (consumed !== 4096) throw new Error("unexpected metadata stream");
        return { isrc: [ISRC], durationSeconds: 183 };
    });
    return { inspectSource, getOwnedIntent, getSpotify, open, parse, handle };
}
const run = (d = deps(), user = "owner-1", config = env()) =>
    inspectDowntifyRecordingTags(user, "intent-abc123", config, "/music", d);

describe("D8 conservative metadata comparison", () => {
    it("treats exact ISRC and duration as consistent tags, not proof of a recording", () => {
        expect(compareRecordingTags(spotify(), {
            isrc: [ISRC, ISRC.toLowerCase()], durationSeconds: 182.6,
        })).toEqual({
            state: "metadata_consistent_untrusted",
            isrcMatches: true, durationMatches: true, recordingVerified: false,
            audioDecoded: false, wholeFileIntegrityVerified: false,
            stableMountVerified: false, libraryImportVerified: false,
            filesChanged: false, retryAllowed: false,
        });
    });

    it("rejects missing, ambiguous, invalid, contradictory and different ISRC tags", () => {
        for (const [tag, state] of [
            [null, "tag_missing"],
            [[], "tag_missing"],
            [[""], "tag_missing"],
            [["USRC17607839", "GBABC1234567"], "tag_conflict"],
            [["wrong"], "tag_conflict"],
            [["GBABC1234567"], "isrc_mismatch"],
        ] as [unknown, string][]) {
            const result = compareRecordingTags(spotify(), {
                isrc: tag, durationSeconds: 183,
            });
            expect(result.state).toBe(state);
            expect(result.recordingVerified).toBe(false);
        }
    });

    it("never uses title/artist or missing/mismatched duration as a substitute", () => {
        expect(compareRecordingTags(spotify(), {
            isrc: [ISRC], durationSeconds: null,
        }).state).toBe("duration_missing");
        expect(compareRecordingTags(spotify(), {
            isrc: [ISRC], durationSeconds: 192,
        }).state).toBe("duration_mismatch");
        expect(compareRecordingTags({ ...spotify(), isrc: null }, {
            isrc: [ISRC], durationSeconds: 183,
        }).state).toBe("identity_unavailable");
    });
});

describe("D8 explicitly gated, owner-scoped and read-only", () => {
    it("does no disk or remote reads with any preceding feature flag off", async () => {
        const d = deps();
        for (const changes of [
            { KIMA_DOWNTIFY_RECORDING_TAG_CHECK_ENABLED: "" },
            { KIMA_DOWNTIFY_FULL_AUDIO_CHECK_ENABLED: "" },
            { KIMA_DOWNTIFY_AUDIO_HEADER_ENABLED: "" },
            { KIMA_DOWNTIFY_SOURCE_EVIDENCE_ENABLED: "" },
            { KIMA_DOWNTIFY_STORAGE_PREFLIGHT_ENABLED: "" },
            { KIMA_DOWNTIFY_RECONCILIATION_ENABLED: "" },
            { KIMA_SPOTIFY_INTENTS_ENABLED: "" },
        ]) {
            const settings = env(changes);
            expect(getRecordingTagCapability("owner-1", settings).canCheck).toBe(false);
            expect((await run(d, "owner-1", settings)).state).toBe("disabled");
        }
        expect(d.inspectSource).not.toHaveBeenCalled();
        expect(d.getOwnedIntent).not.toHaveBeenCalled();
        expect(d.getSpotify).not.toHaveBeenCalled();
        expect(d.open).not.toHaveBeenCalled();
    });

    it("does not query another Kima user's request or provider metadata", async () => {
        const d = deps();
        expect((await run(d, "other-user")).state).toBe("unbound");
        expect(d.inspectSource).not.toHaveBeenCalled();
        expect(d.getOwnedIntent).not.toHaveBeenCalled();
        expect(d.getSpotify).not.toHaveBeenCalled();
    });

    it("requires a D5-confirmed owned file before reading audio tags", async () => {
        const d = deps();
        d.inspectSource.mockImplementationOnce(async () => ({
            ...source, state: "remote_unverified", regularFileObserved: false,
        }));
        expect((await run(d)).state).toBe("source_unverified");
        expect(d.getOwnedIntent).not.toHaveBeenCalled();
        expect(d.open).not.toHaveBeenCalled();
    });

    it("uses the same pinned owner and exact Spotify ID, closes fd, and never reveals ISRC", async () => {
        const d = deps();
        const result = await run(d);
        expect(result.state).toBe("metadata_consistent_untrusted");
        expect(result.recordingVerified).toBe(false);
        expect(result.audioDecoded).toBe(false);
        expect(d.getOwnedIntent).toHaveBeenCalledWith("owner-1", "intent-abc123");
        expect(d.getSpotify).toHaveBeenCalledWith(ID);
        expect(d.open).toHaveBeenCalledWith(
            candidate.absolutePath, flags.O_RDONLY | flags.O_NOFOLLOW | flags.O_NONBLOCK,
        );
        expect(d.handle.stat).toHaveBeenCalledTimes(2);
        expect(d.handle.close).toHaveBeenCalledTimes(1);
        expect(d.parse).toHaveBeenCalledTimes(1);
        for (const forbidden of ["/staging", "Artist", ISRC, ID, "4096"]) {
            expect(JSON.stringify(result)).not.toContain(forbidden);
        }
    });

    it("refuses forged or inconsistent persisted intent identity before opening", async () => {
        const d = deps();
        d.getOwnedIntent.mockResolvedValueOnce({
            ...intent(), remoteSongId: "different",
        });
        expect((await run(d)).state).toBe("identity_unavailable");
        expect(d.getSpotify).not.toHaveBeenCalled();
        expect(d.open).not.toHaveBeenCalled();
    });

    it("refuses mismatching Spotify provider identity", async () => {
        const d = deps();
        d.getSpotify.mockResolvedValueOnce({
            ...spotify(), spotifyId: "OTHERSPOTIFYID000000000",
        });
        expect((await run(d)).state).toBe("identity_unavailable");
        expect(d.open).not.toHaveBeenCalled();
    });

    it("never trusts a replaced inode, including a changed file during parsing", async () => {
        const replaced = deps();
        replaced.handle.stat.mockResolvedValueOnce({
            dev: 12, ino: 999, size: 4096,
            mtimeMs: 123456, ctimeMs: 123456, isFile: () => true,
        });
        expect((await run(replaced)).state).toBe("file_changed");
        expect(replaced.parse).not.toHaveBeenCalled();
        expect(replaced.handle.close).toHaveBeenCalledTimes(1);

        const modified = deps();
        modified.handle.stat.mockResolvedValueOnce({
            dev: 12, ino: 243, size: 4096,
            mtimeMs: 123456, ctimeMs: 123456, isFile: () => true,
        }).mockResolvedValueOnce({
            dev: 12, ino: 243, size: 4096,
            mtimeMs: 123458, ctimeMs: 123456, isFile: () => true,
        });
        expect((await run(modified)).state).toBe("file_changed");
        expect(modified.handle.close).toHaveBeenCalledTimes(1);
    });

    it("fails safely when parsing fails or file metadata is unreadable", async () => {
        const d = deps();
        d.parse.mockRejectedValueOnce(new Error("private file token=/music/secret"));
        const result = await run(d);
        expect(result.state).toBe("metadata_unavailable");
        expect(JSON.stringify(result)).not.toContain("secret");
        expect(d.handle.close).toHaveBeenCalledTimes(1);
    });

    it("serializes expensive inspections without triggering another download", async () => {
        const first = deps();
        let settle!: (value: SourceFileEvidence) => void;
        first.inspectSource.mockImplementationOnce(() => new Promise(resolve => {
            settle = resolve;
        }));
        const ongoing = run(first);
        const next = deps();
        expect((await run(next)).state).toBe("busy");
        expect(next.inspectSource).not.toHaveBeenCalled();
        settle({ ...source, state: "remote_unverified" });
        await ongoing;
        expect((await run(deps())).state).toBe("metadata_consistent_untrusted");
    });
});
