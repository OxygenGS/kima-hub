import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    pathname: "/",
    router: { push: vi.fn(), replace: vi.fn() },
    getCurrentUser: vi.fn(),
    logout: vi.fn(),
    login: vi.fn(),
    clearToken: vi.fn(),
    clearCache: vi.fn(),
    clearMedia: vi.fn(),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => mocks.router,
    usePathname: () => mocks.pathname,
}));
vi.mock("@/lib/api", () => ({
    api: {
        getCurrentUser: mocks.getCurrentUser,
        logout: mocks.logout,
        login: mocks.login,
        clearToken: mocks.clearToken,
    },
}));
vi.mock("@/lib/query-client", () => ({
    clearBrowserQueryCache: mocks.clearCache,
}));
vi.mock("@/lib/storage-keys", () => ({
    clearAccountMediaStorage: mocks.clearMedia,
}));

import { AuthProvider, useAuth } from "../auth-context";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const alice = { id: "alice", username: "alice", role: "user", onboardingComplete: true };
const bob = { id: "bob", username: "bob", role: "user", onboardingComplete: true };
let host: HTMLDivElement;
let root: Root;
let auth: ReturnType<typeof useAuth>;

function Probe() {
    auth = useAuth();
    return null;
}

beforeEach(async () => {
    vi.clearAllMocks();
    mocks.pathname = "/";
    mocks.getCurrentUser.mockResolvedValue(alice);
    mocks.logout.mockResolvedValue(undefined);
    mocks.login.mockResolvedValue(bob);
    mocks.clearCache.mockResolvedValue(undefined);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));
    expect(auth.isAuthenticated).toBe(true);
});

afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
});

describe("sign-out and session transitions", () => {
    it("signs out locally even when server logout fails while offline", async () => {
        mocks.logout.mockRejectedValueOnce(new TypeError("offline"));
        await act(async () => { await auth.logout(); });
        expect(auth.isAuthenticated).toBe(false);
        expect(auth.user).toBeNull();
        expect(mocks.clearToken).toHaveBeenCalled();
        expect(mocks.clearCache).toHaveBeenCalled();
        expect(mocks.clearMedia).toHaveBeenCalled();
        expect(mocks.router.replace).toHaveBeenCalledWith("/login");
    });

    it("does not let a delayed permission refresh restore the signed-out user", async () => {
        let resolveRefresh!: (user: typeof alice) => void;
        mocks.getCurrentUser.mockImplementationOnce(() => new Promise(resolve => { resolveRefresh = resolve; }));
        await act(async () => { window.dispatchEvent(new Event("focus")); });
        await act(async () => { await auth.logout(); });
        await act(async () => { resolveRefresh(alice); await Promise.resolve(); });
        expect(auth.user).toBeNull();
        expect(auth.isAuthenticated).toBe(false);
    });

    it("exits a truly expired session rather than displaying stale account data", async () => {
        const expired = Object.assign(new Error("Not authenticated"), { status: 401 });
        mocks.getCurrentUser.mockRejectedValueOnce(expired);
        await act(async () => { window.dispatchEvent(new Event("focus")); await Promise.resolve(); });
        expect(auth.isAuthenticated).toBe(false);
        expect(auth.user).toBeNull();
        expect(mocks.clearCache).toHaveBeenCalledTimes(1);
        expect(mocks.clearMedia).toHaveBeenCalledTimes(1);
        expect(mocks.router.replace).toHaveBeenCalledWith("/login?error=session_expired");
    });

    it("keeps a signed-in session during a transient refresh outage", async () => {
        mocks.getCurrentUser.mockRejectedValueOnce(Object.assign(new Error("server offline"), { status: 503 }));
        await act(async () => { window.dispatchEvent(new Event("focus")); await Promise.resolve(); });
        expect(auth.isAuthenticated).toBe(true);
        expect(auth.user?.id).toBe("alice");
        expect(mocks.clearCache).not.toHaveBeenCalled();
        expect(mocks.router.replace).not.toHaveBeenCalled();
    });

    it("clears previous account data before showing the new signed-in user", async () => {
        mocks.getCurrentUser.mockResolvedValueOnce(bob);
        await act(async () => { await auth.login("bob", "synthetic-password"); });
        expect(mocks.clearCache).toHaveBeenCalledTimes(1);
        expect(mocks.clearMedia).toHaveBeenCalledTimes(1);
        expect(auth.user?.id).toBe("bob");
        expect(mocks.router.push).toHaveBeenCalledWith("/");
    });
});
