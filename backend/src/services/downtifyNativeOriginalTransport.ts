/**
 * Owner-pinned original-audio transport for the future native importer.
 *
 * Uses Downtify's authenticated mobile v1 library+stream endpoints, no
 * operator staging mount. The result is INTERNAL only; never serialize
 * the remote filename/track ID or the returned stream to an HTTP client.
 *
 * This module cannot write, queue, delete or import a Kima music file.
 * In particular a valid 200/Content-Length and byte-complete stream is
 * not proof that Spotify recording identity, decode and storage are safe.
 */
import axios, { type AxiosInstance } from "axios";
import * as path from "path";
import { readDowntifyConfig } from "./downtifyClient";

const SERVER_ID = /^[A-Za-z0-9_-]{8,128}$/;
const USERNAME = /^[^\u0000-\u001f\u007f]{1,100}$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const TRACK_ID = /^t[0-9a-f]{16}$/;
const EXTENSIONS = new Set([".flac", ".mp3", ".m4a", ".ogg", ".opus", ".wav"]);
const MAX_QUEUE = 5000;
const MAX_LIBRARY = 100000;
const MAX_AUDIO_BYTES = 256 * 1024 * 1024;
const MAX_JSON = 16 * 1024 * 1024;

export type NativeSourceState =
    | "disabled" | "unbound" | "misconfigured" | "incompatible"
    | "unauthorized" | "unavailable" | "not_completed"
    | "ambiguous_job" | "not_in_library" | "ambiguous_library"
    | "invalid_metadata" | "stream_unavailable" | "ready";

type AudioStream = AsyncIterable<Buffer>;

export interface VerifiedOriginalSource {
    state: "ready";
    // Internal only. A caller MUST re-check exact owner and recording identity.
    remoteTrackId: string;
    remoteFilename: string;
    title: string;
    artist: string;
    album: string;
    durationSeconds: number;
    expectedBytes: number;
    chunks: AudioStream;
    /** Close the authenticated response if identity checks abort before
     * consumption. No upstream connection may be left open. */
    cancel: () => void;
    autoImportApproved: false;
    libraryImportVerified: false;
}
type SourceFailure = {
    state: Exclude<NativeSourceState, "ready">;
    autoImportApproved: false;
    libraryImportVerified: false;
};
export type NativeSourceResult = VerifiedOriginalSource | SourceFailure;

type SourceDeps = { http: Pick<AxiosInstance, "get"> };
const depsDefault: SourceDeps = { http: axios };

function fail(state: SourceFailure["state"]): SourceFailure {
    return { state, autoImportApproved: false, libraryImportVerified: false };
}
function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function validRemoteFile(value: unknown): value is string {
    if (typeof value !== "string" || value.length < 5 || value.length > 1024 ||
        value.includes("\\") || value.includes("\0") ||
        path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) return false;
    const parts = value.split("/");
    if (parts.some(part => !part || part === "." || part === ".." || part.includes(":"))) return false;
    return EXTENSIONS.has(path.posix.extname(value).toLowerCase());
}
function headerValue(headers: unknown, name: string): string | null {
    if (!record(headers)) return null;
    const v = headers[name];
    return typeof v === "string" ? v : null;
}
function validHeaderBytes(data: unknown): data is AsyncIterable<Buffer> {
    return !!data && typeof data === "object" &&
        Symbol.asyncIterator in data &&
        typeof (data as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function";
}

/** Deterministic byte-limited transfer; partial/oversized streams throw.
 * The caller MUST treat any exception as an uncertain claimed import.
 */
export async function* boundedOriginalBytes(
    source: AsyncIterable<Buffer>, expectedBytes: number,
): AsyncGenerator<Buffer> {
    if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 64 ||
        expectedBytes > MAX_AUDIO_BYTES) {
        throw new Error("invalid audio length");
    }
    let total = 0;
    try {
        for await (const data of source) {
            if (!Buffer.isBuffer(data) || data.byteLength < 1 ||
                total + data.byteLength > expectedBytes) {
                throw new Error("invalid audio byte chunk");
            }
            total += data.byteLength;
            yield data;
        }
        if (total !== expectedBytes) throw new Error("incomplete audio stream");
    } finally {
        // Stop any unused response stream if a later audio verifier rejects it.
        const closable = source as { destroy?: () => void };
        if (typeof closable.destroy === "function") closable.destroy();
    }
}

/**
 * Look up a single completed Spotify job and resolve its original mobile
 * library track. Exactly one job+library candidate is mandatory.
 * No HTTP token is sent until the pinned public server identity matches.
 */
