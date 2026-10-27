import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
    api: { getAlbum: vi.fn(), getAlbumDiscovery: vi.fn() },
}));

import { api } from "@/lib/api";
import { albumDetailQueryOptions } from "./useAlbumData";

let client: QueryClient;

beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(api.getAlbum).mockResolvedValue({ id: "album-one", title: "Album", tracks: [] });
});
afterEach(() => {
    client.clear();
    vi.clearAllMocks();
});

describe("artist discography detail prefetch", () => {
    it("shares the cached request between hover/focus, opening the album and playback", async () => {
        const options = albumDetailQueryOptions("album-one");
        await client.prefetchQuery(options);
        const opened = await client.fetchQuery(albumDetailQueryOptions("album-one"));
        const played = await client.fetchQuery(albumDetailQueryOptions("album-one"));
        expect(opened).toEqual(played);
        expect(api.getAlbum).toHaveBeenCalledTimes(1);
        expect(api.getAlbum).toHaveBeenCalledWith("album-one");
        expect(api.getAlbumDiscovery).not.toHaveBeenCalled();
    });

    it("does not treat unavailable services as undiscovered albums", async () => {
        vi.mocked(api.getAlbum).mockRejectedValue(Object.assign(new Error("Offline"), { status: 503 }));
        await expect(client.fetchQuery(albumDetailQueryOptions("album-two"))).rejects.toMatchObject({ status: 503 });
        expect(api.getAlbumDiscovery).not.toHaveBeenCalled();
    });
});
