import type { AxiosInstance } from "axios";
import { getBoundDowntifyQueue } from "../downtifyBoundQueue";

const TOKEN = "dtfy_local_synthetic_device_token_123456789";
const env = (custom: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
    KIMA_DOWNTIFY_ENABLED: "true",
    KIMA_DOWNTIFY_URL: "http://downtify:8000",
    KIMA_DOWNTIFY_DEVICE_TOKEN: TOKEN,
    KIMA_DOWNTIFY_OWNER_KIMA_USER_ID: "kima-owner",
    KIMA_DOWNTIFY_EXPECTED_USERNAME: "remote-owner",
    ...custom,
});
const info = { product: "Downtify", api_version: 1, require_sign_in: true };
const auth = {
    signed_in: true, via: "device", auth_disabled: false,
    user: { id: 9, username: "remote-owner", role: "admin" },
};
const queue = [
    {
        song: { song_id: "spotify:my-track", name: "My Song", artists: ["Artist"], secret: "none" },
        user_ids: [9], status: "downloading", progress: 48.5,
        filename: "/srv/private/My Song.flac", message: "secret remote error",
    },
    {
        song: { song_id: "spotify:other-track", name: "Other User Song" },
        user_ids: [11], status: "done", progress: 100,
        filename: "/srv/other/private.flac",
    },
    {
        song: { song_id: "spotify:shared-track", name: "Shared Song" },
        user_ids: [9, 11], status: "done", progress: 100,
    },
];

function http(...results: unknown[]) {
    const values = results.slice();
    const get = jest.fn(async () => ({ data: values.shift() }));
    return { get } as unknown as Pick<AxiosInstance, "get">;
}

