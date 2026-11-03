/** Private artwork must never be re-served by a token-independent SW cache. */
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

type WorkerEvent = { request?: Request | { url: string; method: string; mode: string }; respondWith?: (p: Promise<Response>) => void; waitUntil?: (p: Promise<unknown>) => void };
type Listener = (event: WorkerEvent) => void;

function createWorker() {
    const handlers = new Map<string, Listener>();
    const oldCaches = ["kima-v2", "kima-images-v3", "another-app-cache", "kima-v3"];
    const cache = {
        addAll: vi.fn().mockResolvedValue(undefined),
        match: vi.fn().mockResolvedValue(new Response("Offline shell", { status: 200 })),
    };
    const caches = {
        keys: vi.fn().mockResolvedValue(oldCaches),
        delete: vi.fn().mockResolvedValue(true),
        open: vi.fn().mockResolvedValue(cache),
    };
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    const self = {
        addEventListener: (name: string, listener: Listener) => handlers.set(name, listener),
        skipWaiting: vi.fn(),
        clients: { claim: vi.fn() },
    };
    const code = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");
    runInNewContext(code, { self, caches, fetch: fetchMock, URL, Response, Promise });
    return { handlers, caches, cache, fetchMock };
}

describe("service worker private-media isolation", () => {
    it.each([
        "/api/library/cover-art/album-1?token=token-from-account-a",
        "/api/library/cover-art/album-1",
        "/api/audiobooks/book-1/cover",
        "/api/podcasts/episode-1/cover",
        "/api/library/stream/track-1",
    ])("passes protected media through to the server: %s", (path) => {
        const { handlers, caches, fetchMock } = createWorker();
        const request = new Request("https://example.invalid" + path);
        const respondWith = vi.fn();
        handlers.get("fetch")!({ request, respondWith });
        expect(respondWith).not.toHaveBeenCalled();
        expect(caches.open).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("deletes the old token-independent artwork cache on activation", async () => {
        const { handlers, caches } = createWorker();
        let work!: Promise<unknown>;
        handlers.get("activate")!({ waitUntil: (promise) => { work = promise; } });
        await work;
        expect(caches.delete).toHaveBeenCalledWith("kima-v2");
        expect(caches.delete).toHaveBeenCalledWith("kima-images-v3");
        expect(caches.delete).not.toHaveBeenCalledWith("another-app-cache");
        expect(caches.delete).not.toHaveBeenCalledWith("kima-v3");
    });

    it("retains the static offline fallback for navigation", async () => {
        const { handlers, cache, fetchMock } = createWorker();
        let handled!: Promise<Response>;
        handlers.get("fetch")!({
            request: { url: "https://example.invalid/collection", method: "GET", mode: "navigate" },
            respondWith: (promise) => { handled = promise; },
        });
        const response = await handled;
        expect(fetchMock).toHaveBeenCalledOnce();
        expect(cache.match).toHaveBeenCalledWith("/offline.html");
        expect(await response.text()).toBe("Offline shell");
    });
});
