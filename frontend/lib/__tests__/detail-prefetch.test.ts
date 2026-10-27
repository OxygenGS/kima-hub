import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/hooks/useQueries";
import { getCachedAlbumDetails, prefetchAlbumDetail, prefetchArtistDetail } from "@/lib/detail-prefetch";

vi.mock("@/lib/api", () => ({
    api: {
        getArtist: vi.fn(),
        getArtistDiscovery: vi.fn(),
        getAlbum: vi.fn(),
        getAlbumDiscovery: vi.fn(),
    },
}));

const client = () => new QueryClient({
    defaultOptions: { queries: { retry: false } },
});

beforeEach(() => vi.clearAllMocks());

describe("Project Turbo: intent prefetch", () => {
    it("loads an artist only once across hover, focus and warm navigation", async () => {
        vi.mocked(api.getArtist).mockResolvedValue({ id: "artist-1", name: "Artist" } as never);
        const qc = client();
        await prefetchArtistDetail(qc, "artist-1");
        await prefetchArtistDetail(qc, "artist-1");
        expect(api.getArtist).toHaveBeenCalledTimes(1);
        expect(api.getArtist).toHaveBeenCalledWith("artist-1");
        expect(api.getArtistDiscovery).not.toHaveBeenCalled();
        expect(qc.getQueryData(queryKeys.artist("artist-1"))).toMatchObject({ name: "Artist" });
        qc.clear();
    });

    it("shares an album detail request between simultaneous navigation prefetches", async () => {
        vi.mocked(api.getAlbum).mockResolvedValue({ id: "album-1", title: "Album", tracks: [] } as never);
        const qc = client();
        await Promise.all([prefetchAlbumDetail(qc, "album-1"), prefetchAlbumDetail(qc, "album-1")]);
        await prefetchAlbumDetail(qc, "album-1");
        const album = await getCachedAlbumDetails(qc, "album-1");
        expect(album).toMatchObject({ title: "Album" });
        expect(api.getAlbum).toHaveBeenCalledTimes(1);
        expect(qc.getQueryData(queryKeys.album("album-1"))).toMatchObject({ title: "Album" });
        qc.clear();
    });

    it("does not request details when an identifier is missing", async () => {
        const qc = client();
        await Promise.all([prefetchArtistDetail(qc, ""), prefetchAlbumDetail(qc, "")]);
        expect(api.getArtist).not.toHaveBeenCalled();
        expect(api.getAlbum).not.toHaveBeenCalled();
        qc.clear();
    });
});
