/**
 * v1.18 D3 — explicit, read-only verification of a single submitted Spotify
 * intent against the pinned Downtify account. Remote 'done' NEVER means
 * imported, indexed, decoded or playable in Kima. No database/file writes.
 */
import axios, { type AxiosInstance } from "axios";
import { prisma } from "../utils/db";
import { readDowntifyConfig } from "./downtifyClient";
import { parseSpotifyDownloadLink } from "./spotifyLinkIntake";

type ReconciliationGate = "disabled" | "unbound" | "misconfigured" | "available";
export type ReconciliationState = ReconciliationGate | "not_found" | "not_attempted" |
    "invalid_intent" | "unavailable" | "unauthorized" | "incompatible" |
    "no_verified_job" | "ambiguous" | "verified";
export type RemoteTransferPhase = "not_checked" | "queued" | "processing" |
    "downloaded" | "failed" | "unknown";

export interface RemoteIntentVerification {
    state: ReconciliationState;
    remotePhase: RemoteTransferPhase;
    remoteOwnershipVerified: boolean;
    libraryVerification: "not_checked";
    playbackVerified: false;
    filesChanged: false;
    retryAllowed: false;
}

type Target = {
    base: URL;
    token: string;
    userId: number;
    username: string;
    serverId: string;
};

const INTENT_ID = /^[A-Za-z0-9_-]{5,128}$/;
const SERVER_ID = /^[A-Za-z0-9_-]{8,128}$/;
const REMOTE_ID = /^[1-9]\d{0,9}$/;
const USERNAME = /^[^\u0000-\u001f\u007f]{1,100}$/;
const MAX_QUEUE_SIZE = 5000;

