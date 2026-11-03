jest.mock("../../utils/db", () => ({
    prisma: {
        downloadJob: { count: jest.fn(), findMany: jest.fn() },
        track: { findMany: jest.fn() },
    },
}));

import { prisma } from "../../utils/db";
import { getSmartDownloadInbox } from "../smartDownloadInbox";

const count = prisma.downloadJob.count as jest.Mock;
const jobs = prisma.downloadJob.findMany as jest.Mock;
const findTracks = prisma.track.findMany as jest.Mock;

const job = (id: string, status: string, filePath?: unknown) => ({
    id, subject: "Artist - Song", status,
    metadata: filePath === undefined ? null : { importRelativePath: filePath },
    createdAt: new Date("2026-11-03T10:00:00.000Z"),
});
const imported = (filePath: string, artist: string, location = "LIBRARY") => ({
    id: "track-" + artist, filePath, missingSince: null, corrupt: false,
    album: { title: "Album", location, artist: { name: artist } },
});
const folder = "Singles/Kima Downloads/Artist/Album/Song.flac";

beforeEach(() => {
    jest.resetAllMocks();
    count.mockResolvedValue(1);
    jobs.mockResolvedValue([job("j1", "completed", folder)]);
    findTracks.mockResolvedValue([imported(folder, "Artist")]);
});

describe("Smart Download Inbox", () => {
    it("restricts both queries to the caller and limits results to 25", async () => {
        const result = await getSmartDownloadInbox("listener-1");
        expect(count).toHaveBeenCalledWith({
            where: { userId: "listener-1", type: "soulseek-search", cleared: false },
        });
        expect(jobs).toHaveBeenCalledWith(expect.objectContaining({
            where: { userId: "listener-1", type: "soulseek-search", cleared: false },
            take: 25, orderBy: { createdAt: "desc" },
        }));
        expect(result).toMatchObject({
            total: 1, displayed: 1, limit: 25,
            items: [{ id: "j1", stage: "indexed", reason: "indexed", filePath: folder }],
        });
        expect(findTracks).toHaveBeenCalledWith(expect.objectContaining({
            where: { filePath: { in: [folder] } },
            take: 25,
        }));
    });

    it("does not mark a completed transfer indexed without exact scan evidence", async () => {
        findTracks.mockResolvedValue([]);
        const result = await getSmartDownloadInbox("listener");
        expect(result.items[0]).toMatchObject({ stage: "awaiting-index", reason: "not-indexed", track: null });
    });

    it("does not infer paths for older jobs or trust paths outside the dedicated folder", async () => {
        jobs.mockResolvedValue([
            job("legacy", "completed"), job("unsafe", "completed", "../music/secret.flac"),
            job("traversal", "completed", "Singles/Kima Downloads/../other/file.flac"),
        ]);
        const result = await getSmartDownloadInbox("listener");
        expect(result.items.map((item) => item.stage)).toEqual(["unverified", "unverified", "unverified"]);
        expect(result.items.every((item) => item.filePath === null)).toBe(true);
        expect(findTracks).not.toHaveBeenCalled();
    });

    it("separates artist metadata review, corrupt, missing and successful indexing", async () => {
        const one = "Singles/Kima Downloads/Artist/Album/One.flac";
        const two = "Singles/Kima Downloads/Artist/Album/Two.flac";
        const three = "Singles/Kima Downloads/Artist/Album/Three.flac";
        const four = "Singles/Kima Downloads/Artist/Album/Four.flac";
        jobs.mockResolvedValue([
            job("review", "completed", one),
            job("discovery", "completed", two),
            job("missing", "completed", three),
            job("corrupt", "completed", four),
            job("failed", "failed", one),
            job("active", "processing", two),
        ]);
        findTracks.mockResolvedValue([
            imported(one, "Unknown Artist"),
            imported(two, "Artist", "DISCOVER"),
            { ...imported(three, "Artist"), missingSince: new Date() },
            { ...imported(four, "Artist"), corrupt: true },
        ]);
        const result = await getSmartDownloadInbox("listener");
        expect(result.items.map((item) => item.stage)).toEqual([
            "review", "review", "unavailable", "unavailable", "failed", "active",
        ]);
        expect(result.items.map((item) => item.reason)).toEqual([
            "unknown-artist", "discovery-album", "missing-file", "corrupt-file",
            "download-failed", "in-progress",
        ]);
    });

    it("propagates a database outage instead of presenting fabricated success", async () => {
        count.mockRejectedValue(new Error("Database offline"));
        await expect(getSmartDownloadInbox("listener")).rejects.toThrow("Database offline");
    });
});
