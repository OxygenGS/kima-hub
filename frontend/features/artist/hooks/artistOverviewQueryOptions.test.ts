import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
    api: {
        request: vi.fn(),
        getArtist: vi.fn(),
        getArtistDiscovery: vi.fn(),
    },
}));
vi.mock("@/lib/download-context", () => ({
    useDownloadContext: vi.fn(),
}));

import { api } from "@/lib/api";
import { queryKeys } from "@/hooks/useQueries";
import {
    artistOverviewQueryOptions,
    fetchArtistDetails,
    resolveArtistSource,
} from "./useArtistData";

const request = vi.mocked(api.request);
const getArtist = vi.mocked(api.getArtist);
const getArtistDiscovery = vi.mocked(api.getArtistDiscovery);
const overview = {
    id: "local-artist",
    name: "Library Artist",
    albums: [{ id: "owned", title: "Owned", owned: true }],
    topTracks: [],
    similarArtists: [],
};
let client: QueryClient;

beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    request.mockResolvedValue(overview);
});

afterEach(() => {
    client.clear();
    vi.resetAllMocks();
});

describe("intent-only artist overview prefetch", () => {
    it("caches a database-only overview under a separate key without requesting full enrichment", async () => {
        const options = artistOverviewQueryOptions("local-artist");
        expect(options.queryKey).toEqual([...queryKeys.artist("local-artist"), "overview"]);

        await client.prefetchQuery(options);
        expect(client.getQueryData(options.queryKey)).toEqual(overview);
        expect(client.getQueryData(queryKeys.artist("local-artist"))).toBeUndefined();
        expect(request).toHaveBeenCalledWith(
            "/library/artists/local-artist/overview",
            expect.objectContaining({ silent404: true, signal: expect.any(AbortSignal) }),
        );
        expect(getArtist).not.toHaveBeenCalled();
        expect(getArtistDiscovery).not.toHaveBeenCalled();
    });

    it("reuses a fresh prefetched overview when the page mounts", async () => {
        await client.prefetchQuery(artistOverviewQueryOptions("local-artist"));
        const onPage = await client.fetchQuery(artistOverviewQueryOptions("local-artist"));
        expect(onPage).toEqual(overview);
        expect(request).toHaveBeenCalledTimes(1);
    });

    it("shares concurrent intent requests instead of fetching the same overview twice", async () => {
        const options = artistOverviewQueryOptions("local-artist");
        await Promise.all([client.prefetchQuery(options), client.prefetchQuery(options)]);
        expect(request).toHaveBeenCalledTimes(1);
    });

    it("encodes artist IDs and lets full details retain their independent cache", async () => {
        await client.prefetchQuery(artistOverviewQueryOptions("Artist & Friends"));
        expect(request).toHaveBeenCalledWith(
            "/library/artists/Artist%20%26%20Friends/overview",
            expect.any(Object),
        );
        getArtist.mockResolvedValue({ id: "Artist & Friends", name: "Artist", albums: [] });
        await client.fetchQuery({
            queryKey: queryKeys.artist("Artist & Friends"),
            queryFn: () => fetchArtistDetails("Artist & Friends"),
            staleTime: 10 * 60 * 1000,
        });
        expect(getArtist).toHaveBeenCalledTimes(1);
        expect(request).toHaveBeenCalledTimes(1);
    });

    it("does not turn a missing local overview into an external discovery request", async () => {
        request.mockRejectedValue(Object.assign(new Error("Missing"), { status: 404 }));
        expect(await client.fetchQuery(artistOverviewQueryOptions("missing"))).toBeNull();
        expect(getArtistDiscovery).not.toHaveBeenCalled();
    });

    it("surfaces server failures instead of permanently caching an empty artist", async () => {
        request.mockRejectedValue(Object.assign(new Error("Unavailable"), { status: 503 }));
        await expect(client.fetchQuery(artistOverviewQueryOptions("unavailable")))
            .rejects.toMatchObject({ status: 503 });
        expect(getArtistDiscovery).not.toHaveBeenCalled();
    });
});

describe("verified artist source on full and partial navigation", () => {
    it("classifies a local artist with a UUID-style ID as library without consulting discovery", async () => {
        const id = "b23e8a63-8f47-4882-b55b-df2c92ef400e";
        getArtist.mockResolvedValue({ id, name: "Local Artist", coverArt: "native:artists/local.jpg" });

        const result = await fetchArtistDetails(id);
        expect(result).toMatchObject({ id, __kimaArtistOrigin: "library" });
        expect(resolveArtistSource(result, null)).toBe("library");
        expect(getArtistDiscovery).not.toHaveBeenCalled();
    });

    it("classifies an external discovery result as discovery even when its ID has no dash", async () => {
        getArtist.mockRejectedValue(Object.assign(new Error("Not in library"), { status: 404 }));
        getArtistDiscovery.mockResolvedValue({ id: "externalartist", name: "External Artist", image: "https://example.test/photo.jpg" });

        const result = await fetchArtistDetails("externalartist");
        expect(result).toMatchObject({ id: "externalartist", __kimaArtistOrigin: "discovery" });
        expect(resolveArtistSource(result, null)).toBe("discovery");
        expect(getArtistDiscovery).toHaveBeenCalledTimes(1);
    });

    it("prefers proven full response origin over a stale local overview", () => {
        expect(resolveArtistSource({ __kimaArtistOrigin: "discovery" }, overview)).toBe("discovery");
        expect(resolveArtistSource({ __kimaArtistOrigin: "library" }, null)).toBe("library");
        expect(resolveArtistSource(undefined, overview)).toBe("library");
    });

    it("never guesses local vs external from an untagged cached ID", () => {
        expect(resolveArtistSource({ id: "abc" }, null)).toBeNull();
        expect(resolveArtistSource({ id: "a-b-c" }, null)).toBeNull();
        expect(resolveArtistSource(null, null)).toBeNull();
    });

    it("propagates local network errors instead of misclassifying as discovery", async () => {
        getArtist.mockRejectedValue(Object.assign(new Error("Unavailable"), { status: 503 }));
        await expect(fetchArtistDetails("local")).rejects.toMatchObject({ status: 503 });
        expect(getArtistDiscovery).not.toHaveBeenCalled();
    });

    it("returns null when neither local library nor external discovery knows an artist", async () => {
        getArtist.mockRejectedValue(Object.assign(new Error("Missing"), { status: 404 }));
        getArtistDiscovery.mockRejectedValue(Object.assign(new Error("Missing"), { status: 404 }));

        expect(await fetchArtistDetails("missing")).toBeNull();
        expect(resolveArtistSource(null, null)).toBeNull();
    });
});
