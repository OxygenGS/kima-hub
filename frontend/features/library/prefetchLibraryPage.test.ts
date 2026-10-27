import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
    api: { getArtists: vi.fn(), getAlbums: vi.fn(), getTracks: vi.fn() },
}));

import { api } from "@/lib/api";
import { queryKeys } from "@/hooks/useQueries";
import { prefetchLibraryPage } from "./prefetchLibraryPage";

const getArtists = vi.mocked(api.getArtists);
const getAlbums = vi.mocked(api.getAlbums);
const getTracks = vi.mocked(api.getTracks);
let client: QueryClient;

beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    getArtists.mockResolvedValue({ artists: [], total: 0, limit: 40, offset: 0 });
    getAlbums.mockResolvedValue({ albums: [], total: 0, limit: 40, offset: 0 });
    getTracks.mockResolvedValue({ tracks: [], total: 0, limit: 40, offset: 0 });
});

afterEach(() => {
    client.clear();
    vi.resetAllMocks();
});

describe("intent-only library page prefetch", () => {
    it("warms the exact artist cache key and reuses fresh data rather than refetching", async () => {
        const target = { tab: "artists" as const, page: 2, limit: 40, sortBy: "name" as const, filter: "owned" as const };
        await prefetchLibraryPage(client, target);
        await prefetchLibraryPage(client, target);

        expect(getArtists).toHaveBeenCalledTimes(1);
        expect(getArtists).toHaveBeenCalledWith({ filter: "owned", sortBy: "name", limit: 40, offset: 40 });
        expect(client.getQueryData(queryKeys.libraryArtists({ filter: "owned", sortBy: "name", limit: 40, offset: 40 }))).toBeDefined();
    });

    it("prefetches the requested album filter, sort and pagination offset", async () => {
        await prefetchLibraryPage(client, { tab: "albums", page: 3, limit: 40, sortBy: "recent", filter: "discovery" });
        expect(getAlbums).toHaveBeenCalledTimes(1);
        expect(getAlbums).toHaveBeenCalledWith({ filter: "discovery", sortBy: "recent", limit: 40, offset: 80 });
        expect(getArtists).not.toHaveBeenCalled();
    });

    it("warms track pages using their filter-free query key", async () => {
        await prefetchLibraryPage(client, { tab: "tracks", page: 2, limit: 20, sortBy: "tracks", filter: "all" });
        expect(getTracks).toHaveBeenCalledWith({ sortBy: "tracks", limit: 20, offset: 20 });
        expect(client.getQueryData(queryKeys.libraryTracks({ sortBy: "tracks", limit: 20, offset: 20 }))).toBeDefined();
    });

    it("does not fetch invalid page numbers", async () => {
        await prefetchLibraryPage(client, { tab: "albums", page: 0, limit: 40, sortBy: "name", filter: "owned" });
        await prefetchLibraryPage(client, { tab: "artists", page: 1, limit: 0, sortBy: "name", filter: "owned" });
        expect(getAlbums).not.toHaveBeenCalled();
        expect(getArtists).not.toHaveBeenCalled();
    });
});
