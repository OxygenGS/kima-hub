/**
 * Native Downtify-to-Kima import feasibility check (READ-ONLY).
 *
 * Proves that a pinned, owner-bound Downtify device can fetch an original
 * 64-byte audio sample by track ID using the public mobile v1 API. This is
 * the transport needed for a future direct importer without a shared staging
 * mount. It does not copy files, create jobs, change the database or allow
 * disabling an existing importer. A successful source probe is NOT a safe
 * importer cutover or a proof of recording identity.
 *
 * Never include remote paths, credentials, track IDs or HTTP response bodies
 * in the admin API result.
 */
import axios, { type AxiosInstance } from "axios";
import { constants as fsConstants, promises as fs } from "fs";
import * as path from "path";
import { config } from "../config";
import { readDowntifyConfig } from "./downtifyClient";
import { audioHeaderMatchesExtension, detectAudioContainer } from "./downtifyAudioHeaderEvidence";

export type NativeImportPreflightState =
    | "disabled" | "unbound" | "misconfigured" | "music_unavailable"
    | "unavailable" | "unauthorized" | "incompatible" | "no_completed_track"
    | "ambiguous" | "library_unavailable" | "no_library_match"
    | "stream_unavailable" | "header_unverified" | "original_stream_verified";

export interface NativeImportPreflight {
    state: NativeImportPreflightState;
    serverVerified: boolean;
    accountVerified: boolean;
    musicRootAccessible: boolean;
    originalStreamChecked: boolean;
    // Hard fail-closed boundary for the first native importer PR.
    autoImportAvailable: false;
    importerCutoverAuthorized: false;
    libraryImportVerified: false;
    filesChanged: false;
}
type MusicAccess = Pick<typeof fs, "lstat" | "realpath" | "access">;
type Dependencies = {
    http: Pick<AxiosInstance, "get">;
    music: MusicAccess;
};
const defaults: Dependencies = { http: axios, music: fs };
const SERVER_ID = /^[a-zA-Z0-9_-]{8,128}$/;
const REMOTE_ID = /^[1-9]\d{0,9}$/;
const TRACK_ID = /^t[0-9a-f]{16}$/;
const AUDIO_EXT = new Set([".flac", ".mp3", ".m4a", ".ogg", ".opus", ".wav"]);
const MAX_QUEUE_ROWS = 5000;
const MAX_LIBRARY_ROWS = 100000;
const MAX_TRACK_BYTES = 256 * 1024 * 1024;
const AUDIO_SAMPLE_BYTES = 64;

function record(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === "object" && !Array.isArray(v);
}
function outcome(
    state: NativeImportPreflightState, serverVerified = false,
    accountVerified = false, musicRootAccessible = false,
    originalStreamChecked = false,
): NativeImportPreflight {
    return {
        state, serverVerified, accountVerified, musicRootAccessible,
        originalStreamChecked, autoImportAvailable: false,
        importerCutoverAuthorized: false, libraryImportVerified: false,
        filesChanged: false,
    };
}
function validFilename(value: unknown): value is string {
    if (typeof value !== "string" || value.length < 5 || value.length > 1024 ||
        value.includes("\\") || value.includes("\0") ||
        path.posix.isAbsolute(value) || path.win32.isAbsolute(value) ||
        value.split("/").some(part => !part || part === ".." || part === ".")) return false;
    return AUDIO_EXT.has(path.posix.extname(value).toLowerCase());
}
async function checkMusicRoot(root: string, reader: MusicAccess): Promise<boolean> {
    if (!path.isAbsolute(root) || root === "/" || root.includes("\0")) return false;
    try {
        const stat = await reader.lstat(root);
        if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
        if (await reader.realpath(root) !== path.resolve(root)) return false;
        // This is a read-only transport check. The destination-specific write
        // and mount-marker checks run only on explicit import enablement.
        await reader.access(root, fsConstants.R_OK | fsConstants.X_OK);
        return true;
    } catch {
        return false;
    }
}
/**
 * Verifies server identity BEFORE ever sending a token. All endpoints are
 * generated from the verified base, not from an upstream URL or user input.
 * maxRedirects=0 and proxy=false prevent credential forwarding.
 */
