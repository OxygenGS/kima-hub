/**
 * Owner-bound Downtify pairing configured from Settings, not process.env.
 *
 * Credentials are encrypted with Kima's existing XChaCha20-Poly1305 key and
 * never returned by an API. Each request constructs its own private env
 * projection; process.env is never mutated. Legacy operator-owned .env
 * configuration remains supported until an admin deliberately migrates it.
 *
 * All new pairings start with read-only queue, saved Spotify requests,
 * track submission and remote reconciliation OFF. Full source/audio checks
 * remain env/staging-only until a safe read-only mount is provisioned.
 */
import axios, { type AxiosInstance } from "axios";
import { prisma } from "../utils/db";
import { encrypt, decrypt } from "../utils/encryption";
import { readDowntifyConfig } from "./downtifyClient";

const PAIR_ID = "default";
const HTTP_TIMEOUT_MS = 4000;
const MAX_JSON_BYTES = 16 * 1024;
const USER_ID = /^[1-9]\d{0,9}$/;
const SERVER_ID = /^[A-Za-z0-9_-]{8,128}$/;
const CONTROLS = [
    "enabled", "spotifyIntentsEnabled", "trackSubmissionEnabled",
    "reconciliationEnabled",
] as const;

export type DowntifyControl = typeof CONTROLS[number];
export type IntegrationPairing = {
    baseUrl: string;
    deviceToken: string;
};
export type VerifiedDowntify = {
    baseUrl: string;
    expectedUsername: string;
    expectedUserId: number;
    expectedServerId: string;
    version: string | null;
};
export type DowntifyAdminStatus = {
    source: "database" | "environment" | "none";
    configured: boolean;
    enabled: boolean;
    url: string | null;
    username: string | null;
    ownerMatches: boolean;
    spotifyIntentsEnabled: boolean;
    trackSubmissionEnabled: boolean;
    reconciliationEnabled: boolean;
    tokenConfigured: boolean;
    fileVerificationManagedInDocker: true;
};

export class DowntifySetupError extends Error {
    constructor(public readonly state:
        "invalid_input" | "incompatible" | "unauthorized" |
        "unavailable" | "environment_managed" | "not_paired" |
        "confirmation_required") {
        super(state);
    }
}
function record(data: unknown): data is Record<string, unknown> {
    return typeof data === "object" && data !== null && !Array.isArray(data);
}
function safeVersion(value: unknown): string | null {
    return typeof value === "string" &&
        /^\d{1,4}(?:\.\d{1,4}){1,3}(?:[-+][A-Za-z0-9.-]{1,20})?$/.test(value)
        ? value : null;
}
function verifiedConfiguration(input: IntegrationPairing) {
    const rawEnv: NodeJS.ProcessEnv = {
        KIMA_DOWNTIFY_ENABLED: "true",
        KIMA_DOWNTIFY_URL: input.baseUrl,
        KIMA_DOWNTIFY_DEVICE_TOKEN: input.deviceToken,
    };
    const cfg = readDowntifyConfig(rawEnv);
    if (cfg.state !== "configured") throw new DowntifySetupError("invalid_input");
    return cfg;
}

/** Only GET public server identity before sending a token to that URL. */
export async function verifyDowntifyPair(
    input: IntegrationPairing,
    http: Pick<AxiosInstance, "get"> = axios,
): Promise<VerifiedDowntify> {
    const cfg = verifiedConfiguration(input);
    const get = async (pathname: string, authenticated: boolean) => {
        const response = await http.get<unknown>(new URL(pathname, cfg.base).toString(), {
            headers: {
                Accept: "application/json",
                ...(authenticated ? { Authorization: "Bearer " + cfg.token } : {}),
            },
            timeout: HTTP_TIMEOUT_MS,
            maxContentLength: MAX_JSON_BYTES,
            maxRedirects: 0,
            proxy: false,
        });
        return response.data;
    };
    let info: unknown;
    try {
        info = await get("/api/server/info", false);
    } catch {
        throw new DowntifySetupError("unavailable");
    }
    if (!record(info) || info.product !== "Downtify" ||
        info.api_version !== 1 || info.require_sign_in !== true ||
        typeof info.server_id !== "string" || !SERVER_ID.test(info.server_id)) {
        throw new DowntifySetupError("incompatible");
    }

    let auth: unknown;
    try {
        auth = await get("/api/auth/status", true);
    } catch (error) {
        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        throw new DowntifySetupError(status === 401 || status === 403 ? "unauthorized" : "unavailable");
    }
    if (!record(auth) || auth.signed_in !== true ||
        auth.via !== "device" || auth.auth_disabled !== false ||
        !record(auth.user) ||
        typeof auth.user.id !== "number" ||
        !Number.isSafeInteger(auth.user.id) || auth.user.id < 1 ||
        !USER_ID.test(String(auth.user.id)) ||
        typeof auth.user.username !== "string" ||
        auth.user.username.trim() !== auth.user.username ||
        !auth.user.username || auth.user.username.length > 100 ||
        /[\u0000-\u001f\u007f]/.test(auth.user.username)) {
        throw new DowntifySetupError("unauthorized");
    }
    return {
        baseUrl: cfg.base.toString(),
        expectedUsername: auth.user.username,
        expectedUserId: auth.user.id,
        expectedServerId: info.server_id,
        version: safeVersion(info.version),
    };
}

