import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: mocks.auth }));
vi.mock("@/lib/api", () => ({ api: { get: mocks.get, post: mocks.post } }));
vi.mock("@/lib/i18n/language-context", () => ({
    useLanguage: () => ({ locale: "nl", t: (key: string) => key }),
}));
vi.mock("@/components/layout/PageHeader", () => ({
    PageHeader: ({ title, description, actions }: {
        title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode;
    }) => <header><h1>{title}</h1><p>{description}</p>{actions}</header>,
}));

import DownloadsPage from "./page";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const kima = (name: string) => ({
    items: [{
        id: "k1", subject: name, engine: "soulseek", phase: "downloaded",
        progress: null, libraryVerification: "not_checked",
        createdAt: "2026-11-04T12:00:00.000Z",
    }],
    total: 1, displayed: 1, hasMore: false, downtifyJobsIncluded: false,
});
const remote = (name: string) => ({
    state: "ready",
    items: [{
        id: "d1", subject: name, engine: "downtify", phase: "processing",
        progress: 42.5, libraryVerification: "not_checked",
    }],
    displayed: 1, hasMore: false,
});
const mount = async () => {
    await act(async () => {
        root.render(<DownloadsPage />);
    });
};

beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockReturnValue({
        isAuthenticated: true, isLoading: false,
        user: { id: "first-user", role: "user" },
    });
    mocks.get.mockImplementation(async (path: string) =>
        path.startsWith("/download-manager/downtify/jobs")
            ? remote("Downtify Track")
            : kima("Kima Track"));
    mocks.post.mockReset().mockResolvedValue({
        provider: "spotify", kind: "track",
        canonicalUrl: "https://open.spotify.com/track/0123456789ABCDEFGHIJKL",
        intentKey: "spotify:track:0123456789ABCDEFGHIJKL",
        duplicateCheck: "not_checked", downloadStarted: false,
        libraryVerification: "not_checked", submissionEnabled: false,
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
});

