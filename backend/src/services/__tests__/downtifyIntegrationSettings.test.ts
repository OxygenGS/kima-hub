import type { AxiosInstance } from "axios";
import { prisma } from "../../utils/db";
import { decrypt, isEncryptedFormat } from "../../utils/encryption";
import {
    getDowntifyRuntimeEnv, getDowntifyAdminStatus,
    pairDowntify, safeControls, updateDowntifyControls,
    verifyDowntifyPair, testSavedDowntifyPair,
} from "../downtifyIntegrationSettings";

jest.mock("../../utils/db", () => ({
    prisma: {
        downtifyIntegration: {
            findUnique: jest.fn(),
            create: jest.fn(),
            updateMany: jest.fn(),
        },
    },
}));
jest.mock("../../utils/logger", () => ({
    logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const db = prisma.downtifyIntegration;
const TOKEN = "dtfy_synthetic_devicetoken_for_downtify_test_23";
const BASE = "http://downtify:8000";
const INFO = {
    product: "Downtify", version: "3.2.0", api_version: 1,
    require_sign_in: true, server_id: "cf12b3c4f530731551690cc62b1365a1",
};
const AUTH = {
    signed_in: true, via: "device", auth_disabled: false,
    user: { id: 12, username: "downtify-owner" },
};
function client(...responses: unknown[]): Pick<AxiosInstance, "get"> {
    const values = responses.slice();
    return { get: jest.fn().mockImplementation(async () => ({ data: values.shift() })) } as unknown as Pick<AxiosInstance, "get">;
}
const pair = { baseUrl: BASE, deviceToken: TOKEN };
const expected = {
    baseUrl: "http://downtify:8000/",
    expectedUsername: "downtify-owner", expectedUserId: 12,
    expectedServerId: INFO.server_id, version: "3.2.0",
};
type Row = {
    id: string; baseUrl: string; deviceTokenEncrypted: string;
    ownerKimaUserId: string; expectedUsername: string;
    expectedUserId: number; expectedServerId: string;
    enabled: boolean; spotifyIntentsEnabled: boolean;
    trackSubmissionEnabled: boolean; reconciliationEnabled: boolean;
    nativeImportEnabled: boolean; nativeImportBaselineAt: Date | null;
};
let row: Row | null = null;
beforeEach(() => {
    jest.clearAllMocks();
    row = null;
    (db.findUnique as jest.Mock).mockImplementation(async () => row);
    (db.create as jest.Mock).mockImplementation(async ({ data }) => {
        if (row) throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
        row = { ...data } as Row;
        return row;
    });
    (db.updateMany as jest.Mock).mockImplementation(async ({ data }) => {
        if (!row) return { count: 0 };
        row = { ...row, ...data };
        return { count: 1 };
    });
});

describe("Downtify authenticated owner pairing", () => {
    it("rejects malformed URL, invalid token and unsolicited network requests", async () => {
        for (const bad of [
            { ...pair, deviceToken: "admin-password" },
            { ...pair, baseUrl: "http://public.example.org:8000" },
            { ...pair, baseUrl: "http://downtify:8000/api/queue" },
            { ...pair, baseUrl: "http://user:pass@downtify:8000/" },
            { ...pair, baseUrl: "file:///etc/passwd" },
        ]) {
            const http = client(INFO, AUTH);
            await expect(verifyDowntifyPair(bad, http)).rejects.toMatchObject({
                state: "invalid_input",
            });
            expect(http.get).not.toHaveBeenCalled();
        }
    });

    it("verifies public server identity before ever sending the device token", async () => {
        const http = client(INFO, AUTH);
        expect(await verifyDowntifyPair(pair, http)).toEqual(expected);
        const calls = (http.get as jest.Mock).mock.calls;
        expect(calls.map(([url]) => url)).toEqual([
            "http://downtify:8000/api/server/info",
            "http://downtify:8000/api/auth/status",
        ]);
        expect(calls[0][1].headers.Authorization).toBeUndefined();
        expect(calls[1][1].headers.Authorization).toBe("Bearer " + TOKEN);
        for (const [url, opts] of calls) {
            expect(url).not.toContain(TOKEN);
            expect(opts.maxRedirects).toBe(0);
            expect(opts.proxy).toBe(false);
            expect(opts.maxContentLength).toBeLessThanOrEqual(16 * 1024);
        }
    });

    it("does not send a token to an incompatible server", async () => {
        const http = client({ ...INFO, product: "not-Downtify" }, AUTH);
        await expect(verifyDowntifyPair(pair, http)).rejects.toMatchObject({
            state: "incompatible",
        });
        expect(http.get).toHaveBeenCalledTimes(1);
    });

    it("rejects browser-session auth, incomplete account identity or bad server IDs", async () => {
        for (const [info, auth, state] of [
            [INFO, { ...AUTH, via: "session" }, "unauthorized"],
            [INFO, { ...AUTH, user: { id: "12", username: "owner" } }, "unauthorized"],
            [{ ...INFO, server_id: "../../../etc" }, AUTH, "incompatible"],
            [INFO, { ...AUTH, auth_disabled: true }, "unauthorized"],
        ] as [unknown, unknown, string][]) {
            await expect(verifyDowntifyPair(pair, client(info, auth))).rejects.toMatchObject({ state });
        }
    });

    it("stores encrypted credentials and exact pinned remote ID, with every feature OFF", async () => {
        const result = await pairDowntify("admin-1", pair, client(INFO, AUTH));
        expect(result).toEqual(expected);
        expect(row).not.toBeNull();
        expect(row!.deviceTokenEncrypted).not.toContain(TOKEN);
        expect(isEncryptedFormat(row!.deviceTokenEncrypted)).toBe(true);
        expect(decrypt(row!.deviceTokenEncrypted)).toBe(TOKEN);
        expect(row).toMatchObject({
            ownerKimaUserId: "admin-1",
            expectedUsername: "downtify-owner",
            expectedUserId: 12, expectedServerId: INFO.server_id,
            enabled: false, spotifyIntentsEnabled: false,
            trackSubmissionEnabled: false, reconciliationEnabled: false,
        });
        const output = JSON.stringify(await getDowntifyAdminStatus("admin-1"));
        expect(output).not.toContain(TOKEN);
        expect(output).not.toContain("xc1.");
        expect(output).not.toContain(INFO.server_id);
        expect(output).not.toContain("12");
    });

    it("checks the saved encrypted token with no API response secrets", async () => {
        await pairDowntify("admin-1", pair, client(INFO, AUTH));
        const result = await testSavedDowntifyPair("admin-1", client(INFO, AUTH));
        expect(result).toEqual(expected);
        row!.expectedServerId = "another_server_identifier_1234";
        await expect(testSavedDowntifyPair("admin-1", client(INFO, AUTH))).rejects.toMatchObject({
            state: "incompatible",
        });
    });

    it("does not let another admin overwrite a previously paired owner's device", async () => {
        await pairDowntify("admin-1", pair, client(INFO, AUTH));
        const before = row!.deviceTokenEncrypted;
        await expect(pairDowntify("admin-2", pair, client(INFO, AUTH))).rejects.toMatchObject({
            state: "unauthorized",
        });
        expect(row!.deviceTokenEncrypted).toBe(before);
        expect(row!.ownerKimaUserId).toBe("admin-1");
        const otherStatus = await getDowntifyAdminStatus("admin-2");
        expect(otherStatus.ownerMatches).toBe(false);
        expect(otherStatus.url).toBeNull();
        expect(otherStatus.username).toBeNull();
    });

    it("refuses a concurrent unique-ID race instead of stealing the paired binding", async () => {
        (db.create as jest.Mock).mockRejectedValueOnce(
            Object.assign(new Error("unique"), { code: "P2002" }),
        );
        await expect(pairDowntify("admin-1", pair, client(INFO, AUTH))).rejects.toMatchObject({
            state: "unauthorized",
        });
        expect(row).toBeNull();
    });

    it("refuses UI pairing while a disabled Docker integration still owns a device token", async () => {
        const previousEnabled = process.env.KIMA_DOWNTIFY_ENABLED;
        const previousToken = process.env.KIMA_DOWNTIFY_DEVICE_TOKEN;
        try {
            process.env.KIMA_DOWNTIFY_ENABLED = "false";
            process.env.KIMA_DOWNTIFY_DEVICE_TOKEN = TOKEN;
            const http = client(INFO, AUTH);
            await expect(pairDowntify("admin-1", pair, http)).rejects.toMatchObject({
                state: "environment_managed",
            });
            expect(http.get).not.toHaveBeenCalled();
            expect(db.create).not.toHaveBeenCalled();
            expect(await getDowntifyAdminStatus("admin-1")).toMatchObject({
                source: "environment", configured: true, enabled: false,
            });
        } finally {
            if (previousEnabled === undefined) delete process.env.KIMA_DOWNTIFY_ENABLED;
            else process.env.KIMA_DOWNTIFY_ENABLED = previousEnabled;
            if (previousToken === undefined) delete process.env.KIMA_DOWNTIFY_DEVICE_TOKEN;
            else process.env.KIMA_DOWNTIFY_DEVICE_TOKEN = previousToken;
        }
    });

    it("forces an existing write-capable pairing OFF again when repaired", async () => {
        await pairDowntify("admin-1", pair, client(INFO, AUTH));
        row!.enabled = true;
        row!.trackSubmissionEnabled = true;
        row!.spotifyIntentsEnabled = true;
        row!.nativeImportEnabled = true;
        row!.nativeImportBaselineAt = new Date();
        await pairDowntify("admin-1", pair, client(INFO, AUTH));
        expect(row).toMatchObject({
            enabled: false, spotifyIntentsEnabled: false, trackSubmissionEnabled: false,
            nativeImportEnabled: false, nativeImportBaselineAt: null,
        });
    });
});

describe("DB settings affect existing route-level gates without modifying process.env", () => {
    it("continues legacy operator env support if there is no stored pairing", async () => {
        const legacy: NodeJS.ProcessEnv = {
            KIMA_DOWNTIFY_ENABLED: "true",
            KIMA_DOWNTIFY_URL: "http://downtify:8000",
            KIMA_DOWNTIFY_DEVICE_TOKEN: TOKEN,
        };
        expect(await getDowntifyRuntimeEnv(legacy)).toBe(legacy);
        expect(db.findUnique).toHaveBeenCalledTimes(1);
    });

    it("overrides old enabled flags to OFF after a new pairing", async () => {
        await pairDowntify("admin-1", pair, client(INFO, AUTH));
        const legacy: NodeJS.ProcessEnv = {
            KIMA_DOWNTIFY_ENABLED: "true",
            KIMA_DOWNTIFY_TRACK_SUBMISSION_ENABLED: "true",
            KIMA_SPOTIFY_INTENTS_ENABLED: "true",
            KIMA_DOWNTIFY_SOURCE_EVIDENCE_ENABLED: "true",
            KIMA_DOWNTIFY_DEVICE_TOKEN: "dtfy_private_legacy_token_12345678",
        };
        const env = await getDowntifyRuntimeEnv(legacy);
        expect(env.KIMA_DOWNTIFY_ENABLED).toBe("false");
        expect(env.KIMA_DOWNTIFY_TRACK_SUBMISSION_ENABLED).toBe("false");
        expect(env.KIMA_SPOTIFY_INTENTS_ENABLED).toBe("false");
        expect(env.KIMA_DOWNTIFY_SOURCE_EVIDENCE_ENABLED).toBe("false");
        expect(env.KIMA_DOWNTIFY_DEVICE_TOKEN).toBe("");
        expect(legacy.KIMA_DOWNTIFY_ENABLED).toBe("true");
    });

    it("activates just the selected manual features and never file verification", async () => {
        await pairDowntify("admin-1", pair, client(INFO, AUTH));
        await expect(updateDowntifyControls("another-admin", {
            enabled: true, spotifyIntentsEnabled: true,
            trackSubmissionEnabled: true, reconciliationEnabled: true,
        }, true)).rejects.toMatchObject({ state: "unauthorized" });
        await expect(updateDowntifyControls("admin-1", {
            enabled: true, spotifyIntentsEnabled: true,
            trackSubmissionEnabled: true, reconciliationEnabled: true,
        })).rejects.toMatchObject({ state: "confirmation_required" });
        const result = await updateDowntifyControls("admin-1", {
            enabled: true, spotifyIntentsEnabled: true,
            trackSubmissionEnabled: true, reconciliationEnabled: true,
        }, true);
        expect(result).toMatchObject({
            source: "database", enabled: true,
            spotifyIntentsEnabled: true,
            trackSubmissionEnabled: true,
            reconciliationEnabled: true,
        });
        const env = await getDowntifyRuntimeEnv();
        expect(env).toMatchObject({
            KIMA_DOWNTIFY_ENABLED: "true",
            KIMA_DOWNTIFY_URL: "http://downtify:8000/",
            KIMA_DOWNTIFY_OWNER_KIMA_USER_ID: "admin-1",
            KIMA_DOWNTIFY_EXPECTED_USERNAME: "downtify-owner",
            KIMA_DOWNTIFY_EXPECTED_USER_ID: "12",
            KIMA_DOWNTIFY_EXPECTED_SERVER_ID: INFO.server_id,
            KIMA_DOWNTIFY_DEVICE_TOKEN: TOKEN,
            KIMA_SPOTIFY_INTENTS_ENABLED: "true",
            KIMA_DOWNTIFY_TRACK_SUBMISSION_ENABLED: "true",
            KIMA_DOWNTIFY_RECONCILIATION_ENABLED: "true",
            KIMA_DOWNTIFY_SOURCE_EVIDENCE_ENABLED: "false",
            KIMA_DOWNTIFY_RECORDING_TAG_CHECK_ENABLED: "false",
        });
    });

    it("disables dependent flags when connection or Spotify intents go OFF", () => {
        expect(safeControls({
            enabled: false, spotifyIntentsEnabled: true,
            trackSubmissionEnabled: true, reconciliationEnabled: true,
        })).toEqual({
            enabled: false, spotifyIntentsEnabled: false,
            trackSubmissionEnabled: false, reconciliationEnabled: false,
        });
        expect(safeControls({
            enabled: true, spotifyIntentsEnabled: false,
            trackSubmissionEnabled: true, reconciliationEnabled: true,
        })).toMatchObject({
            trackSubmissionEnabled: false, reconciliationEnabled: false,
        });
    });

    it("fails closed if the encrypted token is changed or corrupted", async () => {
        await pairDowntify("admin-1", pair, client(INFO, AUTH));
        row!.enabled = true;
        row!.trackSubmissionEnabled = true;
        row!.deviceTokenEncrypted = "xc1.truncated";
        const env = await getDowntifyRuntimeEnv({
            KIMA_DOWNTIFY_ENABLED: "true",
            KIMA_DOWNTIFY_DEVICE_TOKEN: TOKEN,
        });
        expect(env.KIMA_DOWNTIFY_ENABLED).toBe("false");
        expect(env.KIMA_DOWNTIFY_DEVICE_TOKEN).toBe("");
        expect(env.KIMA_DOWNTIFY_TRACK_SUBMISSION_ENABLED).toBe("false");
    });
});