/** Re-check a saved pairing without exposing or resetting the stored token. */
export async function testSavedDowntifyPair(
    adminUserId: string,
    http: Pick<AxiosInstance, "get"> = axios,
): Promise<VerifiedDowntify> {
    const row = await prisma.downtifyIntegration.findUnique({ where: { id: PAIR_ID } });
    if (!row) throw new DowntifySetupError("not_paired");
    if (row.ownerKimaUserId !== adminUserId) throw new DowntifySetupError("unauthorized");
    let token: string;
    try {
        token = decrypt(row.deviceTokenEncrypted);
    } catch {
        throw new DowntifySetupError("unauthorized");
    }
    const verified = await verifyDowntifyPair({
        baseUrl: row.baseUrl, deviceToken: token,
    }, http);
    if (verified.expectedServerId !== row.expectedServerId ||
        verified.expectedUserId !== row.expectedUserId ||
        verified.expectedUsername.toLowerCase() !== row.expectedUsername.toLowerCase()) {
        throw new DowntifySetupError("incompatible");
    }
    return verified;
}

/** Never reveal token, remote account/server numeric identifiers or ciphertext. */
export async function getDowntifyAdminStatus(
    adminUserId: string,
): Promise<DowntifyAdminStatus> {
    const row = await prisma.downtifyIntegration.findUnique({ where: { id: PAIR_ID } });
    if (row) {
        return {
            source: "database",
            configured: true,
            enabled: row.enabled,
            url: row.baseUrl,
            username: row.expectedUsername,
            ownerMatches: row.ownerKimaUserId === adminUserId,
            spotifyIntentsEnabled: row.spotifyIntentsEnabled,
            trackSubmissionEnabled: row.trackSubmissionEnabled,
            reconciliationEnabled: row.reconciliationEnabled,
            tokenConfigured: !!row.deviceTokenEncrypted,
            fileVerificationManagedInDocker: true,
        };
    }
    const envConfigured = process.env.KIMA_DOWNTIFY_ENABLED === "true" ||
        !!process.env.KIMA_DOWNTIFY_DEVICE_TOKEN;
    return {
        source: envConfigured ? "environment" : "none",
        configured: envConfigured,
        enabled: process.env.KIMA_DOWNTIFY_ENABLED === "true",
        url: null, username: null, ownerMatches: false,
        spotifyIntentsEnabled: false, trackSubmissionEnabled: false,
        reconciliationEnabled: false, tokenConfigured: envConfigured,
        fileVerificationManagedInDocker: true,
    };
}

/**
 * Pair only after two read-only remote identity checks. A re-pair revokes
 * all UI-owned features (including any previous submit permission).
 * Existing env-managed deployments are never silently overridden.
 */
export async function pairDowntify(
    adminUserId: string,
    input: IntegrationPairing,
    http: Pick<AxiosInstance, "get"> = axios,
): Promise<VerifiedDowntify> {
    const previous = await prisma.downtifyIntegration.findUnique({ where: { id: PAIR_ID } });
    if (previous && previous.ownerKimaUserId !== adminUserId) {
        throw new DowntifySetupError("unauthorized");
    }
    if (process.env.KIMA_DOWNTIFY_ENABLED === "true" && !previous) {
        throw new DowntifySetupError("environment_managed");
    }
    const verified = await verifyDowntifyPair(input, http);
    const values = {
        baseUrl: verified.baseUrl,
        deviceTokenEncrypted: encrypt(input.deviceToken),
        ownerKimaUserId: adminUserId,
        expectedUsername: verified.expectedUsername,
        expectedUserId: verified.expectedUserId,
        expectedServerId: verified.expectedServerId,
        enabled: false, spotifyIntentsEnabled: false,
        trackSubmissionEnabled: false, reconciliationEnabled: false,
    };
    if (previous) {
        // A second administrator cannot win an ownership race after the
        // initial read: include the originally paired admin in the UPDATE.
        const updated = await prisma.downtifyIntegration.updateMany({
            where: { id: PAIR_ID, ownerKimaUserId: adminUserId },
            data: values,
        });
        if (updated.count !== 1) throw new DowntifySetupError("unauthorized");
    } else {
        try {
            await prisma.downtifyIntegration.create({
                data: { id: PAIR_ID, ...values },
            });
        } catch (err) {
            // Another pair may have won the unique default ID race. Do not
            // adopt or overwrite that owner's fresh credential binding.
            if ((err as { code?: string }).code === "P2002") {
                throw new DowntifySetupError("unauthorized");
            }
            throw err;
        }
    }
    return verified;
}