describe("first Unified Download Manager page", () => {
    it("shows separately scoped Kima and Downtify rows without suggesting an indexed import", async () => {
        await mount();
        expect(host.querySelector("h1")?.textContent).toBe("Download Manager");
        expect(host.querySelector('[aria-labelledby="kima-downloads-title"]')?.textContent).toContain("Kima Track");
        expect(host.querySelector('[aria-labelledby="downtify-downloads-title"]')?.textContent).toContain("Downtify Track");
        expect(host.textContent).toContain("Download complete (index not checked)");
        expect(host.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("42.5");
        expect(host.querySelector('button[aria-label="Refresh download status"]')).not.toBeNull();
        expect(mocks.get).toHaveBeenCalledWith("/download-manager/jobs?limit=50&offset=0");
        expect(mocks.get).toHaveBeenCalledWith("/download-manager/downtify/jobs");
        expect(host.querySelector('button[type="submit"]')).toBeNull();
    });

    it("does not invent Downtify rows for an unbound account", async () => {
        mocks.get.mockImplementation(async (path: string) =>
            path.includes("/downtify/")
                ? { state: "unbound", items: [], displayed: 0, hasMore: false }
                : kima("Personal Kima Track"));
        await mount();
        expect(host.textContent).toContain("No Downtify account is linked to this user.");
        expect(host.textContent).toContain("Personal Kima Track");
        expect(host.textContent).not.toContain("Downtify Track");
    });

    it("shows a working engine when the other endpoint fails", async () => {
        mocks.get.mockImplementation(async (path: string) => {
            if (path.includes("/downtify/")) throw new Error("secret remote URL");
            return kima("Working Kima Track");
        });
        await mount();
        expect(host.textContent).toContain("Working Kima Track");
        expect(host.textContent).toContain("Could not load Downtify status.");
        expect(host.textContent).not.toContain("secret remote URL");
    });

    it("removes previous user's rows as soon as the authenticated account changes", async () => {
        await mount();
        expect(host.textContent).toContain("Kima Track");
        expect(host.textContent).toContain("Downtify Track");

        // Delayed new user's API responses must never display the old user's data.
        mocks.auth.mockReturnValue({
            isAuthenticated: true, isLoading: false,
            user: { id: "second-user", role: "user" },
        });
        mocks.get.mockImplementation(() => new Promise(() => {}));
        await mount();
        expect(host.textContent).not.toContain("Kima Track");
        expect(host.textContent).not.toContain("Downtify Track");
        expect(host.textContent).toContain("Loading...");
    });

    it("hides all rows immediately when the session ends", async () => {
        await mount();
        mocks.auth.mockReturnValue({ isAuthenticated: false, isLoading: false, user: null });
        await mount();
        expect(host.querySelector("h1")).toBeNull();
        expect(host.textContent).not.toContain("Kima Track");
    });
});


async function enterSpotifyLink(value: string) {
    const input = host.querySelector<HTMLInputElement>("#spotify-intake-link");
    expect(input).not.toBeNull();
    await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, "value"
        )?.set;
        setter?.call(input, value);
        input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

describe("Spotify link preview — no download or import actions", () => {
    const link = "https://open.spotify.com/track/0123456789ABCDEFGHIJKL";

    it("hides link intake from listeners without track download permission", async () => {
        await mount();
        expect(host.querySelector("#spotify-intake-link")).toBeNull();
        expect(mocks.post).not.toHaveBeenCalled();
    });

    it("shows a non-downloading link preview form to permitted users", async () => {
        mocks.auth.mockReturnValue({
            isAuthenticated: true, isLoading: false,
            user: { id: "first-user", role: "user", canDownloadTracks: true },
        });
        await mount();
        expect(host.textContent).toContain("Check Spotify link");
        expect(host.textContent).toContain("Downloads are not available yet.");
        expect(host.querySelector("#spotify-intake-link")).not.toBeNull();
        expect(host.querySelector('button[type="submit"]')?.hasAttribute("disabled")).toBe(true);
        expect(mocks.post).not.toHaveBeenCalled();
    });

    it("validates a link through only the dedicated preview endpoint", async () => {
        mocks.auth.mockReturnValue({
            isAuthenticated: true, isLoading: false,
            user: { id: "first-user", role: "user", canDownloadTracks: true },
        });
        await mount();
        await enterSpotifyLink(link);
        await act(async () => {
            host.querySelector("form")?.dispatchEvent(new Event("submit", {
                bubbles: true, cancelable: true,
            }));
        });
        expect(mocks.post).toHaveBeenCalledWith("/download-manager/spotify/preview", { url: link });
        expect(mocks.post).toHaveBeenCalledTimes(1);
        expect(host.textContent).toContain("Valid Spotify link");
        expect(host.textContent).toContain("No download started.");
    });

    it("clears a permitted user's preview when account or rights change", async () => {
        mocks.auth.mockReturnValue({
            isAuthenticated: true, isLoading: false,
            user: { id: "first-user", role: "admin" },
        });
        await mount();
        expect(host.querySelector("#spotify-intake-link")).not.toBeNull();
        mocks.auth.mockReturnValue({
            isAuthenticated: true, isLoading: false,
            user: { id: "next-user", role: "user", canDownloadTracks: false },
        });
        await mount();
        expect(host.querySelector("#spotify-intake-link")).toBeNull();
    });

    it("does not echo error internals if the validation endpoint fails", async () => {
        mocks.auth.mockReturnValue({
            isAuthenticated: true, isLoading: false,
            user: { id: "first-user", role: "admin" },
        });
        mocks.post.mockRejectedValue(new Error("hidden-device-token: never-render"));
        await mount();
        await enterSpotifyLink(link);
        await act(async () => {
            host.querySelector("form")?.dispatchEvent(new Event("submit", {
                bubbles: true, cancelable: true,
            }));
        });
        expect(host.textContent).toContain("Could not validate this Spotify link.");
        expect(host.textContent).not.toContain("hidden-device-token");
    });
});
