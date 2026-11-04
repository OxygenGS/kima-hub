/**
 * Default-OFF single-track Downtify submission. Status goes from prepared to
 * dispatching BEFORE an external POST; uncertain replies are never retried.
 * No music file or existing Kima DownloadJob is touched.
 */
import axios, { type AxiosInstance } from "axios";
import { prisma } from "../utils/db";
import { readDowntifyConfig } from "./downtifyClient";
import { checkSpotifyLibraryEvidence } from "./spotifyLibraryEvidence";
import { parseSpotifyDownloadLink } from "./spotifyLinkIntake";

export type DispatchCapability = "disabled" | "unbound" | "misconfigured" | "available";
export type DispatchState =
    | DispatchCapability | "not_found" | "already_attempted" | "unsupported"
    | "invalid_intent" | "confirmation_required" | "library_present"
    | "needs_library_review" | "remote_unavailable" | "remote_unauthorized"
    | "remote_incompatible" | "remote_has_failed_job" | "already_in_remote_queue"
    | "already_claimed" | "submitted" | "dispatch_unknown";
export interface DispatchResult {
    state: DispatchState;
    libraryVerified: false;
    downloadInKimaVerified: false;
    remotePostSent: boolean;
}
type Target = {
    base: URL; token: string; expectedUserId: number;
    expectedUsername: string; expectedServerId: string;
};
type Capability = { state: DispatchCapability; target?: Target };

const INTENT_ID = /^[A-Za-z0-9_-]{5,128}$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const SERVER_ID = /^[A-Za-z0-9_-]{8,128}$/;
const USERNAME = /^[^\u0000-\u001f\u007f]{1,100}$/;

function record(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === "object" && !Array.isArray(v);
}
function cleanText(v: unknown, max: number): string | null {
    if (typeof v !== "string") return null;
    const value = v.trim();
    return value && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value)
        ? value : null;
}
const outcome = (state: DispatchState, sent = false): DispatchResult => ({
    state, libraryVerified: false, downloadInKimaVerified: false, remotePostSent: sent,
});

function readTarget(userId: string, env: NodeJS.ProcessEnv): Capability {
    if (env.KIMA_DOWNTIFY_TRACK_SUBMISSION_ENABLED !== "true" ||
        env.KIMA_SPOTIFY_INTENTS_ENABLED !== "true") return { state: "disabled" };
    if (!userId || env.KIMA_DOWNTIFY_OWNER_KIMA_USER_ID?.trim() !== userId) {
        return { state: "unbound" };
    }
    const config = readDowntifyConfig(env);
    if (config.state !== "configured") return { state: "misconfigured" };
    const expectedUsername = env.KIMA_DOWNTIFY_EXPECTED_USERNAME?.trim();
    const expectedServerId = env.KIMA_DOWNTIFY_EXPECTED_SERVER_ID?.trim();
    const rawId = env.KIMA_DOWNTIFY_EXPECTED_USER_ID?.trim() || "";
    const expectedUserId = Number(rawId);
    if (!expectedUsername || !USERNAME.test(expectedUsername) ||
        !expectedServerId || !SERVER_ID.test(expectedServerId) ||
        !/^[1-9]\d{0,9}$/.test(rawId) || !Number.isSafeInteger(expectedUserId)) {
        return { state: "misconfigured" };
    }
    return {
        state: "available",
        target: {
            base: config.base, token: config.token,
            expectedUserId, expectedUsername, expectedServerId,
        },
    };
}

/** Does not contact Downtify and never returns any operator secrets. */
export function getDispatchCapability(userId: string, env: NodeJS.ProcessEnv = process.env) {
    const state = readTarget(userId, env).state;
    return { state, canSubmit: state === "available", singleTrackOnly: true as const };
}

