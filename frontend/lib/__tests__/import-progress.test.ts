import { describe, expect, it } from "vitest";
import { isTerminalImportStatus, mergeImportProgress } from "../import-progress";

const current = {
    id: "job-a",
    status: "downloading",
    progress: 31,
    albumsTotal: 8,
    albumsCompleted: 3,
    tracksMatched: 6,
    tracksTotal: 20,
    tracksDownloadable: 14,
    createdPlaylistId: null,
    error: null,
};

describe("Spotify playlist import progress", () => {
    it("updates partial SSE progress without losing fields absent in the event", () => {
        const next = mergeImportProgress(current, {
            status: "scanning",
            progress: 72,
            albumsCompleted: 7,
        });
        expect(next).toEqual({
            ...current,
            status: "scanning",
            progress: 72,
            albumsCompleted: 7,
        });
        expect(current.status).toBe("downloading");
    });

    it("retains prior values when SSE fields are nullish", () => {
        const next = mergeImportProgress(current, {
            status: "downloading",
            progress: undefined,
            createdPlaylistId: null,
        });
        expect(next.progress).toBe(31);
        expect(next.createdPlaylistId).toBeNull();
    });

    it("preserves the job identity on completion and cancellation", () => {
        const complete = mergeImportProgress(current, {
            status: "completed", progress: 100, createdPlaylistId: "playlist-b",
        });
        expect(complete.id).toBe("job-a");
        expect(complete.createdPlaylistId).toBe("playlist-b");
        expect(isTerminalImportStatus(complete.status)).toBe(true);
        expect(isTerminalImportStatus("cancelled")).toBe(true);
        expect(isTerminalImportStatus("failed")).toBe(true);
        expect(isTerminalImportStatus("downloading")).toBe(false);
    });

    it("keeps the backend error when a job fails", () => {
        const failed = mergeImportProgress(current, {
            status: "failed", error: "Indexer unavailable",
        });
        expect(failed.error).toBe("Indexer unavailable");
        expect(failed.tracksTotal).toBe(20);
    });
});
