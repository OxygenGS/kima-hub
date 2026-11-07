import type { AxiosInstance } from "axios";
import { inspectNativeDowntifyImport } from "../downtifyNativeImportPreflight";
import { promises as fs } from "fs";

const TOKEN = "dtfy_synthetic_very_long_device_token_12345";
const USER = "admin-only";
const SERVER_ID = "server_test_0001";
const TRACK_ID = "t0123456789abcdef";
const SPOTIFY_ID = "0123456789ABCDEFGHIJKL";
const filename = "Artist/Album/02 - Title.flac";
const env: NodeJS.ProcessEnv = {
    KIMA_DOWNTIFY_ENABLED: "true",
    KIMA_DOWNTIFY_URL: "http://downtify:8000/",
    KIMA_DOWNTIFY_DEVICE_TOKEN: TOKEN,
    KIMA_DOWNTIFY_OWNER_KIMA_USER_ID: USER,
    KIMA_DOWNTIFY_EXPECTED_USER_ID: "8",
    KIMA_DOWNTIFY_EXPECTED_USERNAME: "remote",
    KIMA_DOWNTIFY_EXPECTED_SERVER_ID: SERVER_ID,
};
const audio = Buffer.concat([Buffer.from("fLaC"), Buffer.alloc(60)]);
const server = { product: "Downtify", api_version: 1, require_sign_in: true, server_id: SERVER_ID };
const auth = { signed_in: true, via: "device", auth_disabled: false, user: { id: 8, username: "remote" } };
const job = {
    status: "done", user_ids: [8], filename,
    song: { source: "spotify", song_id: SPOTIFY_ID },
};
const library = {
    cursor: 1, full: true,
    tracks: [{
        id: TRACK_ID, file: filename, size: 1024,
        title: "Title", artist: "Artist",
    }],
    deleted: [],
};
const mockMusic = {
    lstat: jest.fn().mockResolvedValue({
        isDirectory: () => true, isSymbolicLink: () => false,
    }),
    realpath: jest.fn().mockResolvedValue("/music"),
    access: jest.fn().mockResolvedValue(undefined),
};
const remote = () => {
    const get = jest.fn().mockImplementation(async (url: string) => {
        if (url.endsWith("/api/server/info")) return { status: 200, data: server };
        if (url.endsWith("/api/auth/status")) return { status: 200, data: auth };
        if (url.endsWith("/api/queue")) return { status: 200, data: [job] };
        if (url.endsWith("/api/v1/library?since=0")) return { status: 200, data: library };
        if (url.includes("/stream?format=original")) return {
            status: 206,
            headers: { "content-range": "bytes 0-63/1024" },
            data: audio,
        };
        throw new Error("unexpected URL");
    });
    return get;
};
const run = (get: jest.Mock, options: NodeJS.ProcessEnv = env) =>
    inspectNativeDowntifyImport(
        USER, options, "/music", {
            http: { get } as unknown as Pick<AxiosInstance, "get">,
            music: mockMusic as unknown as Pick<typeof fs, "lstat" | "realpath" | "access">,
        },
    );

beforeEach(() => { jest.clearAllMocks(); });