export async function openNativeDowntifyOriginal(
    kimaUserId: string,
    spotifyTrackId: string,
    env: NodeJS.ProcessEnv = process.env,
    deps: SourceDeps = depsDefault,
): Promise<NativeSourceResult> {
    if (env.KIMA_DOWNTIFY_ENABLED !== "true") return fail("disabled");
    if (!kimaUserId || env.KIMA_DOWNTIFY_OWNER_KIMA_USER_ID?.trim() !== kimaUserId) {
        return fail("unbound");
    }
    if (!SPOTIFY_ID.test(spotifyTrackId)) return fail("misconfigured");
    const cfg = readDowntifyConfig(env);
    const userIdText = env.KIMA_DOWNTIFY_EXPECTED_USER_ID?.trim() || "";
    const expectedUsername = env.KIMA_DOWNTIFY_EXPECTED_USERNAME?.trim() || "";
    const serverId = env.KIMA_DOWNTIFY_EXPECTED_SERVER_ID?.trim() || "";
    const remoteUserId = Number(userIdText);
    if (cfg.state !== "configured" || !/^[1-9]\d{0,9}$/.test(userIdText) ||
        !Number.isSafeInteger(remoteUserId) ||
        !USERNAME.test(expectedUsername) || !SERVER_ID.test(serverId)) {
        return fail("misconfigured");
    }

    const get = async (endpoint: string, authenticated: boolean, size: number) => {
        return deps.http.get<unknown>(new URL(endpoint, cfg.base).toString(), {
            headers: {
                Accept: "application/json",
                ...(authenticated ? { Authorization: "Bearer " + cfg.token } : {}),
            },
            timeout: 8000,
            maxRedirects: 0, proxy: false,
            maxContentLength: size, responseType: "json",
        });
    };
    try {
        const server = (await get("/api/server/info", false, 16 * 1024)).data;
        if (!record(server) || server.product !== "Downtify" ||
            server.api_version !== 1 || server.require_sign_in !== true ||
            server.server_id !== serverId) return fail("incompatible");

        const auth = (await get("/api/auth/status", true, 16 * 1024)).data;
        if (!record(auth) || auth.signed_in !== true || auth.auth_disabled !== false ||
            auth.via !== "device" || !record(auth.user) ||
            auth.user.id !== remoteUserId ||
            typeof auth.user.username !== "string" ||
            auth.user.username.toLowerCase() !== expectedUsername.toLowerCase()) {
            return fail("unauthorized");
        }
        const queue = (await get("/api/queue", true, 3 * 1024 * 1024)).data;
        if (!Array.isArray(queue) || queue.length > MAX_QUEUE) return fail("incompatible");
        const jobs = queue.filter(job =>
            record(job) && job.status === "done" && record(job.song) &&
            job.song.song_id === spotifyTrackId &&
            (job.song.source === "spotify" || job.song.source === undefined) &&
            Array.isArray(job.user_ids) && job.user_ids.includes(remoteUserId)
        );
        if (jobs.length === 0) return fail("not_completed");
        if (jobs.length !== 1) return fail("ambiguous_job");
        const filename = (jobs[0] as Record<string, unknown>).filename;
        if (!validRemoteFile(filename)) return fail("invalid_metadata");

        const library = (await get("/api/v1/library?since=0", true, MAX_JSON)).data;
        if (!record(library) || library.full !== true ||
            !Array.isArray(library.tracks) || library.tracks.length > MAX_LIBRARY) {
            return fail("unavailable");
        }
        const matches = library.tracks.filter(track =>
            record(track) && track.file === filename
        );
        if (matches.length === 0) return fail("not_in_library");
        if (matches.length !== 1) return fail("ambiguous_library");
        const row = matches[0] as Record<string, unknown>;
        const size = row.size;
        const duration = row.duration;
        if (typeof row.id !== "string" || !TRACK_ID.test(row.id) ||
            typeof size !== "number" || !Number.isSafeInteger(size) ||
            size < 64 || size > MAX_AUDIO_BYTES ||
            typeof duration !== "number" || !Number.isFinite(duration) ||
            duration < 1 || duration > 24 * 60 * 60 ||
            typeof row.title !== "string" || !row.title.trim() ||
            row.title.length > 300 || typeof row.artist !== "string" ||
            !row.artist.trim() || row.artist.length > 300 ||
            (row.album !== undefined && typeof row.album !== "string")) {
            return fail("invalid_metadata");
        }

        // Read-only authenticated original stream, no redirect and no proxy.
        // Axios maxContentLength is NOT enforced for responseType="stream";
        // boundedOriginalBytes MUST limit the actual stream as it is consumed.
        const stream = await deps.http.get<unknown>(
            new URL("/api/v1/tracks/" + row.id + "/stream?format=original", cfg.base).toString(),
            {
                headers: {
                    Accept: "audio/*, application/octet-stream",
                    Authorization: "Bearer " + cfg.token,
                    "Accept-Encoding": "identity",
                },
                timeout: 15000, maxRedirects: 0, proxy: false,
                maxContentLength: MAX_AUDIO_BYTES,
                responseType: "stream",
                validateStatus: (status: number) => status === 200,
            },
        );
        const abort = () => {
            const streamBody = stream.data as { destroy?: () => void } | null;
            if (streamBody && typeof streamBody.destroy === "function") streamBody.destroy();
        };
        const length = headerValue(stream.headers, "content-length");
        const encoding = headerValue(stream.headers, "content-encoding");
        const mime = headerValue(stream.headers, "content-type");
        if (stream.status !== 200 || length !== String(size) ||
            (encoding !== null && encoding !== "identity") ||
            (mime !== null && !/^(audio\/[a-z0-9.+-]+|application\/octet-stream)(?:;|$)/i.test(mime)) ||
            !validHeaderBytes(stream.data)) {
            abort();
            return fail("stream_unavailable");
        }
        return {
            state: "ready",
            remoteTrackId: row.id, remoteFilename: filename,
            title: row.title as string, artist: row.artist as string,
            album: typeof row.album === "string" ? row.album : "",
            durationSeconds: duration, expectedBytes: size,
            chunks: boundedOriginalBytes(stream.data, size),
            cancel: abort,
            autoImportApproved: false, libraryImportVerified: false,
        };
    } catch (error: unknown) {
        const code = axios.isAxiosError(error) ? error.response?.status : undefined;
        return fail(code === 401 || code === 403 ? "unauthorized" : "unavailable");
    }
}


