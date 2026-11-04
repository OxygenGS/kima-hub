const mockCount = jest.fn();
const mockFindMany = jest.fn();
jest.mock("../../utils/db", () => ({
    prisma: {
        downloadJob: {
            count: (...args: unknown[]) => mockCount(...args),
            findMany: (...args: unknown[]) => mockFindMany(...args),
        },
    },
}));

import { getUnifiedDownloadOverview } from "../unifiedDownloadOverview";

const date = new Date("2026-11-04T10:00:00.000Z");
const row = (values: Record<string, unknown> = {}) => ({
    id: "owned-job-1",
    subject: "Artist - Single",
    type: "soulseek-search",
    status: "completed",
    createdAt: date,
    updatedAt: date,
    completedAt: date,
    ...values,
});

beforeEach(() => {
    mockCount.mockReset().mockResolvedValue(1);
    mockFindMany.mockReset().mockResolvedValue([row()]);
});

describe("user-scoped Unified Download Manager feed", () => {
    it("selects only the caller's non-cleared jobs even for admins", async () => {
        const result = await getUnifiedDownloadOverview("user-A", 25, 10);
        expect(mockCount).toHaveBeenCalledWith({ where: { userId: "user-A", cleared: false } });
        expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { userId: "user-A", cleared: false },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 25, skip: 10,
            select: {
                id: true, subject: true, type: true, status: true,
                createdAt: true, updatedAt: true, completedAt: true,
            },
        }));
        expect(result.items[0]).toMatchObject({
            id: "owned-job-1", engine: "soulseek", phase: "downloaded",
            libraryVerification: "not_checked", progress: null,
        });
        expect(result.downtifyJobsIncluded).toBe(false);
    });

    it("never returns metadata, token-bearing paths, peer addresses or raw error strings", async () => {
        mockFindMany.mockResolvedValue([row({
            metadata: { apiKey: "example-private-key", importRelativePath: "Private/Music" },
            error: "source=http://secret.example/api?token=example-private-key",
            sourceUrl: "http://secret.example",
            userId: "user-B",
        })]);
        const result = await getUnifiedDownloadOverview("user-A");
        const json = JSON.stringify(result);
        expect(json).not.toContain("example-private-key");
        expect(json).not.toContain("secret.example");
        expect(json).not.toContain("importRelativePath");
        expect(json).not.toContain("user-B");
    });

    it("distinguishes a completed transfer from a verified indexed track", async () => {
        const result = await getUnifiedDownloadOverview("user-A");
        expect(result.items[0].phase).toBe("downloaded");
        expect(result.items[0].libraryVerification).toBe("not_checked");
        expect(result.items[0].progress).toBeNull();
        expect(result.pageCounts.downloaded).toBe(1);
        expect(result.items[0]).not.toHaveProperty("indexed");
        expect(result.items[0]).not.toHaveProperty("filePath");
    });

    it("normalizes known engines and unrecognized types/states conservatively", async () => {
        mockCount.mockResolvedValue(6);
        mockFindMany.mockResolvedValue([
            row({ id: "1", type: "soulseek-search", status: "pending" }),
            row({ id: "2", type: "album", status: "processing" }),
            row({ id: "3", type: "artist", status: "failed" }),
            row({ id: "4", type: "playlist", status: "whatever-new-status" }),
            row({ id: "5", type: "soulseek-search", status: "exhausted" }),
            row({ id: "6", type: "album", status: "cancelled" }),
        ]);
        const result = await getUnifiedDownloadOverview("user-A");
        expect(result.items.map(i => [i.engine, i.phase])).toEqual([
            ["soulseek", "queued"],
            ["lidarr", "processing"],
            ["lidarr", "failed"],
            ["unknown", "unknown"],
            ["soulseek", "failed"],
            ["lidarr", "cancelled"],
        ]);
        expect(result.pageCounts).toEqual({
            queued: 1, processing: 1, downloaded: 0,
            failed: 2, cancelled: 1, unknown: 1,
        });
    });

    it("reports bounded, page-scoped results without claiming a global percentage", async () => {
        mockCount.mockResolvedValue(120);
        mockFindMany.mockResolvedValue([row({ id: "page-job" })]);
        const result = await getUnifiedDownloadOverview("user-A", 50, 50);
        expect(result).toMatchObject({
            total: 120, displayed: 1, limit: 50, offset: 50, hasMore: true,
            downtifyJobsIncluded: false,
        });
    });

    it.each([
        ["", 50, 0], ["user", 0, 0], ["user", 101, 0],
        ["user", 50, -1], ["user", 50, 1001],
        ["user", 0.5, 0], ["user", 50, Number.NaN],
    ])("rejects invalid callers and pagination without querying the DB: %p %p %p", async (user, limit, offset) => {
        await expect(getUnifiedDownloadOverview(user as string, limit as number, offset as number)).rejects.toThrow("Invalid unified download query");
        expect(mockCount).not.toHaveBeenCalled();
        expect(mockFindMany).not.toHaveBeenCalled();
    });
});
