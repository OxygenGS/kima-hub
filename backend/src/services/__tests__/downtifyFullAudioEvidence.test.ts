import { constants as flags } from "fs";
import {
    getFullAudioCapability, inspectDowntifyFullAudio, hashAndDecode,
} from "../downtifyFullAudioEvidence";
import type {
    ObserveValidatedStagingCandidate, SourceFileEvidence,
} from "../downtifySourceFileEvidence";

jest.mock("../../config", () => ({ config: { music: { musicPath: "/music" } } }));

const settings = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
    KIMA_SPOTIFY_INTENTS_ENABLED: "true",
    KIMA_DOWNTIFY_ENABLED: "true",
    KIMA_DOWNTIFY_RECONCILIATION_ENABLED: "true",
    KIMA_DOWNTIFY_STORAGE_PREFLIGHT_ENABLED: "true",
    KIMA_DOWNTIFY_SOURCE_EVIDENCE_ENABLED: "true",
    KIMA_DOWNTIFY_AUDIO_HEADER_ENABLED: "true",
    KIMA_DOWNTIFY_FULL_AUDIO_CHECK_ENABLED: "true",
    KIMA_DOWNTIFY_URL: "http://downtify:8000",
    KIMA_DOWNTIFY_DEVICE_TOKEN: "dtfy_synthetic_device_token_test_1234567890",
    KIMA_DOWNTIFY_OWNER_KIMA_USER_ID: "owner-1",
    KIMA_DOWNTIFY_EXPECTED_USERNAME: "owner",
    KIMA_DOWNTIFY_EXPECTED_USER_ID: "9",
    KIMA_DOWNTIFY_EXPECTED_SERVER_ID: "cf12b3c4f530731551690cc62b1365a1",
    KIMA_DOWNTIFY_STAGING_ROOT: "/staging/downloads",
    ...overrides,
});
const fileData = () => {
    const data = Buffer.alloc(1024, 0x53);
    data.write("fLaC", 0, "ascii");
    return data;
};
const resultSource: SourceFileEvidence = {
    state: "candidate_present_unverified", remotePhase: "downloaded",
    regularFileObserved: true, recordingVerified: false,
    audioDecoded: false, stableMountVerified: false,
    libraryImportVerified: false, filesChanged: false, retryAllowed: false,
};
function dependencies(data = fileData()) {
    const candidate = {
        absolutePath: "/staging/downloads/Artist/Track.flac",
        dev: 13, ino: 78, size: data.length,
    };
    const identity = {
        dev: 13, ino: 78, size: data.length,
        mtimeMs: 1000, ctimeMs: 1000, isFile: () => true,
    };
    const handle = {
        stat: jest.fn(async () => identity),
        read: jest.fn(async (buffer: Buffer, offset: number, length: number, position: number) => {
            const n = Math.max(0, Math.min(length, data.length - position));
            if (n) data.copy(buffer, offset, position, position + n);
            return { bytesRead: n };
        }),
        close: jest.fn(async () => undefined),
    };
    const inspectSource = jest.fn(async (
        _userId: string, _intentId: string, _env: NodeJS.ProcessEnv,
        _root: string, observe: ObserveValidatedStagingCandidate,
    ) => {
        await observe(candidate);
        return resultSource;
    });
    const decode = jest.fn(async (chunks: AsyncIterable<Buffer>) => {
        let n = 0;
        for await (const bytes of chunks) n += bytes.length;
        return n === data.length;
    });
    const open = jest.fn(async () => handle);
    return { inspectSource, open, decode, handle, candidate };
}
const run = (deps = dependencies(), user = "owner-1", env = settings()) =>
    inspectDowntifyFullAudio(user, "intent-abc123", env, "/music", deps);

describe("D7 full-stream verification remains independent and disabled by default", () => {
    it("does not inspect storage, queue, or audio without all D3-D7 gates", async () => {
        const d = dependencies();
        for (const flagsOff of [
            { KIMA_DOWNTIFY_FULL_AUDIO_CHECK_ENABLED: "" },
            { KIMA_DOWNTIFY_AUDIO_HEADER_ENABLED: "" },
            { KIMA_DOWNTIFY_SOURCE_EVIDENCE_ENABLED: "" },
            { KIMA_DOWNTIFY_STORAGE_PREFLIGHT_ENABLED: "" },
            { KIMA_DOWNTIFY_RECONCILIATION_ENABLED: "" },
            { KIMA_SPOTIFY_INTENTS_ENABLED: "" },
        ]) {
            expect(getFullAudioCapability("owner-1", settings(flagsOff)).canCheck).toBe(false);
            expect((await run(d, "owner-1", settings(flagsOff))).state).toBe("disabled");
        }
        expect(d.inspectSource).not.toHaveBeenCalled();
        expect(d.open).not.toHaveBeenCalled();
    });

    it("denies an unbound Kima account without reaching filesystem or engine", async () => {
        const d = dependencies();
        expect((await run(d, "other-user")).state).toBe("unbound");
        expect(d.inspectSource).not.toHaveBeenCalled();
        expect(d.open).not.toHaveBeenCalled();
    });

    it("does not read any file when D5 cannot prove remote owner or source", async () => {
        const d = dependencies();
        d.inspectSource.mockImplementationOnce(async () => ({
            ...resultSource, state: "remote_unverified" as const,
            regularFileObserved: false,
        }));
        expect((await run(d)).state).toBe("source_unverified");
        expect(d.open).not.toHaveBeenCalled();
        expect(d.decode).not.toHaveBeenCalled();
    });
});

