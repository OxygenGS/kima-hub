/**
 * Artist art is best-effort but identity-sensitive: an unrelated search hit
 * must never become somebody else's portrait.
 */
const mockRateLimitedGet = jest.fn();
const cache = new Map<string, string>();

jest.mock("../httpClient", () => ({
    rateLimitedGet: (...args: unknown[]) => mockRateLimitedGet(...args),
}));
jest.mock("../../utils/logger", () => ({
    logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("../../utils/cacheWrapper", () => ({
    CacheWrapper: class {
        async get(key: string) { return cache.get(key) ?? null; }
        async set(key: string, value: string) { cache.set(key, value); }
    },
}));

import { deezerService } from "../deezer";

const IMAGE = "https://e-cdns-images.dzcdn.net/images/artist/verified/1000x1000.jpg";

beforeEach(() => {
    jest.clearAllMocks();
    cache.clear();
});

describe("recovering an artist image from verified Deezer matches", () => {
    it("searches beyond the first result and uses a later exact name", async () => {
        mockRateLimitedGet.mockResolvedValue({
            data: [
                { name: "Similar Artist", nb_fan: 10000, picture_xl: "https://wrong.test/photo.jpg" },
                { name: "Beyonce", nb_fan: 50000, picture_xl: IMAGE },
            ],
        });

        expect(await deezerService.getArtistImage("Beyoncé")).toBe(IMAGE);
        expect(mockRateLimitedGet).toHaveBeenCalledWith(
            "deezer", "https://api.deezer.com/search/artist",
            expect.objectContaining({ params: { q: "Beyoncé", limit: 25 } }),
        );
    });

    it("uses the most-followed verified namesake with an image", async () => {
        mockRateLimitedGet.mockResolvedValue({
            data: [
                { name: "Artist", nb_fan: 250, picture_xl: "https://wrong.test/rare.jpg" },
                { name: "Artist", nb_fan: 750000, picture_big: IMAGE },
                { name: "ARTIST", nb_fan: 100, picture_xl: "https://wrong.test/tiny.jpg" },
            ],
        });
        expect(await deezerService.getArtistImage("Artist")).toBe(IMAGE);
    });

    it("skips an image-less namesake without accepting a different name", async () => {
        mockRateLimitedGet.mockResolvedValue({
            data: [
                { name: "Exact", nb_fan: 90000 },
                { name: "Exact", nb_fan: 100, picture_medium: IMAGE },
                { name: "Inexact", nb_fan: 1000000, picture_xl: "https://wrong.test/big.jpg" },
            ],
        });
        expect(await deezerService.getArtistImage("Exact")).toBe(IMAGE);
    });

    it("does not trust fuzzy matches or a top-ranked impostor", async () => {
        mockRateLimitedGet.mockResolvedValue({
            data: [{ name: "Some Artist Tribute", picture_xl: IMAGE }],
        });
        expect(await deezerService.getArtistImage("Some Artist")).toBeNull();
    });

    it("caches the new search result and skips a second remote request", async () => {
        mockRateLimitedGet.mockResolvedValue({
            data: [{ name: "Artist", picture_big: IMAGE }],
        });
        await deezerService.getArtistImage("Artist");
        expect(await deezerService.getArtistImage("Artist")).toBe(IMAGE);
        expect(mockRateLimitedGet).toHaveBeenCalledTimes(1);
        expect([...cache.keys()]).toContain("deezer:artist-image-v2:artist");
    });

    it("deliberately retries a cached miss when an admin requests a refresh", async () => {
        mockRateLimitedGet.mockResolvedValueOnce({ data: [] })
            .mockResolvedValueOnce({ data: [{ name: "Artist", picture_xl: IMAGE }] });
        expect(await deezerService.getArtistImage("Artist")).toBeNull();
        expect(await deezerService.getArtistImage("Artist")).toBeNull();
        expect(mockRateLimitedGet).toHaveBeenCalledTimes(1);
        expect(await deezerService.getArtistImage("Artist", { refresh: true })).toBe(IMAGE);
        expect(await deezerService.getArtistImage("Artist")).toBe(IMAGE);
        expect(mockRateLimitedGet).toHaveBeenCalledTimes(2);
    });

    it("does not cache a failed request as an artist with no image", async () => {
        mockRateLimitedGet.mockRejectedValueOnce(new Error("Deezer unavailable"))
            .mockResolvedValueOnce({ data: [{ name: "Artist", picture_xl: IMAGE }] });
        await expect(deezerService.getArtistImage("Artist")).rejects.toThrow("Deezer unavailable");
        expect(await deezerService.getArtistImage("Artist")).toBe(IMAGE);
        expect(mockRateLimitedGet).toHaveBeenCalledTimes(2);
    });
});
