import {
    inspectDowntifySourceFile, getSourceFileCapability,
} from "../downtifySourceFileEvidence";

jest.mock("../../config", () => ({ config: { music: { musicPath: "/music" } } }));
jest.mock("../../utils/db", () => ({ prisma: { spotifyDownloadIntent: {} } }));

const ID = "0123456789ABCDEFGHIJKL";
const settings = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
    KIMA_DOWNTIFY_ENABLED: "true",
    KIMA_SPOTIFY_INTENTS_ENABLED: "true",
    KIMA_DOWNTIFY_RECONCILIATION_ENABLED: "true",
    KIMA_DOWNTIFY_STORAGE_PREFLIGHT_ENABLED: "true",
    KIMA_DOWNTIFY_SOURCE_EVIDENCE_ENABLED: "true",
    KIMA_DOWNTIFY_URL: "http://downtify:8000",
    KIMA_DOWNTIFY_DEVICE_TOKEN: "dtfy_synthetic_device_token_test_1234567890",
    KIMA_DOWNTIFY_OWNER_KIMA_USER_ID: "owner-1",
    KIMA_DOWNTIFY_EXPECTED_USERNAME: "owner",
    KIMA_DOWNTIFY_EXPECTED_USER_ID: "9",
    KIMA_DOWNTIFY_EXPECTED_SERVER_ID: "cf12b3c4f530731551690cc62b1365a1",
    KIMA_DOWNTIFY_STAGING_ROOT: "/staging/downloads",
    ...overrides,
});

const safeTopology = {
    state: "inspected" as const,
    filesystemRelation: "different_device" as const,
    copyRequiredByDevice: true,
    mountIdentityVerified: false as const,
    sourceAudioVerified: false as const,
    libraryImportVerified: false as const,
    importerCutoverAuthorized: false as const,
    filesChanged: false as const,
};
const remote = (phase = "downloaded", file: unknown = "Artist/Album/01 Track.flac") => ({
    verification: {
        state: "verified" as const,
        remotePhase: phase as "downloaded" | "queued",
        remoteOwnershipVerified: true,
        libraryVerification: "not_checked" as const,
        playbackVerified: false as const,
        filesChanged: false as const,
        retryAllowed: false as const,
    },
    filename: file,
});
const io = () => {
    const lstat = jest.fn(async (p: string) => ({
        dev: 11, size: p.endsWith(".flac") ? 1900000 : 4096,
        isDirectory: (): boolean => !p.endsWith(".flac"),
        isFile: (): boolean => p.endsWith(".flac"),
        isSymbolicLink: (): boolean => false,
    }));
    const realpath = jest.fn(async (p: string) => p);
    return { lstat, realpath };
};
const deps = () => ({
    inspectStorage: jest.fn(async () => safeTopology),
    inspectRemote: jest.fn(async () => remote()),
    reader: io(),
});
const run = (d = deps(), env = settings(), user = "owner-1") =>
    inspectDowntifySourceFile(user, "intent-abc123", env, "/music", d);