describe("Native Downtify import transport preflight", () => {
    it("fails closed without an active, owner-bound pairing and makes no network requests", async () => {
        const get = remote();
        expect((await run(get, { ...env, KIMA_DOWNTIFY_ENABLED: "false" })).state).toBe("disabled");
        expect((await run(get, { ...env, KIMA_DOWNTIFY_OWNER_KIMA_USER_ID: "other" })).state).toBe("unbound");
        expect((await run(get, { ...env, KIMA_DOWNTIFY_DEVICE_TOKEN: "wrong" })).state).toBe("misconfigured");
        expect(get).not.toHaveBeenCalled();
    });

    it("never sends a token to an unverified Downtify server", async () => {
        const get = remote();
        get.mockResolvedValueOnce({ status: 200, data: { ...server, server_id: "wrong_server" } });
        const result = await run(get);
        expect(result.state).toBe("incompatible");
        expect(get).toHaveBeenCalledTimes(1);
        expect(get.mock.calls[0][1].headers.Authorization).toBeUndefined();
    });

    it("requires exact device identity before requesting queue or library", async () => {
        const get = remote();
        get.mockResolvedValueOnce({ status: 200, data: server })
            .mockResolvedValueOnce({ status: 200, data: { ...auth, user: { id: 44, username: "remote" } } });
        const result = await run(get);
        expect(result.state).toBe("unauthorized");
        expect(get).toHaveBeenCalledTimes(2);
        expect(get.mock.calls[1][1].headers.Authorization).toBe("Bearer " + TOKEN);
    });

    it("checks a bounded original Range stream without writing or disclosing a filename", async () => {
        const get = remote();
        const result = await run(get);
        expect(result).toEqual({
            state: "original_stream_verified",
            serverVerified: true,
            accountVerified: true,
            musicRootAccessible: true,
            originalStreamChecked: true,
            autoImportAvailable: false,
            importerCutoverAuthorized: false,
            libraryImportVerified: false,
            filesChanged: false,
        });
        expect(get).toHaveBeenCalledTimes(5);
        const [streamUrl, opts] = get.mock.calls[4];
        expect(streamUrl).toBe("http://downtify:8000/api/v1/tracks/" + TRACK_ID + "/stream?format=original");
        expect(opts.headers.Range).toBe("bytes=0-63");
        expect(opts.headers["Accept-Encoding"]).toBe("identity");
        expect(opts.maxRedirects).toBe(0);
        expect(opts.maxContentLength).toBe(128);
        expect(JSON.stringify(result)).not.toContain(TOKEN);
        expect(JSON.stringify(result)).not.toContain(filename);
        expect(JSON.stringify(result)).not.toContain(TRACK_ID);
    });

    it("rejects old/unowned completed jobs instead of checking a different user's music", async () => {
        const get = remote();
        get.mockResolvedValueOnce({ status: 200, data: server })
            .mockResolvedValueOnce({ status: 200, data: auth })
            .mockResolvedValueOnce({ status: 200, data: [{ ...job, user_ids: [9] }] });
        const result = await run(get);
        expect(result.state).toBe("no_completed_track");
        expect(get).toHaveBeenCalledTimes(3);
    });

    it("requires unambiguous matching library track, not a path guessed from the queue", async () => {
        const get = remote();
        get.mockResolvedValueOnce({ status: 200, data: server })
            .mockResolvedValueOnce({ status: 200, data: auth })
            .mockResolvedValueOnce({ status: 200, data: [job] })
            .mockResolvedValueOnce({ status: 200, data: { ...library, tracks: [
                library.tracks[0],
                { ...library.tracks[0], id: "t1111111111111111" },
            ] } });
        expect((await run(get)).state).toBe("ambiguous");
        expect(get).toHaveBeenCalledTimes(4);
    });

    it("does not treat a byte-range failure or wrong audio as cutover permission", async () => {
        const get = remote();
        get.mockResolvedValueOnce({ status: 200, data: server })
            .mockResolvedValueOnce({ status: 200, data: auth })
            .mockResolvedValueOnce({ status: 200, data: [job] })
            .mockResolvedValueOnce({ status: 200, data: library })
            .mockResolvedValueOnce({
                status: 200, headers: {}, data: Buffer.from("fLaC"),
            });
        const failed = await run(get);
        expect(failed.state).toBe("stream_unavailable");
        expect(failed.filesChanged).toBe(false);

        const unsupported = remote();
        unsupported.mockResolvedValueOnce({ status: 200, data: server })
            .mockResolvedValueOnce({ status: 200, data: auth })
            .mockResolvedValueOnce({ status: 200, data: [job] })
            .mockResolvedValueOnce({ status: 200, data: library })
            .mockResolvedValueOnce({
                status: 206, headers: { "content-range": "bytes 0-63/1024" },
                data: Buffer.alloc(64),
            });
        expect((await run(unsupported)).state).toBe("header_unverified");
    });

    it("fails closed when the library root is missing or symlinked", async () => {
        mockMusic.realpath.mockResolvedValueOnce("/another/music");
        const get = remote();
        const result = await run(get);
        expect(result.state).toBe("music_unavailable");
        expect(get).not.toHaveBeenCalled();
    });
});
