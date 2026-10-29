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
