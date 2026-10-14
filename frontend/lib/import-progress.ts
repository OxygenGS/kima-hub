/**
 * Presentation-side reconciliation of the progress data received from the
 * Spotify import API / SSE cache. Do not modify job IDs or backend requests.
 *
 * Nullish fields preserve previous values, matching the former page logic.
 */
export interface ImportProgress {
    status: string;
    progress: number;
    albumsTotal: number;
    albumsCompleted: number;
    tracksMatched: number;
    createdPlaylistId: string | null;
    error: string | null;
}

export function mergeImportProgress<T extends ImportProgress>(
    current: T,
    received: Partial<T> & Pick<T, "status">,
): T {
    return {
        ...current,
        status: received.status,
        progress: received.progress ?? current.progress,
        albumsTotal: received.albumsTotal ?? current.albumsTotal,
        albumsCompleted: received.albumsCompleted ?? current.albumsCompleted,
        tracksMatched: received.tracksMatched ?? current.tracksMatched,
        createdPlaylistId: received.createdPlaylistId ?? current.createdPlaylistId,
        error: received.error ?? current.error,
    };
}

export function isTerminalImportStatus(status: string): boolean {
    return status === "completed" || status === "failed" || status === "cancelled";
}