export type DowntifyControls = {
    enabled: boolean;
    spotifyIntentsEnabled: boolean;
    trackSubmissionEnabled: boolean;
    reconciliationEnabled: boolean;
};
export function safeControls(input: DowntifyControls): DowntifyControls {
    return {
        enabled: input.enabled,
        spotifyIntentsEnabled: input.enabled && input.spotifyIntentsEnabled,
        trackSubmissionEnabled:
            input.enabled && input.spotifyIntentsEnabled && input.trackSubmissionEnabled,
        reconciliationEnabled: input.enabled && input.reconciliationEnabled,
    };
}
export async function updateDowntifyControls(
    adminUserId: string,
    input: DowntifyControls,
    acknowledgedSubmit = false,
): Promise<DowntifyAdminStatus> {
    const row = await prisma.downtifyIntegration.findUnique({ where: { id: PAIR_ID } });
    if (!row) throw new DowntifySetupError("not_paired");
    if (row.ownerKimaUserId !== adminUserId) throw new DowntifySetupError("unauthorized");
    const next = safeControls(input);
    if (next.trackSubmissionEnabled && !row.trackSubmissionEnabled &&
        acknowledgedSubmit !== true) throw new DowntifySetupError("confirmation_required");
    // Prevent a transient state with downgraded requirements while submission
    // remains active. Never set trackSubmissionEnabled without Spotify intents.
    await prisma.downtifyIntegration.updateMany({
        where: { id: PAIR_ID, ownerKimaUserId: adminUserId },
        data: next,
    });
    return getDowntifyAdminStatus(adminUserId);
}

/**
 * Existing D1–D9 services already accept an env parameter. Construct a
 * request-local, DB-backed projection so old operator-only env deployments
 * continue to work without mutating process.env or restarting Docker.
 *
 * DB pairing explicitly takes precedence; corrupt encryption fails CLOSED.
 * The file evidence flags remain false: a browser cannot authorize a new
 * staging mount or grant write access to a music directory.
 */
export async function getDowntifyRuntimeEnv(
    fallback: NodeJS.ProcessEnv = process.env,
): Promise<NodeJS.ProcessEnv> {
    const row = await prisma.downtifyIntegration.findUnique({ where: { id: PAIR_ID } });
    if (!row) return fallback;
    const env: NodeJS.ProcessEnv = {
        ...fallback,
        KIMA_DOWNTIFY_ENABLED: "false",
        KIMA_DOWNTIFY_URL: row.baseUrl,
        KIMA_DOWNTIFY_DEVICE_TOKEN: "",
        KIMA_DOWNTIFY_OWNER_KIMA_USER_ID: row.ownerKimaUserId,
        KIMA_DOWNTIFY_EXPECTED_USERNAME: row.expectedUsername,
        KIMA_DOWNTIFY_EXPECTED_USER_ID: String(row.expectedUserId),
        KIMA_DOWNTIFY_EXPECTED_SERVER_ID: row.expectedServerId,
        KIMA_SPOTIFY_INTENTS_ENABLED: "false",
        KIMA_DOWNTIFY_TRACK_SUBMISSION_ENABLED: "false",
        KIMA_DOWNTIFY_RECONCILIATION_ENABLED: "false",
        KIMA_DOWNTIFY_STORAGE_PREFLIGHT_ENABLED: "false",
        KIMA_DOWNTIFY_SOURCE_EVIDENCE_ENABLED: "false",
        KIMA_DOWNTIFY_AUDIO_HEADER_ENABLED: "false",
        KIMA_DOWNTIFY_FULL_AUDIO_CHECK_ENABLED: "false",
        KIMA_DOWNTIFY_RECORDING_TAG_CHECK_ENABLED: "false",
    };
    if (!row.enabled) return env;
    try {
        const token = decrypt(row.deviceTokenEncrypted);
        // Reject key changes/corrupt data and malformed tokens; do not leak
        // any previous process.env credentials into this DB-owned binding.
        if (!token || readDowntifyConfig({
            KIMA_DOWNTIFY_ENABLED: "true",
            KIMA_DOWNTIFY_URL: row.baseUrl,
            KIMA_DOWNTIFY_DEVICE_TOKEN: token,
        }).state !== "configured") return env;
        env.KIMA_DOWNTIFY_DEVICE_TOKEN = token;
        env.KIMA_DOWNTIFY_ENABLED = "true";
        env.KIMA_SPOTIFY_INTENTS_ENABLED = row.spotifyIntentsEnabled ? "true" : "false";
        env.KIMA_DOWNTIFY_TRACK_SUBMISSION_ENABLED = row.trackSubmissionEnabled ? "true" : "false";
        env.KIMA_DOWNTIFY_RECONCILIATION_ENABLED = row.reconciliationEnabled ? "true" : "false";
    } catch {
        // Credential could not be decrypted: fail closed without logging it.
    }
    return env;
}