/** Never blindly forward remote objects, URLs, file paths or unknown keys. */
function validSong(raw: unknown, id: string, url: string): Record<string, unknown> | null {
    if (!record(raw) || raw.source !== "spotify" || raw.song_id !== id ||
        raw.url !== url) return null;
    const name = cleanText(raw.name, 200);
    const artists = Array.isArray(raw.artists) && raw.artists.length > 0 &&
        raw.artists.length <= 12 ? raw.artists.map(x => cleanText(x, 140)) : [];
    if (!name || artists.length === 0 || artists.some(x => x === null) ||
        typeof raw.duration !== "number" || !Number.isFinite(raw.duration) ||
        raw.duration < 1 || raw.duration > 7200) return null;

    const safeArtists = artists as string[];
    const song: Record<string, unknown> = {
        song_id: id, source: "spotify", url, name, artists: safeArtists,
        artist: safeArtists.join(", ").slice(0, 500),
        album_name: cleanText(raw.album_name, 200) || "",
        duration: Math.round(raw.duration),
    };
    if (typeof raw.explicit === "boolean") song.explicit = raw.explicit;
    if (Number.isSafeInteger(raw.year) && (raw.year as number) >= 1900 &&
        (raw.year as number) <= 2100) song.year = raw.year;
    if (Number.isSafeInteger(raw.track_number) && (raw.track_number as number) > 0 &&
        (raw.track_number as number) <= 999) song.track_number = raw.track_number;
    if (Number.isSafeInteger(raw.album_track_total) && (raw.album_track_total as number) > 0 &&
        (raw.album_track_total as number) <= 999) song.album_track_total = raw.album_track_total;
    return song;
}

function client(target: Target, http: Pick<AxiosInstance, "get" | "post">) {
    const headers = { Accept: "application/json", Authorization: "Bearer " + target.token };
    return {
        get: async (p: string, authenticated: boolean): Promise<unknown> => {
            const response = await http.get<unknown>(new URL(p, target.base).toString(), {
                headers: authenticated ? headers : { Accept: "application/json" },
                timeout: 8000, maxContentLength: 512 * 1024,
                maxRedirects: 0, proxy: false,
            });
            return response.data;
        },
        post: async (p: string, body: unknown): Promise<unknown> => {
            const response = await http.post<unknown>(
                new URL(p, target.base).toString(), body, {
                    headers: { ...headers, "Content-Type": "application/json" },
                    timeout: 8000, maxContentLength: 16 * 1024,
                    maxBodyLength: 16 * 1024, maxRedirects: 0, proxy: false,
                }
            );
            return response.data;
        },
    };
}
function remoteError(e: unknown): DispatchState {
    const status = axios.isAxiosError(e) ? e.response?.status : undefined;
    return status === 401 || status === 403 ? "remote_unauthorized" : "remote_unavailable";
}

