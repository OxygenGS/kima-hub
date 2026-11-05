import { constants as fsConstants } from "fs";
import {
    getAudioHeaderCapability, inspectDowntifyAudioHeader, detectAudioContainer,
} from "../downtifyAudioHeaderEvidence";
import type { ObserveValidatedStagingCandidate } from "../downtifySourceFileEvidence";

jest.mock("../../config", () => ({ config: { music: { musicPath: "/music" } } }));

const env = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
    KIMA_SPOTIFY_INTENTS_ENABLED: "true",
    KIMA_DOWNTIFY_RECONCILIATION_ENABLED: "true",
    KIMA_DOWNTIFY_STORAGE_PREFLIGHT_ENABLED: "true",
    KIMA_DOWNTIFY_SOURCE_EVIDENCE_ENABLED: "true",
    KIMA_DOWNTIFY_AUDIO_HEADER_ENABLED: "true",
    KIMA_DOWNTIFY_ENABLED: "true",
    KIMA_DOWNTIFY_URL: "http://downtify:8000",
    KIMA_DOWNTIFY_DEVICE_TOKEN: "dtfy_synthetic_device_token_test_1234567890",
    KIMA_DOWNTIFY_OWNER_KIMA_USER_ID: "owner-1",
    KIMA_DOWNTIFY_EXPECTED_USERNAME: "remote-owner",
    KIMA_DOWNTIFY_EXPECTED_USER_ID: "9",
    KIMA_DOWNTIFY_EXPECTED_SERVER_ID: "cf12b3c4f530731551690cc62b1365a1",
    KIMA_DOWNTIFY_STAGING_ROOT: "/staging/downloads",
    ...overrides,
});
const candidate = {
    absolutePath: "/staging/downloads/Artist/Album/Track.flac",
    dev: 12, ino: 888, size: 18764352,
};

const signature = (kind: "flac" | "mp3" | "mp4" | "ogg" | "wav" | "noise") => {
    const b = Buffer.alloc(64);
    switch (kind) {
        case "flac": b.write("fLaC", 0, "ascii"); break;
        case "mp3": b.write("ID3", 0, "ascii"); break;
        case "mp4": b.write("ftypM4A ", 4, "ascii"); break;
        case "ogg": b.write("OggS", 0, "ascii"); b.write("OpusHead", 28, "ascii"); break;
        case "wav": b.write("RIFF", 0, "ascii"); b.write("WAVE", 8, "ascii"); break;
        default: b.write("not an audio container", 0, "ascii");
    }
    return b;
};
const source = {
    state: "candidate_present_unverified" as const,
    remotePhase: "downloaded" as const,
    regularFileObserved: true,
    recordingVerified: false as const,
    audioDecoded: false as const,
    stableMountVerified: false as const,
    libraryImportVerified: false as const,
    filesChanged: false as const,
    retryAllowed: false as const,
};

function dependencies(
    kind: Parameters<typeof signature>[0] = "flac",
    file = candidate,
) {
    const stat = {
        dev: file.dev, ino: file.ino, size: file.size,
        mtimeMs: 30000, ctimeMs: 30000,
        isFile: () => true,
    };
    const handle = {
        stat: jest.fn(async () => stat),
        read: jest.fn(async (buffer: Buffer) => {
            const payload = signature(kind);
            payload.copy(buffer);
            return { bytesRead: payload.length };
        }),
        close: jest.fn(async () => undefined),
    };
    const inspectSource = jest.fn(async (
        _userId: string, _intentId: string, _env: NodeJS.ProcessEnv,
        _root: string, observer: ObserveValidatedStagingCandidate,
    ) => {
        await observer(file);
        return source;
    });
    const open = jest.fn(async (_name: string, _flags: number) => handle);
    return { inspectSource, open, handle };
}
const run = (d = dependencies(), userId = "owner-1", setting = env()) =>
    inspectDowntifyAudioHeader(userId, "intent-abc123", setting, "/music", d);

describe("D6 default-off, owner-bound audio header capability", () => {
    it("requires an explicitly configured D6 flag and all D3-D5 flags", async () => {
        const d = dependencies();
        for (const change of [
            { KIMA_DOWNTIFY_AUDIO_HEADER_ENABLED: "" },
            { KIMA_DOWNTIFY_SOURCE_EVIDENCE_ENABLED: "" },
            { KIMA_DOWNTIFY_STORAGE_PREFLIGHT_ENABLED: "" },
            { KIMA_DOWNTIFY_RECONCILIATION_ENABLED: "" },
            { KIMA_SPOTIFY_INTENTS_ENABLED: "" },
        ]) {
            const settings = env(change);
            expect(getAudioHeaderCapability("owner-1", settings).canCheck).toBe(false);
            expect((await run(d, "owner-1", settings)).state).toBe("disabled");
        }
        expect(d.inspectSource).not.toHaveBeenCalled();
        expect(d.open).not.toHaveBeenCalled();
    });

    it("rejects other Kima users without opening or inspecting any file", async () => {
        const d = dependencies();
        expect(getAudioHeaderCapability("other", env()).state).toBe("unbound");
        expect((await run(d, "other")).state).toBe("unbound");
        expect(d.inspectSource).not.toHaveBeenCalled();
        expect(d.open).not.toHaveBeenCalled();
    });
});

