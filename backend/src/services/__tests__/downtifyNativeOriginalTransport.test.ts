import { Readable } from "stream";
import type { AxiosInstance } from "axios";
import {
    boundedOriginalBytes,
    getVerifiedNativeLibraryChanges,
    openNativeDowntifyOriginal,
} from "../downtifyNativeOriginalTransport";

const token = "dtfy_synthetic_device_token_0123456789abcdef";
const spotifyId = "0123456789ABCDEFGHIJKL";
const serverId = "server_identity_123";
const filename = "Artists/Test Album/01 - Sample.flac";
const trackId = "t0123456789abcdef";
const env: NodeJS.ProcessEnv = {
    KIMA_DOWNTIFY_ENABLED: "true",
    KIMA_DOWNTIFY_URL: "http://downtify:8000",
    KIMA_DOWNTIFY_DEVICE_TOKEN: token,
    KIMA_DOWNTIFY_OWNER_KIMA_USER_ID: "owner-1",
    KIMA_DOWNTIFY_EXPECTED_USER_ID: "9",
    KIMA_DOWNTIFY_EXPECTED_USERNAME: "downloader",
    KIMA_DOWNTIFY_EXPECTED_SERVER_ID: serverId,
};
const owner = "owner-1";
const server = {
    product: "Downtify", api_version: 1,
    server_id: serverId, require_sign_in: true,
};
const auth = {
    signed_in: true, via: "device", auth_disabled: false,
    user: { id: 9, username: "downloader" },
};
const job = {
    status: "done", song: { source: "spotify", song_id: spotifyId },
    user_ids: [9], filename,
};
const bytes = Buffer.concat([Buffer.from("fLaC"), Buffer.alloc(1020, 0x22)]);
const library = {
    full: true, cursor: 1,
    tracks: [{
        id: trackId, file: filename, title: "Sample", artist: "Example",
        album: "Demo", duration: 23.45, size: bytes.byteLength,
    }],
    deleted: [],
};
const ok = {
    server, auth, queue: [job], library,
    stream: {
        status: 200,
        headers: {
            "content-length": String(bytes.byteLength),
            "content-type": "audio/flac",
        },
        data: Readable.from([bytes]),
    },
};
type Fixture = typeof ok;
function remote(overrides: Partial<Fixture> = {}) {
    const state = { ...ok, ...overrides };
    const get = jest.fn().mockImplementation(async (url: string) => {
        if (url.endsWith("/api/server/info")) return { status: 200, data: state.server };
        if (url.endsWith("/api/auth/status")) return { status: 200, data: state.auth };
        if (url.endsWith("/api/queue")) return { status: 200, data: state.queue };
        if (url.includes("/api/v1/library?since=")) return { status: 200, data: state.library };
        if (url.endsWith("/stream?format=original")) return state.stream;
        throw Error("unexpected URL " + url);
    });
    const load = () => openNativeDowntifyOriginal(
        owner, spotifyId, env,
        { http: { get } as unknown as Pick<AxiosInstance, "get"> },
    );
    return { get, load };
}
async function gather(input: AsyncIterable<Buffer>): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const data of input) chunks.push(data);
    return Buffer.concat(chunks);
}

describe("Native Downtify original audio transport (no file writes)", () => {
    it("does not make requests with disabled or foreign account settings", async () => {
        const { get } = remote();
        const http = { http: { get } as unknown as Pick<AxiosInstance, "get"> };
        expect((await openNativeDowntifyOriginal(owner, spotifyId, {
            ...env, KIMA_DOWNTIFY_ENABLED: "false",
        }, http)).state).toBe("disabled");
        expect((await openNativeDowntifyOriginal("another-owner", spotifyId, env, http)).state)
            .toBe("unbound");
        expect((await openNativeDowntifyOriginal(owner, "not-spotify", env, http)).state)
            .toBe("misconfigured");
        expect(get).not.toHaveBeenCalled();
    });

    it("never exposes the paired device token before validating the exact server identity", async () => {
        const { get, load } = remote({ server: { ...server, server_id: "different_server" } });
        expect((await load()).state).toBe("incompatible");
        expect(get).toHaveBeenCalledTimes(1);
        expect(get.mock.calls[0][1].headers.Authorization).toBeUndefined();
    });

    it("rejects another remote user's identity before requesting jobs or audio", async () => {
        const { get, load } = remote({
            auth: { ...auth, user: { id: 42, username: "downloader" } },
        });
        expect((await load()).state).toBe("unauthorized");
        expect(get).toHaveBeenCalledTimes(2);
    });

    it("selects exactly one owner-attributed completed job and one library track", async () => {
        const { get, load } = remote({
            queue: [job, { ...job, user_ids: [11], song: {
                source: "spotify", song_id: "123456789ABCDEFGHIJKLM",
            } }],
        });
        const result = await load();
        expect(result.state).toBe("ready");
        if (result.state !== "ready") throw Error("unreachable");
        expect(result.expectedBytes).toBe(bytes.length);
        expect(result.remoteTrackId).toBe(trackId);
        expect(result.autoImportApproved).toBe(false);
        expect(result.libraryImportVerified).toBe(false);
        expect(await gather(result.chunks)).toEqual(bytes);
        expect(get).toHaveBeenCalledTimes(5);
        expect(get.mock.calls[0][1].headers.Authorization).toBeUndefined();
        expect(get.mock.calls.slice(1).every(c => c[1].headers.Authorization === "Bearer " + token))
            .toBe(true);
        expect(get.mock.calls[4][1]).toMatchObject({
            responseType: "stream", maxRedirects: 0, proxy: false,
        });
    });

    it("rejects a remote job which is not owned or complete", async () => {
        const { get, load } = remote({ queue: [{ ...job, user_ids: [11] }] });
        expect((await load()).state).toBe("not_completed");
        expect(get).toHaveBeenCalledTimes(3);
    });

    it("rejects duplicate queue jobs even when both claim the correct owner", async () => {
        const { get, load } = remote({ queue: [job, job] });
        expect((await load()).state).toBe("ambiguous_job");
        expect(get).toHaveBeenCalledTimes(3);
    });

    it("never trusts a path supplied by the remote queue as a local destination", async () => {
        const { get, load } = remote({ queue: [{
            ...job, filename: "../../secrets.env",
        }] });
        expect((await load()).state).toBe("invalid_metadata");
        expect(get).toHaveBeenCalledTimes(3);
    });

    it("rejects missing or duplicate library rows and oversized sources", async () => {
        const missing = remote({ library: { ...library, tracks: [] } });
        expect((await missing.load()).state).toBe("not_in_library");
        const duplicate = remote({ library: {
            ...library, tracks: [...library.tracks, ...library.tracks],
        } });
        expect((await duplicate.load()).state).toBe("ambiguous_library");
        const huge = remote({ library: {
            ...library, tracks: [{ ...library.tracks[0], size: 300 * 1024 * 1024 }],
        } });
        expect((await huge.load()).state).toBe("invalid_metadata");
    });

    it("rejects short/encoded streams without reading them", async () => {
        const raw = Readable.from([bytes]);
        const { load } = remote({ stream: {
            status: 200,
            headers: {
                "content-length": "42", "content-type": "audio/flac",
            }, data: raw,
        } });
        expect((await load()).state).toBe("stream_unavailable");
        expect(raw.destroyed).toBe(true);
    });

    it("rejects a server response with mismatched Content-Type or body status", async () => {
        const { load } = remote({ stream: {
            status: 302,
            headers: {
                "content-length": String(bytes.length), "content-type": "text/html",
            }, data: Readable.from([bytes]),
        } });
        expect((await load()).state).toBe("stream_unavailable");
    });
});

