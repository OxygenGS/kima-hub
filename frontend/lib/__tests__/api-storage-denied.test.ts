import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";

// Upstream v1.11 regression: sandboxed/blocked-storage browsers must not crash
// during token initialization, login or authenticated API requests.
const internals = api as unknown as { token: string | null };
const storageDenied = () => {
    throw new DOMException("The operation is insecure", "SecurityError");
};

beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", {
        getItem: storageDenied,
        setItem: storageDenied,
        removeItem: storageDenied,
    });
    internals.token = null;
});

afterEach(() => {
    api.clearToken();
    internals.token = null;
    vi.unstubAllGlobals();
});

describe("authentication when localStorage is unavailable", () => {
    it("initializes safely and keeps the access token in memory if storage methods throw", async () => {
        await expect(api.initToken()).resolves.toBeNull();
        expect(() => api.setToken("memory-token", "memory-refresh")).not.toThrow();
        expect(api.getToken()).toBe("memory-token");
        expect(() => api.getRefreshToken()).not.toThrow();
        expect(api.getRefreshToken()).toBeNull();
        expect(() => api.clearToken()).not.toThrow();
        expect(api.getToken()).toBeNull();
    });

    it("can make an authorized API request with a memory-only token", async () => {
        api.setToken("memory-token");
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ tracks: [] }),
        });
        vi.stubGlobal("fetch", mockFetch);
        await expect(api.request("/library/tracks")).resolves.toEqual({ tracks: [] });
        const options = mockFetch.mock.calls[0][1] as RequestInit;
        expect(new Headers(options.headers).get("Authorization")).toBe("Bearer memory-token");
    });

    it("does not crash if even the localStorage property getter throws", async () => {
        Object.defineProperty(globalThis, "localStorage", {
            configurable: true,
            get: storageDenied,
        });
        await expect(api.initToken()).resolves.toBeNull();
        expect(() => api.setToken("memory-token")).not.toThrow();
        expect(api.getToken()).toBe("memory-token");
        expect(() => api.clearToken()).not.toThrow();
        // Keep the global mock system in charge of cleanup.
    });
});