describe("D6 bounded read from exact validated inode", () => {
    it("recognizes only a plausible container signature; no audio decode or import claims", async () => {
        const d = dependencies();
        const result = await run(d);
        expect(result).toEqual({
            state: "header_observed_unverified", container: "flac",
            headerMatchedExtension: true, audioDecoded: false,
            recordingVerified: false, wholeFileIntegrityVerified: false,
            stableMountVerified: false, libraryImportVerified: false,
            filesChanged: false, retryAllowed: false,
        });
        expect(d.inspectSource).toHaveBeenCalledWith(
            "owner-1", "intent-abc123", env(), "/music", expect.any(Function),
        );
        expect(d.open).toHaveBeenCalledWith(
            candidate.absolutePath,
            fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK,
        );
        expect(d.handle.read).toHaveBeenCalledWith(
            expect.any(Buffer), 0, 64, 0,
        );
        expect(d.handle.stat).toHaveBeenCalledTimes(2);
        expect(d.handle.close).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(result)).not.toContain("/staging");
        expect(JSON.stringify(result)).not.toContain("Artist");
        expect(JSON.stringify(result)).not.toContain("18764352");
    });

    it.each([
        ["mp3", "mp3", ".mp3"],
        ["mp4", "mp4", ".m4a"],
        ["ogg", "ogg", ".opus"],
        ["wav", "wav", ".wav"],
    ] as const)("recognizes %s header for %s extension only as unverified", async (kind, expected, ext) => {
        const d = dependencies(kind, {
            ...candidate,
            absolutePath: "/staging/downloads/Track" + ext,
        });
        const result = await run(d);
        expect(result.state).toBe("header_observed_unverified");
        expect(result.container).toBe(expected);
        expect(result.audioDecoded).toBe(false);
    });

    it("does not mistake a valid FLAC magic for an MP3 file", async () => {
        const d = dependencies("flac", {
            ...candidate, absolutePath: "/staging/downloads/Bad.mp3",
        });
        const result = await run(d);
        expect(result).toMatchObject({
            state: "container_mismatch", container: "flac",
            headerMatchedExtension: false, wholeFileIntegrityVerified: false,
        });
    });

    it("never calls a four-byte prefix a verified audio container", () => {
        expect(detectAudioContainer(Buffer.from("fLaC"))).toBe("unknown");
        expect(detectAudioContainer(signature("noise"))).toBe("unknown");
    });

    it("rejects an inode or device swap between the D5 check and the file descriptor", async () => {
        const d = dependencies();
        d.handle.stat.mockResolvedValueOnce({
            dev: 12, ino: 9000, size: candidate.size,
            mtimeMs: 30000, ctimeMs: 30000, isFile: () => true,
        });
        const result = await run(d);
        expect(result.state).toBe("file_changed");
        expect(d.handle.read).not.toHaveBeenCalled();
        expect(d.handle.close).toHaveBeenCalledTimes(1);
    });

    it("rejects a mutation observed during the bounded read", async () => {
        const d = dependencies();
        d.handle.stat.mockResolvedValueOnce({
            dev: candidate.dev, ino: candidate.ino, size: candidate.size,
            mtimeMs: 30000, ctimeMs: 30000, isFile: () => true,
        }).mockResolvedValueOnce({
            dev: candidate.dev, ino: candidate.ino, size: candidate.size,
            mtimeMs: 30001, ctimeMs: 30000, isFile: () => true,
        });
        expect((await run(d)).state).toBe("file_changed");
        expect(d.handle.close).toHaveBeenCalledTimes(1);
    });

    it("returns a conservative result and closes fd for malformed or unreadable data", async () => {
        const unreadable = dependencies();
        unreadable.handle.read.mockRejectedValue(new Error("private filename /staging/secret"));
        const result = await run(unreadable);
        expect(result.state).toBe("file_unreadable");
        expect(unreadable.handle.close).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(result)).not.toContain("secret");

        const unknown = await run(dependencies("noise"));
        expect(unknown.state).toBe("unrecognized_header");
        expect(unknown.headerMatchedExtension).toBe(false);
    });

    it("declines any D5 refusal without opening a file or retrying the download", async () => {
        const d = dependencies();
        d.inspectSource.mockImplementation(async () => ({
            ...source, state: "remote_unverified" as const,
            regularFileObserved: false,
        }));
        const result = await run(d);
        expect(result.state).toBe("source_unverified");
        expect(result.retryAllowed).toBe(false);
        expect(d.open).not.toHaveBeenCalled();
    });

    it("never turns an absent Kima-owned intent into a probe", async () => {
        const d = dependencies();
        d.inspectSource.mockImplementation(async () => ({
            ...source, state: "not_found" as const,
            regularFileObserved: false,
        }));
        expect((await run(d)).state).toBe("not_found");
        expect(d.open).not.toHaveBeenCalled();
    });
});