describe("Owner-verified incremental remote library feed", () => {
    const fetch = (since: number, changes: Partial<typeof library> = {}) => {
        const { get } = remote({library: {
            ...library, full: since === 0, cursor: since+1, ...changes,
        }});
        const load = () => getVerifiedNativeLibraryChanges(
            owner, since, env,
            {http:{get} as unknown as Pick<AxiosInstance,"get">},
        );
        return {get,load};
    };

    it("gets a full library cursor baseline without revealing any local music paths", async () => {
        const {get,load}=fetch(0);
        const result=await load();
        expect(result.state).toBe("ready");
        if(result.state!=="ready")throw Error("unreachable");
        expect(result.full).toBe(true);
        expect(result.cursor).toBe(1);
        expect(get).toHaveBeenCalledTimes(3);
        expect(get.mock.calls[0][1].headers.Authorization).toBeUndefined();
        expect(get.mock.calls[2][1].headers.Authorization).toBe("Bearer "+token);
    });

    it("fetches only remote changes after the verified baseline cursor", async () => {
        const {get,load}=fetch(42);
        const result=await load();
        expect(result.state).toBe("ready");
        if(result.state!=="ready")throw Error("unreachable");
        expect(result.full).toBe(false);
        expect(result.cursor).toBe(43);
        expect(get.mock.calls[2][0]).toContain("since=42");
    });

    it("rejects a rollback or corrupted remote library sequence", async () => {
        const {load}=fetch(42,{cursor:40});
        expect((await load()).state).toBe("incompatible");
    });

    it("fails closed when the paired server identity has changed", async () => {
        const {get}=remote({server:{...server,server_id:"another-server"}});
        const result=await getVerifiedNativeLibraryChanges(
            owner,0,env,{http:{get} as unknown as Pick<AxiosInstance,"get">},
        );
        expect(result.state).toBe("incompatible");
        expect(get).toHaveBeenCalledTimes(1);
    });

    it("rejects foreign account identity before retrieving any private library rows", async () => {
        const {get}=remote({auth:{...auth,user:{id:123,username:"downloader"}}});
        const result=await getVerifiedNativeLibraryChanges(
            owner,0,env,{http:{get} as unknown as Pick<AxiosInstance,"get">},
        );
        expect(result.state).toBe("unauthorized");
        expect(get).toHaveBeenCalledTimes(2);
    });
});

describe("Bounded original media stream", () => {
    it("reads exact bytes with no buffering of full recording", async () => {
        expect(await gather(boundedOriginalBytes(
            Readable.from([bytes.subarray(0, 64), bytes.subarray(64)]),
            bytes.length,
        ))).toEqual(bytes);
    });

    it("rejects a truncated remote response", async () => {
        await expect(gather(boundedOriginalBytes(
            Readable.from([bytes.subarray(0, 100)]), bytes.length,
        ))).rejects.toThrow("incomplete audio stream");
    });

    it("rejects a stream containing excess bytes", async () => {
        await expect(gather(boundedOriginalBytes(
            Readable.from([bytes, Buffer.from("padding")]), bytes.length,
        ))).rejects.toThrow("invalid audio byte chunk");
    });

    it("propagates a remote stream interruption and closes source", async () => {
        async function* interrupted(): AsyncGenerator<Buffer> {
            yield bytes.subarray(0, 64);
            throw new Error("remote disconnected");
        }
        await expect(gather(boundedOriginalBytes(
            interrupted(), bytes.length,
        ))).rejects.toThrow("remote disconnected");
    });
});
