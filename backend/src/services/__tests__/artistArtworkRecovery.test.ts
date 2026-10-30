/**
 * Admin recovery is deliberately bounded, local-first and non-destructive.
 * No network, image files or real database are used in these tests.
 */
const mockCount = jest.fn();
const mockFindMany = jest.fn();
const mockArtistUpdateMany = jest.fn();
const mockTrackFindFirst = jest.fn();
const mockRedisDel = jest.fn();
const mockFindArtistArtwork = jest.fn();
const mockDownloadAndStoreImage = jest.fn();
const mockFindLocalArtistImage = jest.fn();

jest.mock("../../config", () => ({
    config: { music: { musicPath: "/music" } },
}));
jest.mock("../../utils/db", () => ({
    prisma: {
        artist: {
            count: (...a: unknown[]) => mockCount(...a),
            findMany: (...a: unknown[]) => mockFindMany(...a),
            updateMany: (...a: unknown[]) => mockArtistUpdateMany(...a),
        },
        track: { findFirst: (...a: unknown[]) => mockTrackFindFirst(...a) },
    },
}));
jest.mock("../../utils/logger", () => ({
    logger: { warn: jest.fn(), debug: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("../../utils/redis", () => ({
    redisClient: { del: (...a: unknown[]) => mockRedisDel(...a) },
}));
jest.mock("../artwork", () => ({
    findArtistArtwork: (...a: unknown[]) => mockFindArtistArtwork(...a),
}));
jest.mock("../imageStorage", () => ({
    downloadAndStoreImage: (...a: unknown[]) => mockDownloadAndStoreImage(...a),
    findLocalArtistImage: (...a: unknown[]) => mockFindLocalArtistImage(...a),
}));

import {
    getMissingArtistArtworkCount,
    getArtistArtworkRecoveryProgress,
    startArtistArtworkRecovery,
} from "../artistArtworkRecovery";

const IMG = "https://assets.fanart.tv/fanart/music/demo/artistthumb/one.jpg";
const rows = [{ id: "artist-test-1", name: "Safe Artist", mbid: "9c070e4f-28c1-4b98-b371-d8514c31ba55" }];

async function drainJob(): Promise<void> {
    for (let i = 0; i < 40 && getArtistArtworkRecoveryProgress().inProgress; i++) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    expect(getArtistArtworkRecoveryProgress().inProgress).toBe(false);
}

beforeEach(() => {
    jest.clearAllMocks();
    mockCount.mockResolvedValue(3);
    mockFindMany.mockResolvedValue(rows);
    mockArtistUpdateMany.mockResolvedValue({ count: 1 });
    mockTrackFindFirst.mockResolvedValue(null);
    mockFindArtistArtwork.mockResolvedValue({ url: IMG, source: "fanart" });
    mockDownloadAndStoreImage.mockImplementation(async (_url: string, id: string) => `native:artists/${id}.jpg`);
    mockFindLocalArtistImage.mockResolvedValue(null);
    mockRedisDel.mockResolvedValue(1);
});

describe("missing artist photo recovery", () => {
    it("reports only genuinely empty, non-overridden artist images", async () => {
        expect(await getMissingArtistArtworkCount()).toBe(3);
        expect(mockCount).toHaveBeenCalledWith({
            where: { heroUrl: null, userHeroUrl: null },
        });
    });

    it("retries the shared providers without a stale negative cache", async () => {
        expect(startArtistArtworkRecovery()).toBe(true);
        await drainJob();
        expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
            take: 20,
            select: { id: true, name: true, mbid: true },
        }));
        expect(mockFindArtistArtwork).toHaveBeenCalledWith({
            name: "Safe Artist", mbid: rows[0].mbid, refresh: true,
        });
        expect(mockDownloadAndStoreImage).toHaveBeenCalledWith(IMG, expect.stringMatching(/^recovery-artist-test-1-/), "artist");
        expect(mockArtistUpdateMany).toHaveBeenCalledWith({
            where: { id: "artist-test-1", heroUrl: null, userHeroUrl: null },
            data: { heroUrl: expect.stringMatching(/^native:artists\/recovery-artist-test-1-.*\.jpg$/) },
        });
        expect(mockRedisDel).toHaveBeenCalledWith("hero:artist-test-1");
        expect(getArtistArtworkRecoveryProgress()).toMatchObject({
            inProgress: false, queued: 1, processed: 1, recovered: 1, missing: 0, failed: 0,
        });
    });

    it("takes a local artist file before asking any external service", async () => {
        mockTrackFindFirst.mockResolvedValue({ filePath: "Safe Artist/Album/01.flac" });
        mockFindLocalArtistImage.mockImplementation(async (_root: string, _track: string, _id: string, opts: { cacheId: string }) => `native:artists/${opts.cacheId}.png`);
        expect(startArtistArtworkRecovery()).toBe(true);
        await drainJob();
        expect(mockFindLocalArtistImage).toHaveBeenCalledWith(
            "/music", "Safe Artist/Album/01.flac", "artist-test-1",
            { artistOnly: true, cacheId: expect.stringMatching(/^recovery-artist-test-1-/) },
        );
        expect(mockFindArtistArtwork).not.toHaveBeenCalled();
        expect(mockArtistUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
            data: { heroUrl: expect.stringMatching(/^native:artists\/recovery-artist-test-1-.*\.png$/) },
        }));
    });

    it("never overwrites an image or manual override added during the lookup", async () => {
        mockArtistUpdateMany.mockResolvedValue({ count: 0 });
        expect(startArtistArtworkRecovery()).toBe(true);
        await drainJob();
        expect(getArtistArtworkRecoveryProgress().recovered).toBe(0);
        expect(mockRedisDel).not.toHaveBeenCalled();
    });

    it("leaves unresolved records and rejects non-HTTPS provider candidates", async () => {
        mockFindArtistArtwork.mockResolvedValue({ url: "http://untrusted.invalid/image.jpg", source: "deezer" });
        expect(startArtistArtworkRecovery()).toBe(true);
        await drainJob();
        expect(mockArtistUpdateMany).not.toHaveBeenCalled();
        expect(getArtistArtworkRecoveryProgress()).toMatchObject({
            missing: 1, recovered: 0, processed: 1,
        });
    });

    it("allows only one background recovery at a time", async () => {
        let release!: (value: { url: string; source: string } | null) => void;
        mockFindArtistArtwork.mockReturnValue(new Promise((resolve) => { release = resolve; }));
        expect(startArtistArtworkRecovery()).toBe(true);
        expect(startArtistArtworkRecovery()).toBe(false);
        // The caller's request isn't coupled to the job's completion.
        for (let i = 0; i < 10 && !release; i++) await Promise.resolve();
        expect(typeof release).toBe("function");
        release({ url: IMG, source: "deezer" });
        await drainJob();
        expect(mockFindArtistArtwork).toHaveBeenCalledTimes(1);
    });

    it("finishes and reports errors without losing its single-flight lock", async () => {
        mockFindMany.mockRejectedValueOnce(new Error("temporary database outage"));
        expect(startArtistArtworkRecovery()).toBe(true);
        await drainJob();
        expect(getArtistArtworkRecoveryProgress()).toMatchObject({
            inProgress: false, failed: 1, processed: 0,
        });
    });
});