/** Internal-only snapshot for the durable importer and first-run baseline.
 * It is NOT an API response: queue items contain private filenames and IDs.
 */
export type NativeQueueSnapshot =
    | { state: "ready"; queue: unknown[] }
    | { state: Exclude<NativeSourceState, "ready">; queue: [] };
export async function getVerifiedNativeImportQueue(
    kimaUserId: string,
    env: NodeJS.ProcessEnv = process.env,
    deps: SourceDeps = depsDefault,
): Promise<NativeQueueSnapshot> {
    const empty = (state: Exclude<NativeSourceState, "ready">): NativeQueueSnapshot =>
        ({ state, queue: [] });
    if (env.KIMA_DOWNTIFY_ENABLED !== "true") return empty("disabled");
    if (!kimaUserId || env.KIMA_DOWNTIFY_OWNER_KIMA_USER_ID?.trim() !== kimaUserId) {
        return empty("unbound");
    }
    const cfg = readDowntifyConfig(env);
    const serverId = env.KIMA_DOWNTIFY_EXPECTED_SERVER_ID?.trim() || "";
    const userText = env.KIMA_DOWNTIFY_EXPECTED_USER_ID?.trim() || "";
    const username = env.KIMA_DOWNTIFY_EXPECTED_USERNAME?.trim() || "";
    if (cfg.state !== "configured" || !SERVER_ID.test(serverId) ||
        !/^[1-9]\d{0,9}$/.test(userText) || !USERNAME.test(username)) {
        return empty("misconfigured");
    }
    const get = async (endpoint: string, authenticated: boolean, limit: number) =>
        (await deps.http.get<unknown>(new URL(endpoint, cfg.base).toString(), {
            headers: {
                Accept: "application/json",
                ...(authenticated ? { Authorization: "Bearer " + cfg.token } : {}),
            },
            timeout: 8000, maxRedirects: 0, proxy: false,
            maxContentLength: limit, responseType: "json",
        })).data;
    try {
        const server = await get("/api/server/info", false, 16 * 1024);
        if (!record(server) || server.product !== "Downtify" ||
            server.api_version !== 1 || server.require_sign_in !== true ||
            server.server_id !== serverId) return empty("incompatible");
        const auth = await get("/api/auth/status", true, 16 * 1024);
        if (!record(auth) || !record(auth.user) || auth.signed_in !== true ||
            auth.via !== "device" || auth.auth_disabled !== false ||
            auth.user.id !== Number(userText) ||
            typeof auth.user.username !== "string" ||
            auth.user.username.toLowerCase() !== username.toLowerCase()) {
            return empty("unauthorized");
        }
        const queue = await get("/api/queue", true, 3 * 1024 * 1024);
        if (!Array.isArray(queue) || queue.length > MAX_QUEUE) return empty("incompatible");
        return { state: "ready", queue };
    } catch(error: unknown) {
        const code = axios.isAxiosError(error) ? error.response?.status : undefined;
        return empty(code === 401 || code === 403 ? "unauthorized" : "unavailable");
    }
}


