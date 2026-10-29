import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
    api: {
        request: vi.fn(),
        getCoverArtUrl: vi.fn((url: string) => url),
    },
}));
vi.mock("@/lib/auth-context", () => ({
    useMusicPermissions: () => ({ canRequestAlbums: false }),
}));
vi.mock("@/lib/i18n/language-context", () => ({
    useLanguage: () => ({ locale: "en", t: (key: string) => key }),
}));
vi.mock("@/components/ui/SectionHeader", () => ({
    SectionHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
}));
vi.mock("@/components/cards/MediaCard", () => ({
    MediaCard: ({ title }: { title: string }) => <div>{title}</div>,
}));

import { api } from "@/lib/api";
import { AvailableAlbums } from "./AvailableAlbums";
import type { Album } from "../types";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MBID = "11111111-2222-3333-4444-555555555555";
const album: Album = { id: "disc-one", title: "Unowned Album", type: "Album", rgMbid: MBID, owned: false };
let host: HTMLDivElement;
let root: Root;
let callbacks: IntersectionObserverCallback[];

async function renderAlbums(albums: Album[] = [album]) {
    await act(async () => root.render(
        <AvailableAlbums
            albums={albums}
            source="library"
            onDownloadAlbum={vi.fn()}
            isPendingDownload={() => false}
        />,
    ));
}

beforeEach(() => {
    vi.useFakeTimers();
    callbacks = [];
    vi.stubGlobal("IntersectionObserver", class {
        constructor(callback: IntersectionObserverCallback) { callbacks.push(callback); }
        observe() {}
        disconnect() {}
    });
    vi.mocked(api.request).mockResolvedValue({ coverUrl: "/cached/artwork.jpg" });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe("artist available-album artwork", () => {
    it("does not fetch missing covers for offscreen album cards", async () => {
        await renderAlbums();
        expect(host.textContent).toContain("Unowned Album");
        expect(callbacks).toHaveLength(1);
        await act(async () => { await vi.runAllTimersAsync(); });
        expect(api.request).not.toHaveBeenCalled();
    });

    it("fetches a missing cover only after intersection and only once", async () => {
        await renderAlbums();
        await act(async () => {
            callbacks[0]([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
        });
        await act(async () => { await vi.runAllTimersAsync(); });
        expect(api.request).toHaveBeenCalledTimes(1);
        expect(api.request).toHaveBeenCalledWith("/library/album-cover/" + MBID);
    });

    it("skips artwork lookups when the cover is already known", async () => {
        await renderAlbums([{ ...album, coverUrl: "/already-known.jpg" }]);
        expect(callbacks).toHaveLength(0);
        await act(async () => { await vi.runAllTimersAsync(); });
        expect(api.request).not.toHaveBeenCalled();
    });

    it("anchors the first visible available-albums section, including EP-only profiles", async () => {
        await renderAlbums([{ ...album, type: "EP" }]);
        expect(host.querySelectorAll("#artist-available")).toHaveLength(1);
        expect(host.querySelector("#artist-available")?.textContent).toContain("Singles and EPs");

        await renderAlbums([
            { ...album, id: "studio", type: "Album" },
            { ...album, id: "single", type: "Single" },
        ]);
        expect(host.querySelectorAll("#artist-available")).toHaveLength(1);
        expect(host.querySelector("#artist-available")?.textContent).toContain("Albums Available");
    });
});