describe("D5 explicit read-only source file evidence", () => {
    it("disables all file and remote checks by default, independent of D2 writes", async () => {
        const d = deps();
        expect(getSourceFileCapability("owner-1", settings({
            KIMA_DOWNTIFY_SOURCE_EVIDENCE_ENABLED: "false",
        })).canCheck).toBe(false);
        expect((await run(d, settings({
            KIMA_DOWNTIFY_SOURCE_EVIDENCE_ENABLED: "",
        }))).state).toBe("disabled");
        expect((await run(d, settings({
            KIMA_DOWNTIFY_RECONCILIATION_ENABLED: "false",
        }))).state).toBe("disabled");
        expect((await run(d, settings({
            KIMA_DOWNTIFY_STORAGE_PREFLIGHT_ENABLED: "false",
        }))).state).toBe("disabled");
        expect(d.inspectStorage).not.toHaveBeenCalled();
        expect(d.inspectRemote).not.toHaveBeenCalled();
        expect(d.reader.lstat).not.toHaveBeenCalled();
    });

    it("never contacts a remote engine or filesystem for another Kima user", async () => {
        const d = deps();
        expect((await run(d, settings(), "different-user")).state).toBe("unbound");
        expect(d.inspectStorage).not.toHaveBeenCalled();
        expect(d.inspectRemote).not.toHaveBeenCalled();
        expect(d.reader.realpath).not.toHaveBeenCalled();
    });

    it("requires a good storage preflight before any remote queue inspection", async () => {
        const d = deps();
        d.inspectStorage.mockResolvedValueOnce({
            ...safeTopology, state: "source_unavailable" as never,
        });
        const result = await run(d);
        expect(result.state).toBe("storage_unavailable");
        expect(d.inspectRemote).not.toHaveBeenCalled();
        expect(d.reader.lstat).not.toHaveBeenCalled();
    });

    it("requires the exact remote user and Spotify ID proof before examining a filename", async () => {
        const d = deps();
        d.inspectRemote.mockResolvedValueOnce({
            verification: {
                ...remote().verification, state: "no_verified_job" as never,
                remoteOwnershipVerified: false,
            },
            filename: "/private/file.flac",
        });
        const result = await run(d);
        expect(result.state).toBe("remote_unverified");
        expect(d.reader.lstat).not.toHaveBeenCalled();
        expect(result.regularFileObserved).toBe(false);
    });

    it("will not inspect files for a queued or failed remote transfer", async () => {
        const d = deps();
        d.inspectRemote.mockResolvedValueOnce(remote("queued", "Artist/Track.flac"));
        const result = await run(d);
        expect(result).toMatchObject({
            state: "not_downloaded", remotePhase: "queued",
            regularFileObserved: false, retryAllowed: false,
        });
        expect(d.reader.realpath).not.toHaveBeenCalled();
    });

    it("does not imply a file exists when the completed job has no filename", async () => {
        const d = deps();
        d.inspectRemote.mockResolvedValueOnce(remote("downloaded", null));
        expect((await run(d)).state).toBe("source_path_unavailable");
        expect(d.reader.lstat).not.toHaveBeenCalled();
    });

    it.each([
        "/etc/private.flac", "../other.flac", "Artist/../../private.flac",
        "Artist//file.flac", "./file.flac", "Artist/./file.flac",
        "Artist\\file.flac", "Artist/\u0000private.flac", "note.txt",
        "file.flac/../song.flac",
    ])("rejects unsafe or unsupported remote filename %p before any filesystem access", async (filename) => {
        const d = deps();
        d.inspectRemote.mockResolvedValueOnce(remote("downloaded", filename));
        const result = await run(d);
        expect(result.state).toBe("unsafe_source_path");
        expect(d.reader.lstat).not.toHaveBeenCalled();
    });

    it.each(["slskd/user/Song.flac", "ext/folder/Song.flac"])(
        "declines remote library paths outside the bound staging root: %p", async (filename) => {
            const d = deps();
            d.inspectRemote.mockResolvedValueOnce(remote("downloaded", filename));
            expect((await run(d)).state).toBe("external_source_unsupported");
            expect(d.reader.lstat).not.toHaveBeenCalled();
        },
    );

    it("finds an actual non-empty regular staged candidate, without claiming recording/import", async () => {
        const d = deps();
        const result = await run(d);
        expect(result).toEqual({
            state: "candidate_present_unverified", remotePhase: "downloaded",
            regularFileObserved: true, recordingVerified: false,
            audioDecoded: false, stableMountVerified: false,
            libraryImportVerified: false, filesChanged: false, retryAllowed: false,
        });
        expect(d.reader.lstat).toHaveBeenCalledTimes(4);
        expect(d.reader.realpath).toHaveBeenCalledTimes(2);
        expect(d.inspectRemote).toHaveBeenCalledWith("owner-1", "intent-abc123", settings());
        const serialized = JSON.stringify(result);
        expect(serialized).not.toContain("/staging");
        expect(serialized).not.toContain("Artist");
        expect(serialized).not.toContain("1900000");
        expect(serialized).not.toContain(ID);
    });

    it("rejects symlinked intermediate directories, nested mounts and invalid regular files", async () => {
        const symlink = deps();
        symlink.reader.lstat.mockImplementationOnce(async p => ({
            dev: 11, size: 4096,
            isDirectory: () => true, isFile: () => false,
            isSymbolicLink: () => p.includes("staging"),
        }));
        expect((await run(symlink)).state).toBe("unsafe_source_path");

        const nested = deps();
        nested.reader.lstat.mockImplementation(async (p) => ({
            dev: p.includes("Album") ? 999 : 11,
            size: 4096,
            isDirectory: () => !p.endsWith(".flac"),
            isFile: () => p.endsWith(".flac"),
            isSymbolicLink: () => false,
        }));
        expect((await run(nested)).state).toBe("unsafe_source_path");

        const empty = deps();
        empty.reader.lstat.mockImplementation(async (p) => ({
            dev: 11, size: p.endsWith(".flac") ? 0 : 4096,
            isDirectory: () => !p.endsWith(".flac"),
            isFile: () => p.endsWith(".flac"),
            isSymbolicLink: () => false,
        }));
        expect((await run(empty)).state).toBe("source_unavailable");
    });

    it("refuses symlinked root ancestors and files that canonicalize outside staging", async () => {
        const root = deps();
        root.reader.realpath.mockResolvedValueOnce("/different-volume");
        expect((await run(root)).state).toBe("unsafe_source_path");

        const escaped = deps();
        escaped.reader.realpath.mockResolvedValueOnce("/staging/downloads")
            .mockResolvedValueOnce("/private/music.flac");
        expect((await run(escaped)).state).toBe("unsafe_source_path");
    });

    it("reports absent files without leaking paths or re-triggering a download", async () => {
        const d = deps();
        d.reader.lstat.mockRejectedValueOnce(new Error("SECRET path /staging/downloads"));
        const value = await run(d);
        expect(value).toMatchObject({
            state: "source_unavailable", regularFileObserved: false,
            retryAllowed: false, filesChanged: false,
        });
        expect(JSON.stringify(value)).not.toContain("SECRET");
    });
});