/**
 * Incremental Downtify library changefeed, scoped to the exact paired owner.
 *
 * Crucial: the /api/queue feed may lose completed rows when cleaned and
 * later show old songs again. A first-activation queue snapshot alone cannot
 * prove "new since enabling". Downtify's mobile library sequence is
 * monotonic: keep its cursor and only consider files reported as NEW in a
 * later changefeed. Full resets are never treated as new import candidates.
 *
 * This returns private remote filenames only to internal workers.
 */
export type NativeLibraryChanges =
    | { state: "ready"; cursor: number; full: boolean; tracks: unknown[] }
    | { state: Exclude<NativeSourceState, "ready">;
        cursor: null; full: false; tracks: [] };

export async function getVerifiedNativeLibraryChanges(
    kimaUserId: string,
    since: number,
    env: NodeJS.ProcessEnv = process.env,
    deps: SourceDeps = depsDefault,
): Promise<NativeLibraryChanges> {
    const empty = (state: Exclude<NativeSourceState, "ready">): NativeLibraryChanges =>
        ({ state, cursor: null, full: false, tracks: [] });
    if (env.KIMA_DOWNTIFY_ENABLED !== "true") return empty("disabled");
    if (!kimaUserId || env.KIMA_DOWNTIFY_OWNER_KIMA_USER_ID?.trim() !== kimaUserId) {
        return empty("unbound");
    }
    if (!Number.isSafeInteger(since) || since < 0 || since > 2_147_483_647) {
        return empty("misconfigured");
    }
    const cfg = readDowntifyConfig(env);
    const serverId = env.KIMA_DOWNTIFY_EXPECTED_SERVER_ID?.trim() || "";
    const userText = env.KIMA_DOWNTIFY_EXPECTED_USER_ID?.trim() || "";
    const username = env.KIMA_DOWNTIFY_EXPECTED_USERNAME?.trim() || "";
    if (cfg.state !== "configured" || !SERVER_ID.test(serverId) ||
        !/^[1-9]\d{0,9}$/.test(userText) || !USERNAME.test(username)) {
        return empty("misconfigured");
    }
    const get = async (endpoint: string, authenticated: boolean, limit: number) =>
        (await deps.http.get<unknown>(new URL(endpoint, cfg.base).toString(), {
            headers: {
                Accept: "application/json",
                ...(authenticated ? { Authorization: "Bearer " + cfg.token } : {}),
            },
            timeout: 8000, maxRedirects: 0, proxy: false,
            maxContentLength: limit, responseType: "json",
        })).data;
    try {
        const server = await get("/api/server/info", false, 16 * 1024);
        if (!record(server) || server.product !== "Downtify" ||
            server.api_version !== 1 || server.require_sign_in !== true ||
            server.server_id !== serverId) return empty("incompatible");
        const auth = await get("/api/auth/status", true, 16 * 1024);
        if (!record(auth) || !record(auth.user) || auth.signed_in !== true ||
            auth.via !== "device" || auth.auth_disabled !== false ||
            auth.user.id !== Number(userText) ||
            typeof auth.user.username !== "string" ||
            auth.user.username.toLowerCase() !== username.toLowerCase()) {
            return empty("unauthorized");
        }
        const snapshot = await get(
            "/api/v1/library?since=" + since, true, MAX_JSON,
        );
        if (!record(snapshot) || typeof snapshot.cursor !== "number" ||
            !Number.isSafeInteger(snapshot.cursor) || snapshot.cursor < since ||
            snapshot.cursor > 2_147_483_647 ||
            typeof snapshot.full !== "boolean" ||
            !Array.isArray(snapshot.tracks) ||
            snapshot.tracks.length > MAX_LIBRARY ||
            !Array.isArray(snapshot.deleted)) {
            return empty("incompatible");
        }
        return {
            state: "ready",
            cursor: snapshot.cursor,
            full: snapshot.full,
            tracks: snapshot.tracks,
        };
    } catch (error: unknown) {
        const code = axios.isAxiosError(error) ? error.response?.status : undefined;
        return empty(code === 401 || code === 403 ? "unauthorized" : "unavailable");
    }
}