function record(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function response(
    state: ReconciliationState,
    remotePhase: RemoteTransferPhase = "not_checked",
): RemoteIntentVerification {
    return {
        state, remotePhase, remoteOwnershipVerified: state === "verified",
        libraryVerification: "not_checked", playbackVerified: false,
        filesChanged: false, retryAllowed: false,
    };
}

function targetFor(userId: string, env: NodeJS.ProcessEnv): {
    state: ReconciliationGate; target?: Target;
} {
    // Independent read-only gate: disabling submission must not enable or
    // prevent an explicitly authorized investigation of a lost POST reply.
    if (env.KIMA_DOWNTIFY_RECONCILIATION_ENABLED !== "true" ||
        env.KIMA_SPOTIFY_INTENTS_ENABLED !== "true") return { state: "disabled" };
    if (!userId || userId !== env.KIMA_DOWNTIFY_OWNER_KIMA_USER_ID?.trim()) {
        return { state: "unbound" };
    }

    const config = readDowntifyConfig(env);
    if (config.state !== "configured") return { state: "misconfigured" };
    const rawId = env.KIMA_DOWNTIFY_EXPECTED_USER_ID?.trim() || "";
    const username = env.KIMA_DOWNTIFY_EXPECTED_USERNAME?.trim() || "";
    const serverId = env.KIMA_DOWNTIFY_EXPECTED_SERVER_ID?.trim() || "";
    const numericId = Number(rawId);
    if (!REMOTE_ID.test(rawId) || !Number.isSafeInteger(numericId) ||
        !USERNAME.test(username) || !SERVER_ID.test(serverId)) {
        return { state: "misconfigured" };
    }
    return {
        state: "available",
        target: { base: config.base, token: config.token, userId: numericId, username, serverId },
    };
}

/** Static eligibility check; no token, user ID or remote request in response. */
export function getReconciliationCapability(
    userId: string, env: NodeJS.ProcessEnv = process.env,
) {
    const state = targetFor(userId, env).state;
    return { state, canCheck: state === "available", singleTrackOnly: true as const };
}

function remotePhase(value: unknown): RemoteTransferPhase {
    switch (value) {
        case "queued": return "queued";
        case "downloading": return "processing";
        case "done": return "downloaded";
        case "error": return "failed";
        default: return "unknown";
    }
}

/**
 * Internal, privileged remote evidence for D5. `filename` is untrusted and
 * MUST NEVER be returned directly by an HTTP endpoint. Both the exact Kima
 * owner and remote numeric account membership are rechecked on every call.
 */
export interface OwnedDowntifyFileCandidate {
    verification: RemoteIntentVerification;
    filename: unknown;
}

function internal(
    state: ReconciliationState,
    phase: RemoteTransferPhase = "not_checked",
    filename: unknown = null,
): OwnedDowntifyFileCandidate {
    return { verification: response(state, phase), filename };
}

export async function inspectOwnedDowntifyFileCandidate(
    userId: string,
    intentId: string,
    env: NodeJS.ProcessEnv = process.env,
    http: Pick<AxiosInstance, "get"> = axios,
): Promise<OwnedDowntifyFileCandidate> {
    const gate = targetFor(userId, env);
    if (gate.state !== "available" || !gate.target) return internal(gate.state);
    if (!INTENT_ID.test(intentId)) return internal("not_found");

    // The authenticated Kima owner is mandatory, even for Kima administrators.
    const intent = await prisma.spotifyDownloadIntent.findFirst({
        where: { id: intentId, userId },
        select: {
            kind: true, spotifyId: true, canonicalUrl: true,
            status: true, remoteSongId: true,
        },
    });
    if (!intent) return internal("not_found");
    if (!["submitted", "dispatching", "dispatch_unknown"].includes(intent.status)) {
        return internal("not_attempted");
    }
    const parsed = parseSpotifyDownloadLink(intent.canonicalUrl);
    if (intent.kind !== "track" || !parsed || parsed.kind !== "track" ||
        parsed.canonicalUrl !== intent.canonicalUrl ||
        parsed.intentKey !== "spotify:track:" + intent.spotifyId ||
        intent.remoteSongId !== intent.spotifyId) {
        return internal("invalid_intent");
    }

    const target = gate.target;
    const get = async (path: string, authorized: boolean): Promise<unknown> => {
        const res = await http.get<unknown>(new URL(path, target.base).toString(), {
            headers: {
                Accept: "application/json",
                ...(authorized ? { Authorization: "Bearer " + target.token } : {}),
            },
            timeout: 4000,
            maxRedirects: 0,
            maxContentLength: 512 * 1024,
            proxy: false,
        });
        return res.data;
    };

    try {
        // Never send the device token before verifying the public server ID.
        const info = await get("/api/server/info", false);
        if (!record(info) || info.product !== "Downtify" ||
            info.api_version !== 1 || info.require_sign_in !== true ||
            info.server_id !== target.serverId) return internal("incompatible");

        const auth = await get("/api/auth/status", true);
        if (!record(auth) || auth.signed_in !== true ||
            auth.auth_disabled !== false || auth.via !== "device" ||
            !record(auth.user) || auth.user.id !== target.userId ||
            typeof auth.user.username !== "string" ||
            auth.user.username.toLowerCase() !== target.username.toLowerCase()) {
            return internal("unauthorized");
        }

        const queue = await get("/api/queue", true);
        if (!Array.isArray(queue) || queue.length > MAX_QUEUE_SIZE) {
            return internal("incompatible");
        }
        // Administrator tokens can see other users' jobs. Ownership requires
        // BOTH the numeric user_ids membership and immutable remote song ID.
        const matches = queue.filter(item =>
            record(item) && record(item.song) &&
            item.song.song_id === intent.remoteSongId &&
            (item.song.source === undefined || item.song.source === "spotify") &&
            Array.isArray(item.user_ids) && item.user_ids.includes(target.userId)
        );
        if (matches.length > 1) return internal("ambiguous");
        if (matches.length === 0) return internal("no_verified_job");
        return internal(
            "verified",
            remotePhase(matches[0].status),
            matches[0].status === "done" ? matches[0].filename : null,
        );
    } catch (error: unknown) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        return internal(status === 401 || status === 403 ? "unauthorized" : "unavailable");
    }
}

/** Public D3 result intentionally strips untrusted remote filename and paths. */
export async function verifyRemoteSpotifyIntent(
    userId: string,
    intentId: string,
    env: NodeJS.ProcessEnv = process.env,
    http: Pick<AxiosInstance, "get"> = axios,
): Promise<RemoteIntentVerification> {
    const { verification } = await inspectOwnedDowntifyFileCandidate(userId, intentId, env, http);
    return verification;
}
