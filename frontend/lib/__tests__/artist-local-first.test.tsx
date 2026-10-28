import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchArtistDetails, fetchArtistOverview, useArtistData } from "@/features/artist/hooks/useArtistData";

const mocks = vi.hoisted(() => ({
    getArtist: vi.fn(), request: vi.fn(), getArtistDiscovery: vi.fn(),
    params: { id: "localartist" }, activeDownloads: [] as string[],
}));
vi.mock("@/lib/api", () => ({ api: mocks }));
vi.mock("next/navigation", () => ({ useParams: () => mocks.params }));
vi.mock("@/hooks/useQueries", () => ({ queryKeys: { artist: (id: string) => ["artist", id] } }));
vi.mock("@/lib/download-context", () => ({ useDownloadContext: () => ({ downloadStatus: { activeDownloads: mocks.activeDownloads } }) }));

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
const local = { id: "localartist", name: "Example Artist", albums: [
    { id: "album", title: "Local Album", year: 2026, owned: true, tracks: [{ id: "track", title: "Local Track", duration: 60 }] },
], topTracks: [], similarArtists: [] };
const complete = { ...local, topTracks: [{ id: "track", title: "Local Track" }], similarArtists: [{ id: "other" }] };
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
let state: ReturnType<typeof useArtistData> | undefined;
function Probe() { state = useArtistData(); return <span>{state.artist?.name}</span>; }
async function render() {
    await act(async () => { root.render(<QueryClientProvider client={client}><Probe /></QueryClientProvider>); });
}
async function until(assertion: () => void) {
    await vi.waitFor(async () => {
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
        assertion();
    });
}

beforeEach(() => {
    vi.resetAllMocks();
    mocks.params.id = "localartist";
    mocks.activeDownloads = [];
    state = undefined;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } } });
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
    await act(async () => root.unmount());
    client.clear();
    container.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("local-first artist details", () => {
    it("exposes playable library albums while enrichment is still unresolved", async () => {
        const slow = deferred<typeof complete>();
        mocks.getArtist.mockReturnValue(slow.promise);
        mocks.request.mockResolvedValue(local);
        await render();
        await until(() => {
            expect(state?.loading).toBe(false);
            expect(state?.source).toBe("library");
            expect(state?.albums[0].tracks[0].id).toBe("track");
            expect(state?.artist.topTracks).toEqual([]);
        });
        expect(client.getQueryData(["artist", "localartist"])).toBeUndefined();
        await act(async () => slow.resolve(complete));
        await until(() => expect(state?.artist.similarArtists).toEqual(complete.similarArtists));
        expect(mocks.getArtist).toHaveBeenCalledTimes(1);
    });
    it("does not request a partial snapshot when full details are cached", async () => {
        client.setQueryData(["artist", "localartist"], complete);
        await render();
        expect(state?.artist).toEqual(complete);
        expect(mocks.request).not.toHaveBeenCalled();
        expect(mocks.getArtist).not.toHaveBeenCalled();
    });
    it("keeps local albums usable if the optional full request fails", async () => {
        mocks.request.mockResolvedValue(local);
        mocks.getArtist.mockRejectedValue(Object.assign(new Error("Offline"), { status: 503 }));
        await render();
        await until(() => {
            expect(client.getQueryState(["artist", "localartist"])?.status).toBe("error");
            expect(state?.error).toBe(false);
            expect(state?.loading).toBe(false);
            expect(state?.albums[0].owned).toBe(true);
        });
        expect(mocks.getArtistDiscovery).not.toHaveBeenCalled();
    });
    it("does not turn an authorization failure into external discovery", async () => {
        const denied = Object.assign(new Error("Forbidden"), { status: 403 });
        mocks.getArtist.mockRejectedValue(denied);
        mocks.request.mockRejectedValue(denied);
        await render();
        await until(() => expect(state?.error).toBe(true));
        expect(state?.artist).toBeUndefined();
        expect(mocks.getArtistDiscovery).not.toHaveBeenCalled();
    });
    it("retains discovery for unknown library artists without launching it twice", async () => {
        const missing = Object.assign(new Error("Missing"), { status: 404 });
        mocks.request.mockRejectedValue(missing);
        mocks.getArtist.mockRejectedValue(missing);
        mocks.getArtistDiscovery.mockResolvedValue({ id: "external-mbid", name: "Discovered", albums: [] });
        await render();
        await until(() => expect(state?.artist.name).toBe("Discovered"));
        expect(state?.source).toBe("discovery");
        expect(mocks.getArtistDiscovery).toHaveBeenCalledTimes(1);
    });
    it("does not let a late response replace a different artist", async () => {
        const old = deferred<typeof local>();
        mocks.getArtist.mockImplementation(() => new Promise(() => {}));
        mocks.request.mockImplementation((url: string) => url.includes("localartist") ? old.promise : Promise.resolve({ ...local, id: "nextartist", name: "Next Artist" }));
        await render();
        mocks.params.id = "nextartist";
        await render();
        await until(() => expect(state?.artist.name).toBe("Next Artist"));
        await act(async () => old.resolve(local));
        expect(state?.artist.name).toBe("Next Artist");
    });
    it("refreshes both independent queries after a download completes", async () => {
        mocks.activeDownloads = ["download"];
        mocks.request.mockResolvedValue(local);
        mocks.getArtist.mockReturnValue(new Promise(() => {}));
        await render();
        await until(() => expect(state?.artist).toEqual(local));
        const changed = { ...local, albums: [...local.albums, { ...local.albums[0], id: "second" }] };
        mocks.request.mockResolvedValue(changed);
        mocks.activeDownloads = [];
        await render();
        await until(() => expect(state?.albums).toHaveLength(2));
        expect(mocks.request).toHaveBeenCalledTimes(2);
    });
    it("encodes IDs and forwards cancellation through the normal authenticated API", async () => {
        const controller = new AbortController();
        mocks.request.mockResolvedValue(local);
        await fetchArtistOverview("Name / Name", controller.signal);
        expect(mocks.request).toHaveBeenCalledWith("/library/artists/Name%20%2F%20Name/overview", { signal: controller.signal, silent404: true });
        await expect(fetchArtistOverview("")).rejects.toThrow("Artist ID is required");
        await expect(fetchArtistDetails("")).rejects.toThrow("Artist ID is required");
    });
});