describe("owner-bound Downtify queue", () => {
    it("is off by default and makes zero remote calls", async () => {
        const client = http(info, auth, queue);
        expect(await getBoundDowntifyQueue("kima-owner", {}, client))
            .toEqual({ state: "disabled", items: [], displayed: 0, hasMore: false });
        expect(client.get).not.toHaveBeenCalled();
    });

    it("requires explicit operator-owned Kima user and remote username binding", async () => {
        const client = http(info, auth, queue);
        const one = await getBoundDowntifyQueue("kima-owner", env({ KIMA_DOWNTIFY_EXPECTED_USERNAME: "" }), client);
        expect(one.state).toBe("unbound");
        const two = await getBoundDowntifyQueue("other-kima-user", env(), client);
        expect(two).toEqual({ state: "unbound", items: [], displayed: 0, hasMore: false });
        expect(client.get).not.toHaveBeenCalled();
    });

    it("filters even an administrator's all-user queue by verified remote ownership", async () => {
        const client = http(info, auth, queue);
        const result = await getBoundDowntifyQueue("kima-owner", env(), client);
        expect(result.state).toBe("ready");
        expect(result.items).toHaveLength(2);
        expect(result.items.map(j => j.subject)).toEqual(["My Song", "Shared Song"]);
        expect(result.items.map(j => j.phase)).toEqual(["processing", "downloaded"]);
        expect(result.items[0].progress).toBe(48.5);
        expect(result.items[1].progress).toBe(100);
        expect(result.items[1].libraryVerification).toBe("not_checked");
        const serialized = JSON.stringify(result);
        expect(serialized).not.toContain("Other User Song");
        expect(serialized).not.toContain("private.flac");
        expect(serialized).not.toContain("remote error");
        expect(serialized).not.toContain("spotify:");
        expect(serialized).not.toContain(TOKEN);
        expect(serialized).not.toContain("user_ids");
        expect(client.get).toHaveBeenCalledTimes(3);
        const calls = (client.get as jest.Mock).mock.calls;
        expect(calls.map((c: unknown[]) => c[0])).toEqual([
            "http://downtify:8000/api/server/info",
            "http://downtify:8000/api/auth/status",
            "http://downtify:8000/api/queue",
        ]);
        expect(calls[0][1].headers.Authorization).toBeUndefined();
        expect(calls[1][1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
        expect(calls[2][1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
        for (const call of calls) {
            expect(call[1].maxRedirects).toBe(0);
            expect(call[1].proxy).toBe(false);
            expect(call[1].timeout).toBeLessThanOrEqual(4000);
        }
    });

    it("rechecks the exact pinned server and remote numeric account on each queue call", async () => {
        const wrongServer = http({ ...info, server_id: "different_server_12345678" }, auth, queue);
        const serverState = await getBoundDowntifyQueue("kima-owner", env({
            KIMA_DOWNTIFY_EXPECTED_SERVER_ID: "correct_server_12345678",
            KIMA_DOWNTIFY_EXPECTED_USER_ID: "9",
        }), wrongServer);
        expect(serverState.state).toBe("incompatible");
        expect(wrongServer.get).toHaveBeenCalledTimes(1);
        expect((wrongServer.get as jest.Mock).mock.calls[0][1].headers.Authorization).toBeUndefined();

        const wrongUser = http({
            ...info, server_id: "correct_server_12345678",
        }, auth, queue);
        const userState = await getBoundDowntifyQueue("kima-owner", env({
            KIMA_DOWNTIFY_EXPECTED_SERVER_ID: "correct_server_12345678",
            KIMA_DOWNTIFY_EXPECTED_USER_ID: "11",
        }), wrongUser);
        expect(userState.state).toBe("unauthorized");
        expect(wrongUser.get).toHaveBeenCalledTimes(2);
    });

    it("does not request queue when token belongs to a different Downtify account", async () => {
        const client = http(info, { ...auth, user: { id: 9, username: "someone-else", role: "admin" } }, queue);
        expect((await getBoundDowntifyQueue("kima-owner", env(), client)).state).toBe("unauthorized");
        expect(client.get).toHaveBeenCalledTimes(2);
    });

    it("does not transmit token to an unrelated service that spoofs the endpoint address", async () => {
        const client = http({ ...info, product: "OtherProduct" }, auth, queue);
        expect((await getBoundDowntifyQueue("kima-owner", env(), client)).state).toBe("incompatible");
        expect((client.get as jest.Mock).mock.calls[0][1].headers.Authorization).toBeUndefined();
        expect(client.get).toHaveBeenCalledTimes(1);
    });

    it("refuses queue rows lacking explicit ownership even if supplied by administrator", async () => {
        const rows = [
            { song: { song_id: "a", name: "Unowned" }, status: "done" },
            { song: { song_id: "b", name: "Mismatched" }, user_ids: [10], status: "done" },
            { song: { song_id: "c", name: "Bad owner list" }, user_ids: "9", status: "done" },
            { song: { song_id: "d", name: "Visible" }, user_ids: [9], status: "future-state", progress: 999 },
        ];
        const result = await getBoundDowntifyQueue("kima-owner", env(), http(info, auth, rows));
        expect(result.items).toHaveLength(1);
        expect(result.items[0]).toMatchObject({
            subject: "Visible", phase: "unknown", progress: null, libraryVerification: "not_checked",
        });
    });

    it("does not leak remote errors, raw paths, origin, or account information", async () => {
        const client = { get: jest.fn().mockRejectedValue(new Error("token=" + TOKEN + " host=private")) } as unknown as Pick<AxiosInstance, "get">;
        const result = await getBoundDowntifyQueue("kima-owner", env(), client);
        expect(result.state).toBe("unavailable");
        expect(JSON.stringify(result)).not.toContain(TOKEN);
        expect(JSON.stringify(result)).not.toContain("private");
        expect(JSON.stringify(result)).not.toContain("remote-owner");
    });

    it("bounds the visible queue and does not reveal other users' row counts", async () => {
        const myRows = Array.from({ length: 103 }, (_, i) => ({
            song: { song_id: `my:${i}`, name: `Song ${i}` }, status: "queued", user_ids: [9],
        }));
        const mixed = [{ song: { song_id: "other", name: "Secret" }, user_ids: [11] }, ...myRows];
        const result = await getBoundDowntifyQueue("kima-owner", env(), http(info, auth, mixed));
        expect(result.items).toHaveLength(100);
        expect(result.hasMore).toBe(true);
        expect(result.displayed).toBe(100);
        expect(JSON.stringify(result)).not.toContain("Secret");
    });
});