describe("D7 complete read and decode from the D5-verified inode", () => {
    it("reads all bytes once, hashes them, decodes the same stream, and discloses no file identity", async () => {
        const d = dependencies();
        const evidence = await run(d);
        expect(evidence).toEqual({
            state: "stream_decoded_unmatched", container: "flac",
            fullFileSha256Calculated: true, audioDecoded: true,
            wholeFileIntegrityVerified: false, recordingVerified: false,
            stableMountVerified: false, libraryImportVerified: false,
            filesChanged: false, retryAllowed: false,
        });
        expect(d.inspectSource).toHaveBeenCalledWith(
            "owner-1", "intent-abc123", settings(), "/music", expect.any(Function),
        );
        expect(d.open).toHaveBeenCalledWith(
            d.candidate.absolutePath,
            flags.O_RDONLY | flags.O_NOFOLLOW | flags.O_NONBLOCK,
        );
        expect(d.handle.stat).toHaveBeenCalledTimes(2);
        expect(d.handle.close).toHaveBeenCalledTimes(1);
        expect(d.decode).toHaveBeenCalledTimes(1);
        const output = JSON.stringify(evidence);
        for (const forbidden of ["/staging", "Artist", "1024", "secret", "sha256:"]) {
            expect(output).not.toContain(forbidden);
        }
    });

    it("does not treat a SHA-256 calculation as a verified integrity baseline if decode fails", async () => {
        const d = dependencies();
        d.decode.mockImplementationOnce(async (chunks: AsyncIterable<Buffer>) => {
            for await (const _part of chunks) { /* consume all source bytes */ }
            return false;
        });
        const evidence = await run(d);
        expect(evidence).toMatchObject({
            state: "decode_failed", fullFileSha256Calculated: true,
            audioDecoded: false, wholeFileIntegrityVerified: false,
            retryAllowed: false, filesChanged: false,
        });
    });

    it("rejects a fake FLAC extension over MP3 magic before any decoder launch", async () => {
        const d = dependencies(Buffer.alloc(1024, 0x23));
        expect((await run(d)).state).toBe("header_unverified");
        expect(d.decode).not.toHaveBeenCalled();
        expect(d.handle.close).toHaveBeenCalledTimes(1);
    });

    it("refuses too-large or implausibly small sources before opening a file", async () => {
        const large = dependencies();
        large.candidate.size = 257 * 1024 * 1024;
        expect((await run(large)).state).toBe("file_too_large");
        expect(large.open).not.toHaveBeenCalled();

        const small = dependencies();
        small.candidate.size = 20;
        expect((await run(small)).state).toBe("header_unverified");
        expect(small.open).not.toHaveBeenCalled();
    });

    it("refuses an inode replacement before reading or decoding", async () => {
        const d = dependencies();
        d.handle.stat.mockResolvedValueOnce({
            dev: 13, ino: 9000, size: 1024, mtimeMs: 1000,
            ctimeMs: 1000, isFile: () => true,
        });
        expect((await run(d)).state).toBe("file_changed");
        expect(d.decode).not.toHaveBeenCalled();
        expect(d.handle.close).toHaveBeenCalledTimes(1);
    });

    it("rejects a source whose bytes were changed during the full stream read", async () => {
        const d = dependencies();
        d.handle.stat.mockResolvedValueOnce({
            dev: 13, ino: 78, size: 1024,
            mtimeMs: 1000, ctimeMs: 1000, isFile: () => true,
        }).mockResolvedValueOnce({
            dev: 13, ino: 78, size: 1024,
            mtimeMs: 2000, ctimeMs: 1000, isFile: () => true,
        });
        const result = await run(d);
        expect(result).toMatchObject({
            state: "file_changed", audioDecoded: false,
            fullFileSha256Calculated: false,
        });
    });

    it("detects truncation without claiming SHA-256 or decoding succeeded", async () => {
        const d = dependencies();
        d.handle.read.mockImplementation(async (buffer, offset, length, position) => {
            if (position >= 120) return { bytesRead: 0 };
            const n = Math.min(120 - position, length);
            fileData().copy(buffer, offset, position, position + n);
            return { bytesRead: n };
        });
        const evidence = await run(d);
        expect(evidence.state).toBe("read_incomplete");
        expect(evidence.fullFileSha256Calculated).toBe(false);
        expect(evidence.audioDecoded).toBe(false);
    });

    it("never assumes a decoder's early success means the entire file was read", async () => {
        const read = jest.fn(async (_buffer: Buffer, _offset: number, length: number) =>
            ({ bytesRead: length })
        );
        const result = await hashAndDecode({ read }, 250, async () => true);
        expect(result).toEqual({
            bytesComplete: false, sha256Calculated: false, decoded: false,
        });
    });

    it("provides an explicit busy result while a previous verification is active", async () => {
        const first = dependencies();
        let finish!: (value: SourceFileEvidence) => void;
        first.inspectSource.mockImplementation(() => new Promise(resolve => {
            finish = resolve;
        }));
        const running = run(first);
        const other = dependencies();
        const busy = await run(other);
        expect(busy.state).toBe("busy");
        expect(other.inspectSource).not.toHaveBeenCalled();
        finish({ ...resultSource, state: "remote_unverified" });
        await running;
        expect((await run(dependencies())).state).toBe("stream_decoded_unmatched");
    });

    it("redacts errors and closes the descriptor even when the source cannot be read", async () => {
        const d = dependencies();
        d.handle.read.mockRejectedValue(new Error("/staging/private/token"));
        const evidence = await run(d);
        expect(evidence.state).toBe("file_unreadable");
        expect(evidence.retryAllowed).toBe(false);
        expect(JSON.stringify(evidence)).not.toContain("private");
        expect(d.handle.close).toHaveBeenCalledTimes(1);
    });
});