export async function inspectNativeDowntifyImport(
    adminId: string,
    env: NodeJS.ProcessEnv = process.env,
    musicRoot: string = config.music.musicPath,
    deps: Dependencies = defaults,
): Promise<NativeImportPreflight> {
    if (!adminId || env.KIMA_DOWNTIFY_ENABLED !== "true") return outcome("disabled");
    if (env.KIMA_DOWNTIFY_OWNER_KIMA_USER_ID?.trim() !== adminId) return outcome("unbound");

    const cfg = readDowntifyConfig(env);
    const idText = env.KIMA_DOWNTIFY_EXPECTED_USER_ID?.trim() || "";
    const expectedUsername = env.KIMA_DOWNTIFY_EXPECTED_USERNAME?.trim() || "";
    const serverId = env.KIMA_DOWNTIFY_EXPECTED_SERVER_ID?.trim() || "";
    if (cfg.state !== "configured" || !REMOTE_ID.test(idText) ||
        !SERVER_ID.test(serverId) || expectedUsername.length < 1 ||
        expectedUsername.length > 100) return outcome("misconfigured");

    const musicAvailable = await checkMusicRoot(musicRoot, deps.music);
    if (!musicAvailable) return outcome("music_unavailable");
    const expectedUserId = Number(idText);
    const request = async (
        endpoint: string, authenticated: boolean, maxBytes: number,
        extra?: Record<string, string>,
    ) => deps.http.get(new URL(endpoint, cfg.base).toString(), {
        headers: {
            Accept: authenticated && extra ? "application/octet-stream" : "application/json",
            ...(authenticated ? { Authorization: "Bearer " + cfg.token } : {}),
            ...(extra || {}),
        },
        timeout: 8000, maxRedirects: 0, proxy: false,
        maxContentLength: maxBytes, responseType: extra ? "arraybuffer" : "json",
        validateStatus: (status: number) => extra ? status === 206 : status === 200,
    });

    let serverVerified = false;
    let accountVerified = false;
    try {
        const server = (await request("/api/server/info", false, 16 * 1024)).data;
        if (!record(server) || server.product !== "Downtify" ||
            server.api_version !== 1 || server.require_sign_in !== true ||
            server.server_id !== serverId) return outcome("incompatible");
        serverVerified = true;

        const auth = (await request("/api/auth/status", true, 16 * 1024)).data;
        if (!record(auth) || auth.signed_in !== true || auth.via !== "device" ||
            auth.auth_disabled !== false || !record(auth.user) ||
            auth.user.id !== expectedUserId || typeof auth.user.username !== "string" ||
            auth.user.username.toLowerCase() !== expectedUsername.toLowerCase()) {
            return outcome("unauthorized", serverVerified);
        }
        accountVerified = true;

        const queue = (await request("/api/queue", true, 3 * 1024 * 1024)).data;
        if (!Array.isArray(queue) || queue.length > MAX_QUEUE_ROWS) {
            return outcome("incompatible", true, true, true);
        }
        // A queue row may be visible to admin tokens yet not belong to our
        // pinned user. Filter by numeric user IDs, final status and filename.
        const candidates = queue.filter(row =>
            record(row) && row.status === "done" &&
            Array.isArray(row.user_ids) && row.user_ids.includes(expectedUserId) &&
            record(row.song) &&
            (row.song.source === "spotify" || row.song.source === undefined) &&
            typeof row.song.song_id === "string" &&
            /^[a-zA-Z0-9]{22}$/.test(row.song.song_id) &&
            validFilename(row.filename)
        );
        if (candidates.length === 0) return outcome("no_completed_track", true, true, true);

        // A full library snapshot is needed to translate filename to opaque
        // stable mobile track ID, not to pick a path for local file access.
        // Never return the remote filename or id from this function.
        const library = (await request("/api/v1/library?since=0", true, 16 * 1024 * 1024)).data;
        if (!record(library) || !Array.isArray(library.tracks) ||
            library.full !== true || library.tracks.length > MAX_LIBRARY_ROWS) {
            return outcome("library_unavailable", true, true, true);
        }
        // Multiple completed tracks are normal. Select ONE unambiguous
        // owner-attributed queue/file pair, instead of rejecting the entire
        // library whenever two different completed songs exist.
        // Count file paths before matching. A repeated queue path or repeated
        // library path NEVER qualifies as safe original-audio evidence.
        const queueCount = new Map<string, number>();
        for (const candidate of candidates) {
            const filename = candidate.filename as string;
            queueCount.set(filename, (queueCount.get(filename) || 0) + 1);
        }
        const matches = new Map<string, Record<string, unknown>[]>();
        for (const row of library.tracks) {
            if (!record(row) || !TRACK_ID.test(String(row.id)) ||
                !validFilename(row.file) || !Number.isSafeInteger(row.size) ||
                (row.size as number) < AUDIO_SAMPLE_BYTES ||
                (row.size as number) > MAX_TRACK_BYTES ||
                !queueCount.has(row.file)) continue;
            const name = row.file as string;
            const sameFile = matches.get(name) || [];
            sameFile.push(row);
            matches.set(name, sameFile);
        }
        if (!matches.size) return outcome("no_library_match", true, true, true);
        const safeTracks: Record<string, unknown>[] = [];
        for (const [name, rows] of matches) {
            if (queueCount.get(name) === 1 && rows.length === 1) {
                safeTracks.push(rows[0]);
            }
        }
        if (!safeTracks.length) return outcome("ambiguous", true, true, true);
        // Stable selection across changes in API enumeration order.
        safeTracks.sort((a, b) =>
            String(a.file).localeCompare(String(b.file), "en") ||
            String(a.id).localeCompare(String(b.id), "en"));
        const track = safeTracks[0];
        const ext = path.posix.extname(track.file as string).toLowerCase();
        const stream = await request(
            "/api/v1/tracks/" + track.id + "/stream?format=original",
            true, 128, { Range: "bytes=0-63", "Accept-Encoding": "identity" },
        );
        const contentRange = stream.headers?.["content-range"];
        const bytes = Buffer.isBuffer(stream.data) ? stream.data : Buffer.from(stream.data);
        if (stream.status !== 206 ||
            contentRange !== "bytes 0-63/" + track.size ||
            bytes.byteLength !== AUDIO_SAMPLE_BYTES ||
            (stream.headers?.["content-encoding"] || "identity") !== "identity") {
            return outcome("stream_unavailable", true, true, true);
        }
        const container = detectAudioContainer(bytes);
        if (container === "unknown" ||
            !audioHeaderMatchesExtension(ext, container, bytes)) {
            return outcome("header_unverified", true, true, true);
        }
        // Only a read-only remote sample; not a complete validated recording.
        return outcome("original_stream_verified", true, true, true, true);
    } catch (err: unknown) {
        const code = axios.isAxiosError(err) ? err.response?.status : undefined;
        return outcome(
            code === 401 || code === 403 ? "unauthorized" :
                serverVerified ? "unavailable" : "unavailable",
            serverVerified, accountVerified, musicAvailable,
        );
    }
}
