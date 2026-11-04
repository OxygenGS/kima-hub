import type { AxiosInstance } from "axios";
import { probeDowntify, readDowntifyConfig } from "../downtifyClient";

const DEVICE_TOKEN = "dtfy_long_synthetic_test_device_token_123456";
const config = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
    KIMA_DOWNTIFY_ENABLED: "true",
    KIMA_DOWNTIFY_URL: "http://downtify:8000",
    KIMA_DOWNTIFY_DEVICE_TOKEN: DEVICE_TOKEN,
    ...overrides,
});
const info = {
    product: "Downtify", version: "3.2.0", api_version: 1,
    require_sign_in: true, server_id: "private-id",
};
const auth = { signed_in: true, via: "device", auth_disabled: false, user: { id: 1, username: "hidden" } };
const queue = { paused: false, state: "running", active: 2, can_control: false };

function mockResponse(...responses: unknown[]) {
    const replies = responses.slice();
    const get = jest.fn().mockImplementation(async () => ({ data: replies.shift() }));
    return { get } as unknown as Pick<AxiosInstance, "get">;
}

describe("Downtify read-only backend configuration", () => {
    it("is off unless explicitly opted in and makes no network calls", async () => {
        const http = mockResponse(info, auth, queue);
        const result = await probeDowntify({}, http);
        expect(result).toEqual({ engine: "downtify", enabled: false, configured: false, state: "disabled" });
        expect(http.get).not.toHaveBeenCalled();
    });

    it.each([
        { KIMA_DOWNTIFY_DEVICE_TOKEN: "" },
        { KIMA_DOWNTIFY_DEVICE_TOKEN: "admin-password" },
        { KIMA_DOWNTIFY_URL: "http://public.example.org:8000" },
        { KIMA_DOWNTIFY_URL: "ftp://downtify:8000/" },
        { KIMA_DOWNTIFY_URL: "http://admin:pass@downtify:8000/" },
        { KIMA_DOWNTIFY_URL: "http://downtify:8000/api/queue" },
        { KIMA_DOWNTIFY_URL: "http://downtify:8000/?token=x" },
    ])("fails closed on invalid configured endpoint/secret: %p", async (values) => {
        const http = mockResponse(info, auth, queue);
        expect(readDowntifyConfig(config(values)).state).toBe("misconfigured");
        expect(await probeDowntify(config(values), http)).toMatchObject({ state: "misconfigured" });
        expect(http.get).not.toHaveBeenCalled();
    });

    it("accepts only controlled HTTPS or private-LAN HTTP endpoints", () => {
        expect(readDowntifyConfig(config({ KIMA_DOWNTIFY_URL: "http://192.168.178.20:8000" })).state).toBe("configured");
        expect(readDowntifyConfig(config({ KIMA_DOWNTIFY_URL: "http://127.0.0.1:8000" })).state).toBe("configured");
        expect(readDowntifyConfig(config({ KIMA_DOWNTIFY_URL: "https://music.example.org" })).state).toBe("configured");
        expect(readDowntifyConfig(config({ KIMA_DOWNTIFY_URL: "http://172.32.0.1:8000" })).state).toBe("misconfigured");
    });

    it("verifies server identity, a paired device, and then read-only queue status", async () => {
        const http = mockResponse(info, auth, queue);
        const result = await probeDowntify(config(), http);
        expect(result).toEqual({
            engine: "downtify", enabled: true, configured: true,
            state: "ready", version: "3.2.0",
            queue: { paused: false, state: "running", active: 2 },
        });
        expect(http.get).toHaveBeenCalledTimes(3);
        const calls = (http.get as jest.Mock).mock.calls;
        expect(calls.map(x => x[0])).toEqual([
            "http://downtify:8000/api/server/info",
            "http://downtify:8000/api/auth/status",
            "http://downtify:8000/api/queue/state",
        ]);
        for (const [index, [url, options]] of calls.entries()) {
            expect(url).not.toContain(DEVICE_TOKEN);
            // Public identity probe must never disclose the paired-device secret.
            if (index === 0) {
                expect(options.headers.Authorization).toBeUndefined();
            } else {
                expect(options.headers.Authorization).toBe(`Bearer ${DEVICE_TOKEN}`);
            }
            expect(options.maxRedirects).toBe(0);
            expect(options.maxContentLength).toBeLessThanOrEqual(16 * 1024);
            expect(options.timeout).toBeLessThanOrEqual(4000);
            expect(options.proxy).toBe(false);
        }
        expect(JSON.stringify(result)).not.toContain(DEVICE_TOKEN);
        expect(JSON.stringify(result)).not.toContain("private-id");
        expect(JSON.stringify(result)).not.toContain("hidden");
    });

    it("rejects a server spoof and unsupported API before reading queue or auth", async () => {
        const http = mockResponse({ ...info, product: "AnotherServer" }, auth, queue);
        expect(await probeDowntify(config(), http)).toMatchObject({ state: "incompatible" });
        expect(http.get).toHaveBeenCalledTimes(1);
        expect((http.get as jest.Mock).mock.calls[0][1].headers.Authorization).toBeUndefined();
        const other = mockResponse({ ...info, api_version: 2 }, auth, queue);
        expect(await probeDowntify(config(), other)).toMatchObject({ state: "incompatible" });
        expect(other.get).toHaveBeenCalledTimes(1);
    });

    it("refuses an unauthenticated Downtify instance", async () => {
        const http = mockResponse({ ...info, require_sign_in: false }, auth, queue);
        expect(await probeDowntify(config(), http)).toMatchObject({ state: "incompatible" });
        expect(http.get).toHaveBeenCalledTimes(1);
    });

    it("rejects a stolen browser cookie or expired device token", async () => {
        const http = mockResponse(info, { ...auth, via: "session" }, queue);
        expect(await probeDowntify(config(), http)).toMatchObject({ state: "unauthorized" });
        expect(http.get).toHaveBeenCalledTimes(2);

        const failing = { get: jest.fn().mockRejectedValue(Object.assign(new Error("do not expose secret " + DEVICE_TOKEN), {
            isAxiosError: true,
            response: { status: 401, data: { detail: "token was rejected" } },
        })) } as unknown as Pick<AxiosInstance, "get">;
        const result = await probeDowntify(config(), failing);
        expect(result.state).toBe("unauthorized");
        expect(JSON.stringify(result)).not.toContain(DEVICE_TOKEN);
        expect(JSON.stringify(result)).not.toContain("token was rejected");
    });

    it("fails closed on a malformed queue shape", async () => {
        const http = mockResponse(info, auth, { paused: "no", state: "running", active: -3 });
        expect(await probeDowntify(config(), http)).toMatchObject({ state: "incompatible", version: "3.2.0" });
    });

    it("returns only an unavailable state for DNS, timeout or redirect errors", async () => {
        const http = { get: jest.fn().mockRejectedValue(new Error("connection refused secret=" + DEVICE_TOKEN)) } as unknown as Pick<AxiosInstance, "get">;
        const result = await probeDowntify(config(), http);
        expect(result.state).toBe("unavailable");
        expect(JSON.stringify(result)).not.toContain(DEVICE_TOKEN);
    });
});
