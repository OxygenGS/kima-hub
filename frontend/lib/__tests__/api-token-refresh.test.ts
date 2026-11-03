import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, NetworkError } from "../api";

// 401 → refresh: network error, refresh rejected, or refreshed. window and
// localStorage are stubbed; `api` is built at import, so its in-memory token
// is set directly.

type ApiClientInternals = { token: string | null };

function stubBrowserGlobals() {
    const store: Record<string, string> = {};
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => {
            store[k] = v;
        },
        removeItem: (k: string) => {
            delete store[k];
        },
    });
    return store;
}

function makeResponse(init: { ok: boolean; status: number; body?: unknown }): Response {
    return {
        ok: init.ok,
        status: init.status,
        statusText: init.ok ? "OK" : "Error",
        headers: { entries: () => [] } as unknown as Headers,
        json: async () => init.body ?? {},
    } as unknown as Response;
}

beforeEach(() => {
    stubBrowserGlobals();
    localStorage.setItem("auth_token", "expired-token");
    localStorage.setItem("refresh_token", "refresh-abc");
    (api as unknown as ApiClientInternals).token = "expired-token";
});

afterEach(() => {
    vi.unstubAllGlobals();
    (api as unknown as ApiClientInternals).token = null;
});

describe("in-flight token refresh cannot restore an old account", () => {
    it("does not restore a signed-out session when its refresh returns late", async () => {
        let finishRefresh!: (response: Response) => void;
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(makeResponse({ ok: false, status: 401 }))
            .mockImplementationOnce(() => new Promise<Response>(resolve => { finishRefresh = resolve; }));
        vi.stubGlobal("fetch", fetchMock);

        const request = api.request("/library/tracks");
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        api.clearToken();
        finishRefresh(makeResponse({ ok: true, status: 200, body: {
            token: "old-access", refreshToken: "old-refresh",
        } }));
        await expect(request).rejects.toBeInstanceOf(NetworkError);
        expect(api.getToken()).toBeNull();
        expect(localStorage.getItem("auth_token")).toBeNull();
        expect(localStorage.getItem("refresh_token")).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("does not replace a new login with a late response from the old account", async () => {
        let finishRefresh!: (response: Response) => void;
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(makeResponse({ ok: false, status: 401 }))
            .mockImplementationOnce(() => new Promise<Response>(resolve => { finishRefresh = resolve; }));
        vi.stubGlobal("fetch", fetchMock);

        const request = api.request("/library/tracks");
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
        api.setToken("new-account-token", "new-account-refresh");
        finishRefresh(makeResponse({ ok: false, status: 401 }));
        await expect(request).rejects.toBeInstanceOf(NetworkError);
        expect(api.getToken()).toBe("new-account-token");
        expect(localStorage.getItem("refresh_token")).toBe("new-account-refresh");
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});

describe("logout race safety", () => {
    it("does not erase a newer account's token when the old logout response arrives late", async () => {
        let finish!: (response: Response) => void;
        const fetchMock = vi.fn().mockImplementationOnce(
            () => new Promise<Response>(resolve => { finish = resolve; })
        );
        vi.stubGlobal("fetch", fetchMock);
        const pendingLogout = api.logout();
        expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
        api.setToken("account-b-token", "account-b-refresh");
        finish(makeResponse({ ok: true, status: 200 }));
        await pendingLogout;
        expect(api.getToken()).toBe("account-b-token");
        expect(localStorage.getItem("auth_token")).toBe("account-b-token");
    });

    it("does not attempt to refresh a newer account's credentials on a late 401 from logout", async () => {
        let finishLogout!: (response: Response) => void;
        const fetchMock = vi.fn().mockImplementationOnce(
            () => new Promise<Response>(resolve => { finishLogout = resolve; })
        );
        vi.stubGlobal("fetch", fetchMock);
        const pendingLogout = api.logout();
        api.setToken("next-account-token", "next-account-refresh");
        finishLogout(makeResponse({ ok: false, status: 401, body: { error: "Session expired" } }));
        await expect(pendingLogout).rejects.toThrow();
        expect(api.getToken()).toBe("next-account-token");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("still removes the old token when logout returns an error", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("offline")));
        await expect(api.logout()).rejects.toThrow("offline");
        expect(api.getToken()).toBeNull();
        expect(localStorage.getItem("auth_token")).toBeNull();
    });
});

describe("ApiClient.request -- 401 refresh three-way", () => {
    it("refresh network-error -> throws a distinguishable NetworkError, tokens left intact, no retry-as-auth", async () => {
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(async () => makeResponse({ ok: false, status: 401 }))
            .mockImplementationOnce(async () => {
                throw new TypeError("network down");
            });
        vi.stubGlobal("fetch", fetchMock);

        let caught: unknown;
        try {
            await api.request("/library/tracks");
        } catch (err) {
            caught = err;
        }

        expect(caught).toBeInstanceOf(NetworkError);
        expect(caught).toBeInstanceOf(Error);
        expect((caught as Error).name).toBe("NetworkError");
        expect((caught as Error).message).not.toBe("Not authenticated");

        // Exactly the original request + the refresh attempt -- no retry.
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(localStorage.getItem("auth_token")).toBe("expired-token");
        expect(localStorage.getItem("refresh_token")).toBe("refresh-abc");
    });

    it("refresh rejected -> throws 'Not authenticated', tokens cleared", async () => {
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(async () => makeResponse({ ok: false, status: 401 }))
            .mockImplementationOnce(async () => makeResponse({ ok: false, status: 401 }));
        vi.stubGlobal("fetch", fetchMock);

        let caught: unknown;
        try {
            await api.request("/library/tracks");
        } catch (err) {
            caught = err;
        }

        expect(caught).not.toBeInstanceOf(NetworkError);
        expect((caught as Error).message).toBe("Not authenticated");

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(localStorage.getItem("auth_token")).toBeNull();
        expect(localStorage.getItem("refresh_token")).toBeNull();
    });

    it("refresh refreshed -> the request is retried once and succeeds", async () => {
        const fetchMock = vi
            .fn()
            .mockImplementationOnce(async () => makeResponse({ ok: false, status: 401 }))
            .mockImplementationOnce(async () =>
                makeResponse({
                    ok: true,
                    status: 200,
                    body: { token: "new-token", refreshToken: "new-refresh" },
                }),
            )
            .mockImplementationOnce(async () =>
                makeResponse({ ok: true, status: 200, body: { data: "ok" } }),
            );
        vi.stubGlobal("fetch", fetchMock);

        const result = await api.request("/library/tracks");

        expect(result).toEqual({ data: "ok" });
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(localStorage.getItem("auth_token")).toBe("new-token");
        expect(localStorage.getItem("refresh_token")).toBe("new-refresh");
    });
});
