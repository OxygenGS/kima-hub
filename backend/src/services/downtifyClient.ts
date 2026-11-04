/**
 * v1.18.0 phase A: read-only Downtify capability probe.
 *
 * No download or filesystem operation is possible through this adapter.
 * Server URL and paired-device token come only from operator-controlled env,
 * never a request parameter. Keep the old import service running unchanged.
 */
import axios, { type AxiosInstance } from "axios";

export type DowntifyProbeState =
    | "disabled"
    | "misconfigured"
    | "unavailable"
    | "unauthorized"
    | "incompatible"
    | "ready";

export interface DowntifyEngineStatus {
    engine: "downtify";
    enabled: boolean;
    configured: boolean;
    state: DowntifyProbeState;
    version?: string;
    queue?: {
        paused: boolean;
        state: "running" | "pausing" | "paused";
        active: number;
    };
}

type DowntifyConfig =
    | { state: "disabled" | "misconfigured" }
    | { state: "configured"; base: URL; token: string };

const REQUEST_TIMEOUT_MS = 4000;
const MAX_RESPONSE_BYTES = 16 * 1024;

function isLocalHttpHost(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
        host === "localhost" ||
        host === "::1" ||
        host.endsWith(".localhost") ||
        host.endsWith(".local") ||
        host.endsWith(".internal") ||
        host.endsWith(".lan") ||
        /^[a-z0-9][a-z0-9-]*$/.test(host)
    ) return true;

    const octets = host.split(".");
    if (octets.length !== 4 || octets.some((x) => !/^\d{1,3}$/.test(x) || Number(x) > 255)) return false;
    const a = Number(octets[0]), b = Number(octets[1]);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168);
}

export function readDowntifyConfig(env: NodeJS.ProcessEnv = process.env): DowntifyConfig {
    if (env.KIMA_DOWNTIFY_ENABLED !== "true") return { state: "disabled" };

    const rawUrl = env.KIMA_DOWNTIFY_URL?.trim();
    const token = env.KIMA_DOWNTIFY_DEVICE_TOKEN?.trim();
    // Current Downtify paired-device tokens start with dtfy_. Only these work
    // on authenticated queue-read APIs without copying a browser session.
    if (!rawUrl || !token || !/^dtfy_[A-Za-z0-9_-]{16,512}$/.test(token)) {
        return { state: "misconfigured" };
    }

    try {
        const base = new URL(rawUrl);
        if (
            !["http:", "https:"].includes(base.protocol) ||
            !base.hostname ||
            base.username || base.password ||
            base.search || base.hash ||
            base.pathname !== "/" ||
            (base.protocol === "http:" && !isLocalHttpHost(base.hostname))
        ) return { state: "misconfigured" };
        return { state: "configured", base, token };
    } catch {
        return { state: "misconfigured" };
    }
}

function validRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeVersion(value: unknown): string | undefined {
    return typeof value === "string" && /^\d{1,4}(?:\.\d{1,4}){1,3}(?:[-+][A-Za-z0-9.-]{1,20})?$/.test(value)
        ? value
        : undefined;
}

/**
 * The health check is intentionally admin-only at the route. Never forward a
 * raw upstream response, address, account, token or error message to clients.
 */
export async function probeDowntify(
    env: NodeJS.ProcessEnv = process.env,
    http: Pick<AxiosInstance, "get"> = axios
): Promise<DowntifyEngineStatus> {
    const config = readDowntifyConfig(env);
    if (config.state !== "configured") {
        return {
            engine: "downtify",
            enabled: config.state !== "disabled",
            configured: false,
            state: config.state,
        };
    }

    const base: Omit<DowntifyEngineStatus, "state"> = {
        engine: "downtify",
        enabled: true,
        configured: true,
    };

    const request = async (path: string): Promise<unknown> => {
        const response = await http.get<unknown>(new URL(path, config.base).toString(), {
            headers: {
                Authorization: `Bearer ${config.token}`,
                Accept: "application/json",
            },
            timeout: REQUEST_TIMEOUT_MS,
            maxContentLength: MAX_RESPONSE_BYTES,
            maxRedirects: 0,
            proxy: false,
        });
        return response.data;
    };

    try {
        // Identity check first: do not send another request if this is not an
        // authenticated Downtify instance with compatible mobile API.
        const info = await request("/api/server/info");
        if (!validRecord(info) || info.product !== "Downtify" ||
            info.api_version !== 1 || info.require_sign_in !== true) {
            return { ...base, state: "incompatible" };
        }

        const version = safeVersion(info.version);
        const auth = await request("/api/auth/status");
        if (!validRecord(auth) || auth.signed_in !== true ||
            auth.via !== "device" || auth.auth_disabled !== false) {
            return { ...base, state: "unauthorized", version };
        }

        const queue = await request("/api/queue/state");
        if (!validRecord(queue) ||
            typeof queue.paused !== "boolean" ||
            !["running", "pausing", "paused"].includes(String(queue.state)) ||
            !Number.isSafeInteger(queue.active) || (queue.active as number) < 0) {
            return { ...base, state: "incompatible", version };
        }

        return {
            ...base,
            state: "ready",
            version,
            queue: {
                paused: queue.paused,
                state: queue.state as "running" | "pausing" | "paused",
                active: queue.active as number,
            },
        };
    } catch (error: unknown) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        return {
            ...base,
            state: status === 401 || status === 403 ? "unauthorized" : "unavailable",
        };
    }
}