export async function dispatchPreparedSpotifyTrack(
    userId: string,
    intentId: string,
    acknowledgedUnverified: boolean,
    env: NodeJS.ProcessEnv = process.env,
    http: Pick<AxiosInstance, "get" | "post"> = axios,
): Promise<DispatchResult> {
    const cap = readTarget(userId, env);
    if (cap.state !== "available" || !cap.target) return outcome(cap.state);
    if (!INTENT_ID.test(intentId)) return outcome("not_found");

    const intent = await prisma.spotifyDownloadIntent.findFirst({
        where: { id: intentId, userId },
        select: {
            id: true, kind: true, spotifyId: true,
            canonicalUrl: true, status: true,
        },
    });
    if (!intent) return outcome("not_found");
    if (intent.status !== "prepared") return outcome("already_attempted");
    if (intent.kind !== "track") return outcome("unsupported");

    const parsed = parseSpotifyDownloadLink(intent.canonicalUrl);
    if (!parsed || parsed.kind !== "track" ||
        parsed.canonicalUrl !== intent.canonicalUrl ||
        parsed.intentKey !== "spotify:track:" + intent.spotifyId ||
        !SPOTIFY_ID.test(intent.spotifyId)) return outcome("invalid_intent");
    if (acknowledgedUnverified !== true) return outcome("confirmation_required");

    // Fresh, server-side check; never trust stale UI metadata or an absent
    // NAS mount. No false "missing" verdict from an unverified catalog row.
    let evidence;
    try {
        evidence = await checkSpotifyLibraryEvidence(intent.canonicalUrl);
    } catch {
        return outcome("needs_library_review");
    }
    if (evidence?.status === "recording_match_on_disk") return outcome("library_present");
    if (evidence?.status !== "no_verified_match") return outcome("needs_library_review");

    const bound = client(cap.target, http);
    const owner = cap.target;
    let remoteSong: Record<string, unknown> | null = null;
    let existingRemote = false;
    try {
        // Public identity probe WITHOUT Authorization before token use.
        const info = await bound.get("/api/server/info", false);
        if (!record(info) || info.product !== "Downtify" ||
            info.api_version !== 1 || info.require_sign_in !== true ||
            info.server_id !== owner.expectedServerId) return outcome("remote_incompatible");

        const auth = await bound.get("/api/auth/status", true);
        if (!record(auth) || auth.signed_in !== true ||
            auth.auth_disabled !== false || auth.via !== "device" ||
            !record(auth.user) ||
            auth.user.id !== owner.expectedUserId ||
            typeof auth.user.username !== "string" ||
            auth.user.username.toLowerCase() !== owner.expectedUsername.toLowerCase()) {
            return outcome("remote_unauthorized");
        }

        // An administrator sees all users' queue rows. Only the pinned
        // account's membership in user_ids establishes remote ownership.
        const queue = await bound.get("/api/queue", true);
        if (!Array.isArray(queue) || queue.length > 5000) return outcome("remote_incompatible");
        const owned = queue.find(item => record(item) && record(item.song) &&
            item.song.song_id === intent.spotifyId && Array.isArray(item.user_ids) &&
            item.user_ids.includes(owner.expectedUserId));
        if (record(owned) && owned.status === "error") return outcome("remote_has_failed_job");
        existingRemote = record(owned) &&
            ["queued", "downloading", "done"].includes(String(owned.status));

        if (!existingRemote) {
            const uri = new URL("/api/song/url", owner.base);
            uri.searchParams.set("url", intent.canonicalUrl);
            const resolved = await bound.get(uri.pathname + uri.search, true);
            remoteSong = validSong(resolved, intent.spotifyId, intent.canonicalUrl);
            if (!remoteSong) return outcome("remote_incompatible");
        }
    } catch (e: unknown) {
        return outcome(remoteError(e));
    }

    // A single atomic claimant may POST; all other concurrent requests
    // observe a non-prepared status and MUST NOT retry.
    const claim = await prisma.spotifyDownloadIntent.updateMany({
        where: { id: intent.id, userId, status: "prepared" },
        data: {
            status: "dispatching",
            dispatchStartedAt: new Date(),
            remoteSongId: intent.spotifyId,
        },
    });
    if (claim.count !== 1) return outcome("already_claimed");

    if (existingRemote) {
        try {
            await prisma.spotifyDownloadIntent.updateMany({
                where: { id: intent.id, userId, status: "dispatching" },
                data: { status: "submitted" },
            });
            return outcome("already_in_remote_queue");
        } catch {
            // In doubt the claimed request stays blocked from retry.
            return outcome("dispatch_unknown");
        }
    }

    try {
        // /api/download/url blocks until file complete. /batch is async.
        const result = await bound.post("/api/download/batch", {
            songs: [remoteSong], generate_m3u: false,
        });
        if (!record(result) || result.count !== 1 ||
            !Array.isArray(result.job_ids) || result.job_ids.length !== 1 ||
            result.job_ids[0] !== intent.spotifyId) {
            await prisma.spotifyDownloadIntent.updateMany({
                where: { id: intent.id, userId, status: "dispatching" },
                data: { status: "dispatch_unknown" },
            }).catch(() => {});
            return outcome("dispatch_unknown", true);
        }

        await prisma.spotifyDownloadIntent.updateMany({
            where: { id: intent.id, userId, status: "dispatching" },
            data: { status: "submitted" },
        });
        // Submitted is NOT imported, decoded, indexed or playable.
        return outcome("submitted", true);
    } catch {
        await prisma.spotifyDownloadIntent.updateMany({
            where: { id: intent.id, userId, status: "dispatching" },
            data: { status: "dispatch_unknown" },
        }).catch(() => {});
        // Lost HTTP replies are ambiguous. Never reset to "prepared".
        return outcome("dispatch_unknown", true);
    }
}
