const mockCount = jest.fn();
const mockFindMany = jest.fn();
const mockUpdateMany = jest.fn();
const mockNativePath = jest.fn();
const mockResolveTrack = jest.fn();
const mockRecoverLocal = jest.fn();
const mockArtwork = jest.fn();
const mockSetex = jest.fn();

jest.mock("../../config", () => ({
    config: { music: { musicPath: "/music", transcodeCachePath: "/cache/transcode" } },
}));
jest.mock("../../utils/db", () => ({
    prisma: {
        artist: {
            count: (...args: unknown[]) => mockCount(...args),
            findMany: (...args: unknown[]) => mockFindMany(...args),
            updateMany: (...args: unknown[]) => mockUpdateMany(...args),
        },
    },
}));
jest.mock("../../utils/logger", () => ({
    logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../../utils/redis", () => ({
    redisClient: { setex: (...args: unknown[]) => mockSetex(...args) },
}));
jest.mock("../artwork", () => ({
    findArtistArtwork: (...args: unknown[]) => mockArtwork(...args),
}));
jest.mock("../imageStorage", () => ({
    getLocalImagePathAsync: (...args: unknown[]) => mockNativePath(...args),
}));
jest.mock("../../routes/library/trackPath", () => ({
    resolveExistingMusicFile: (...args: unknown[]) => mockResolveTrack(...args),
}));
jest.mock("../artistPortraitExtractor", () => ({
    recoverLocalArtistPortrait: (...args: unknown[]) => mockRecoverLocal(...args),
}));

import {
    startArtistImageRecovery,
    getArtistImageRecoveryStatus,
} from "../artistImageRecovery";

async function finished(): Promise<void> {
    for (let i = 0; i < 150; i++) {
        if (!getArtistImageRecoveryStatus().inProgress) return;
        await new Promise<void>((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("Artist recovery did not complete");
}
const row = (id: string, heroUrl: string | null = null) => ({
    id, heroUrl,
    name: id === "remote" ? "Remote Artist" : "Other Artist",
    mbid: "9f916af0-6156-4c7f-b6f5-f11705824b00",
    albums: [{ tracks: [{ filePath: "Artist/Album/01.flac" }] }],
});

beforeEach(() => {
    jest.clearAllMocks();
    mockCount.mockReset().mockResolvedValueOnce(4).mockResolvedValueOnce(0);
    mockFindMany.mockReset().mockResolvedValueOnce([
        row("local"),
        row("existing", "native:artists/existing.jpg"),
        row("remote"),
        { ...row("unreadable"), albums: [{ tracks: [{ filePath: "unreadable.flac" }] }] },
    ]);
    mockNativePath.mockImplementation((url: string) =>
        Promise.resolve(url === "native:artists/existing.jpg" ? "/cache/covers/artists/existing.jpg" : null)
    );
    mockResolveTrack.mockImplementation((filepath: string) =>
        Promise.resolve(filepath === "unreadable.flac" ? null : "/music/" + filepath)
    );
    mockRecoverLocal.mockImplementation((_audio: string, _name: string, id: string) =>
        Promise.resolve(id === "local" ? "native:artists/local-recovered.jpg" : null)
    );
    mockArtwork.mockImplementation(({ name }: { name: string }) =>
        Promise.resolve(name === "Remote Artist" ? { url: "https://example.org/artist.jpg", source: "deezer" } : null)
    );
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockSetex.mockResolvedValue("OK");
});

describe("indexed artist photo repair", () => {
    it("keeps valid images, recovers local and remote, and respects permission filters", async () => {
        expect(startArtistImageRecovery()).toBe(true);
        expect(startArtistImageRecovery()).toBe(false);
        await finished();
        expect(getArtistImageRecoveryStatus()).toMatchObject({
            processed: 4, total: 4, recoveredLocal: 1, recoveredExternal: 1,
            skipped: 2, failed: 0, hasMore: false, inProgress: false,
        });
        expect(mockUpdateMany).toHaveBeenCalledWith({
            where: { id: "local", heroUrl: null, userHeroUrl: null },
            data: { heroUrl: "native:artists/local-recovered.jpg" },
        });
        expect(mockUpdateMany).toHaveBeenCalledWith({
            where: { id: "remote", heroUrl: null, userHeroUrl: null },
            data: { heroUrl: "https://example.org/artist.jpg" },
        });
        expect(mockSetex).toHaveBeenCalledWith(
            "hero:local", 7 * 24 * 60 * 60, "native:artists/local-recovered.jpg"
        );
        expect(mockRecoverLocal).not.toHaveBeenCalledWith(
            "/music/unreadable.flac", expect.anything(), expect.anything(),
            expect.anything(), expect.anything()
        );
        expect(mockFindMany.mock.calls[0][0].where).toMatchObject({
            userHeroUrl: null,
            albums: { some: { tracks: { some: { missingSince: null, corrupt: false } } } },
        });
    });

    it("does not overwrite a concurrent edit and resumes from its cursor", async () => {
        mockCount.mockReset()
            .mockResolvedValueOnce(1).mockResolvedValueOnce(1)
            .mockResolvedValueOnce(1).mockResolvedValueOnce(0);
        mockFindMany.mockReset().mockResolvedValueOnce([row("a")]).mockResolvedValueOnce([row("b")]);
        mockRecoverLocal.mockResolvedValue("native:artists/recovered.jpg");
        mockUpdateMany.mockReset().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

        expect(startArtistImageRecovery()).toBe(true);
        await finished();
        expect(getArtistImageRecoveryStatus()).toMatchObject({
            processed: 1, skipped: 1, recoveredLocal: 0, hasMore: true,
        });
        expect(startArtistImageRecovery()).toBe(true);
        await finished();
        expect(getArtistImageRecoveryStatus()).toMatchObject({
            processed: 1, recoveredLocal: 1, hasMore: false,
        });
        expect(mockFindMany.mock.calls[1][0].where.id).toEqual({ gt: "a" });
        expect(mockSetex).toHaveBeenCalledTimes(1);
    });

    it("repairs a missing native cache path without overwriting a manual choice", async () => {
        mockCount.mockReset().mockResolvedValueOnce(1).mockResolvedValueOnce(0);
        mockFindMany.mockReset().mockResolvedValueOnce([row("remote", "native:artists/gone.jpg")]);
        mockNativePath.mockResolvedValue(null);
        expect(startArtistImageRecovery()).toBe(true);
        await finished();
        expect(getArtistImageRecoveryStatus()).toMatchObject({ recoveredExternal: 1, failed: 0 });
        expect(mockUpdateMany).toHaveBeenCalledWith({
            where: { id: "remote", heroUrl: "native:artists/gone.jpg", userHeroUrl: null },
            data: { heroUrl: "https://example.org/artist.jpg" },
        });
    });
});
