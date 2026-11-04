/**
 * v1.18.0 B2: strictly single-owner, read-only Downtify job feed.
 *
 * A paired Downtify administrator can see *everyone's* jobs. Never trust
 * queue visibility as proof of a Kima user's ownership: require an explicit
 * operator-owned account binding and verify each job's remote user_ids.
 *
 * This deliberately has no write actions or import side effects.
 */
import axios, { type AxiosInstance } from "axios";
import { createHash } from "crypto";
import { readDowntifyConfig } from "./downtifyClient";

export type BoundDowntifyState =
    | "disabled" | "unbound" | "misconfigured" | "unauthorized"
    | "unavailable" | "incompatible" | "ready";

export type BoundDowntifyPhase =
    | "queued" | "processing" | "downloaded" | "failed" | "unknown";

export interface BoundDowntifyJob {
    id: string;
    subject: string;
    engine: "downtify";
    phase: BoundDowntifyPhase;
    progress: number | null;
    libraryVerification: "not_checked";
}

export interface BoundDowntifyOverview {
    state: BoundDowntifyState;
    items: BoundDowntifyJob[];
    displayed: number;
    hasMore: boolean;
}

const LIMIT = 100;
const RESPONSE_LIMIT_BYTES = 512 * 1024;
const TIMEOUT_MS = 4000;

const result = (state: BoundDowntifyState, items: BoundDowntifyJob[] = [], hasMore = false):
    BoundDowntifyOverview => ({ state, items, displayed: items.length, hasMore });

const record = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);

function cleanLabel(value: unknown): string {
    if (typeof value !== "string") return "";
    return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
}

function jobPhase(value: unknown): BoundDowntifyPhase {
    switch (value) {
        case "queued": return "queued";
        case "downloading": return "processing";
        case "done": return "downloaded";
        case "error": return "failed";
        default: return "unknown";
    }
}

function normalizeProgress(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) return null;
    return value;
}

/** A matched Kima owner is necessary but not sufficient: remote ownership is verified too. */
export async function getBoundDowntifyQueue(
    kimaUserId: string,
    env: NodeJS.ProcessEnv = process.env,
    http: Pick<AxiosInstance, "get"> = axios,
): Promise<BoundDowntifyOverview> {
    const config = readDowntifyConfig(env);
    if (config.state === "disabled") return result("disabled");
    if (config.state !== "configured") return result("misconfigured");

    const kimaOwnerId = env.KIMA_DOWNTIFY_OWNER_KIMA_USER_ID?.trim();
    const remoteUsername = env.KIMA_DOWNTIFY_EXPECTED_USERNAME?.trim();

    if (!kimaOwnerId || !remoteUsername || remoteUsername.length > 100 ||
        /[\u0000-\u001f\u007f]/.test(remoteUsername)) {
        return result("unbound");
    }
    // Never even contact Downtify on behalf of another Kima account.
    if (kimaUserId !== kimaOwnerId) return result("unbound");

    const get = async (path: string, authenticated: boolean): Promise<unknown> => {
        const response = await http.get<unknown>(new URL(path, config.base).toString(), {
            headers: {
                Accept: "application/json",
                ...(authenticated ? { Authorization: `Bearer ${config.token}` } : {}),
            },
            timeout: TIMEOUT_MS,
            maxRedirects: 0,
            maxContentLength: RESPONSE_LIMIT_BYTES,
            proxy: false,
        });
        return response.data;
    };

    try {
        // Do not send token before verifying the public Downtify identity.
        const info = await get("/api/server/info", false);
        if (!record(info) || info.product !== "Downtify" ||
            info.api_version !== 1 || info.require_sign_in !== true) {
            return result("incompatible");
        }

        const auth = await get("/api/auth/status", true);
        if (!record(auth) || auth.signed_in !== true || auth.via !== "device" ||
            auth.auth_disabled !== false || !record(auth.user) ||
            !Number.isSafeInteger(auth.user.id) || (auth.user.id as number) < 1 ||
            typeof auth.user.username !== "string" ||
            auth.user.username.toLowerCase() !== remoteUsername.toLowerCase()) {
            return result("unauthorized");
        }
        const remoteUserId = auth.user.id as number;

        const remoteQueue = await get("/api/queue", true);
        if (!Array.isArray(remoteQueue) || remoteQueue.length > 5000) return result("incompatible");

        const items: BoundDowntifyJob[] = [];
        let hasMore = false;
        const seen = new Set<string>();
        for (const entry of remoteQueue) {
            if (!record(entry) || !Array.isArray(entry.user_ids) ||
                !entry.user_ids.includes(remoteUserId) || !record(entry.song)) continue;

            const rawId = entry.song.song_id;
            if (typeof rawId !== "string" || !rawId.trim() || rawId.length > 1000) continue;
            const subject = cleanLabel(entry.song.name);
            if (!subject) continue;

            // Never leak raw source IDs/URLs, filesystem paths, errors or peers.
            const id = "dtfy-" + createHash("sha256").update(rawId).digest("hex").slice(0, 24);
            if (seen.has(id)) continue;
            seen.add(id);

            if (items.length >= LIMIT) { hasMore = true; break; }
            items.push({
                id, subject, engine: "downtify", phase: jobPhase(entry.status),
                progress: normalizeProgress(entry.progress), libraryVerification: "not_checked",
            });
        }

        return result("ready", items, hasMore);
    } catch (error: unknown) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        return result(status === 401 || status === 403 ? "unauthorized" : "unavailable");
    }
}
