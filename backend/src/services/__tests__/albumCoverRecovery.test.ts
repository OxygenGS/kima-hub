/**
 * No database or external provider is contacted by these unit tests.
 * The repair must never replace existing artwork or leave the music root.
 */
const mockCount = jest.fn();
const mockFindMany = jest.fn();
const mockUpdateMany = jest.fn();
const mockExtract = jest.fn();
const mockNativePath = jest.fn();
const mockExistingMusicFile = jest.fn();
const mockArtwork = jest.fn();

jest.mock("../../config", () => ({
    config: { music: { musicPath: "/music", transcodeCachePath: "/cache/transcode" } },
}));
jest.mock("../../utils/db", () => ({
    prisma: {
        album: {
            count: (...args: unknown[]) => mockCount(...args),
            findMany: (...args: unknown[]) => mockFindMany(...args),
            updateMany: (...args: unknown[]) => mockUpdateMany(...args),
        },
    },
}));
jest.mock("../../utils/logger", () => ({
    logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../coverArtExtractor", () => ({
    CoverArtExtractor: jest.fn().mockImplementation(() => ({
        extractCoverArt: (...args: unknown[]) => mockExtract(...args),
    })),
}));
jest.mock("../imageStorage", () => ({
    getLocalImagePathAsync: (...args: unknown[]) => mockNativePath(...args),
}));
jest.mock("../../routes/library/trackPath", () => ({
    resolveExistingMusicFile: (...args: unknown[]) => mockExistingMusicFile(...args),
}));
jest.mock("../artwork", () => ({
    findAlbumArtwork: (...args: unknown[]) => mockArtwork(...args),
}));

import {
    startAlbumCoverRecovery,
    getAlbumCoverRecoveryStatus,
} from "../albumCoverRecovery";

async function waitForRecovery(): Promise<void> {
    for (let attempt = 0; attempt < 120; attempt++) {
        if (!getAlbumCoverRecoveryStatus().inProgress) return;
        await new Promise<void>((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("Recovery did not complete");
}

describe("existing indexed album cover recovery", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCount.mockResolvedValueOnce(5).mockResolvedValueOnce(0);
        mockUpdateMany.mockResolvedValue({ count: 1 });
        mockExtract.mockImplementation((_file: string, id: string) =>
            Promise.resolve(id === "local" ? "local.jpg" : null),
        );
        mockNativePath.mockImplementation((url: string) =>
            Promise.resolve(url === "native:albums/present.jpg" ? "/cache/covers/albums/present.jpg" : null),
        );
        mockExistingMusicFile.mockImplementation((filePath: string) =>
            Promise.resolve(filePath.startsWith("Artist/") ? "/music/" + filePath : null),
        );
        mockArtwork.mockImplementation(({ albumTitle }: { albumTitle: string }) =>
            Promise.resolve(albumTitle === "Remote" ? { url: "https://images.example/cover.jpg", source: "deezer" } : null),
        );
        mockFindMany.mockResolvedValueOnce([
            { id: "local", title: "Local", rgMbid: "rg-1", coverUrl: null, artist: { name: "Artist" }, tracks: [{ filePath: "Artist/Local/01.flac" }] },
            { id: "native", title: "Present", rgMbid: "rg-2", coverUrl: "native:albums/present.jpg", artist: { name: "Artist" }, tracks: [{ filePath: "Artist/Present/01.flac" }] },
            { id: "remote", title: "Remote", rgMbid: "rg-3", coverUrl: null, artist: { name: "Artist" }, tracks: [{ filePath: "Artist/Remote/01.flac" }] },
            { id: "outside", title: "Outside", rgMbid: "rg-4", coverUrl: null, artist: { name: "Artist" }, tracks: [{ filePath: "../../private.flac" }] },
            { id: "none", title: "No art", rgMbid: "rg-5", coverUrl: "", artist: { name: "Artist" }, tracks: [{ filePath: "Artist/None/01.flac" }] },
        ]);
    });

    it("restores only missing covers, keeps valid ones and rejects unsafe paths", async () => {
        expect(startAlbumCoverRecovery()).toBe(true);
        expect(startAlbumCoverRecovery()).toBe(false);
        await waitForRecovery();

        const status = getAlbumCoverRecoveryStatus();
        expect(status).toMatchObject({
            inProgress: false,
            total: 5,
            processed: 5,
            recoveredLocal: 1,
            recoveredExternal: 1,
            skipped: 3,
            failed: 0,
            hasMore: false,
        });
        expect(mockExtract).toHaveBeenCalledWith("/music/Artist/Local/01.flac", "local");
        expect(mockExistingMusicFile).toHaveBeenCalledWith("../../private.flac");
        // Outside paths are rejected by the resolver and never passed to the extractor.
        expect(mockExtract).not.toHaveBeenCalledWith(expect.stringContaining("private"), expect.anything());
        expect(mockArtwork).toHaveBeenCalledTimes(2);
        expect(mockUpdateMany).toHaveBeenCalledWith({
            where: { id: "local", coverUrl: null, userCoverUrl: null },
            data: { coverUrl: "native:local.jpg" },
        });
        expect(mockUpdateMany).toHaveBeenCalledWith({
            where: { id: "remote", coverUrl: null, userCoverUrl: null },
            data: { coverUrl: "https://images.example/cover.jpg" },
        });
        const firstCall = mockFindMany.mock.calls[0][0];
        expect(firstCall.where).toMatchObject({
            userCoverUrl: null,
            tracks: { some: { missingSince: null, corrupt: false } },
        });
        expect(firstCall.take).toBeLessThanOrEqual(20);
    });
});
