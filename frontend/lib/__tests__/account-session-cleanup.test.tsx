import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { QueryProvider, clearBrowserQueryCache } from "../query-client";
import { clearAccountMediaStorage, STORAGE_KEYS } from "../storage-keys";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
let client: QueryClient;

function Probe() {
    client = useQueryClient();
    return null;
}

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(async () => {
    await act(async () => root.unmount());
    await clearBrowserQueryCache();
    host.remove();
    localStorage.clear();
});

describe("account-scoped browser state", () => {
    it("forgets cached private responses before another account logs in", async () => {
        await act(async () => root.render(<QueryProvider><Probe /></QueryProvider>));
        client.setQueryData(["library", "artists"], { artists: ["alice's private library"] });
        client.setQueryData(["playlist", "alice"], { tracks: ["private"] });
        expect(client.getQueryData(["playlist", "alice"])).toBeDefined();

        await act(async () => clearBrowserQueryCache());
        expect(client.getQueryData(["library", "artists"])).toBeUndefined();
        expect(client.getQueryData(["playlist", "alice"])).toBeUndefined();
    });

    it("removes user-specific media identities but preserves device volume", () => {
        localStorage.setItem(STORAGE_KEYS.CURRENT_AUDIOBOOK, '{"id":"alice-private-book"}');
        localStorage.setItem(STORAGE_KEYS.CURRENT_PODCAST, '{"id":"alice-private-episode"}');
        localStorage.setItem(STORAGE_KEYS.PLAYBACK_TYPE, "audiobook");
        localStorage.setItem(STORAGE_KEYS.PODCAST_EPISODE_QUEUE, "[]");
        localStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, "3");
        localStorage.setItem(STORAGE_KEYS.VOLUME, "0.7");
        localStorage.setItem(STORAGE_KEYS.IS_MUTED, "true");

        clearAccountMediaStorage();

        for (const key of [
            STORAGE_KEYS.CURRENT_AUDIOBOOK, STORAGE_KEYS.CURRENT_PODCAST,
            STORAGE_KEYS.PLAYBACK_TYPE, STORAGE_KEYS.PODCAST_EPISODE_QUEUE,
            STORAGE_KEYS.CURRENT_INDEX,
        ]) expect(localStorage.getItem(key)).toBeNull();
        expect(localStorage.getItem(STORAGE_KEYS.VOLUME)).toBe("0.7");
        expect(localStorage.getItem(STORAGE_KEYS.IS_MUTED)).toBe("true");
    });
});
