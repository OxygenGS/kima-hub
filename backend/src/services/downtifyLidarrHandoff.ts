/**
 * Strongly typed, fail-closed Lidarr handoff for a fully verified external
 * recording. Only Lidarr decides the managed Artist/Album/Track destination.
 *
 * A caller must persist a durable "submitting" intent BEFORE invoking submit.
 * A timed-out HTTP POST is ambiguous and MUST NOT be blindly resubmitted.
 */
import type { AxiosInstance } from "axios";

export type VerifiedLidarrSource = {
    /** One trusted, absolute file path as Lidarr sees the shared staging mount. */
    path: string;
    bytes: number;
    artist: string;
    album: string;
    title: string;
    durationMs: number;
};
export type LidarrMatch = {
    path: string;
    artistId: number;
    albumId: number;
    albumReleaseId: number;
    trackId: number;
    quality: Record<string, unknown>;
};
export type LidarrPreview =
    | { state: "matched"; match: LidarrMatch }
    | { state: "needs_review" | "invalid_source" | "unavailable" };

const integerId = (x: unknown): x is number =>
    Number.isSafeInteger(x) && Number(x) > 0;
const record = (x: unknown): x is Record<string, unknown> =>
    !!x && typeof x === "object" && !Array.isArray(x);
const label = (x: unknown): string | null =>
    typeof x === "string" && x.trim().length > 0 && x.length <= 300 &&
    !/[\u0000-\u001f\u007f]/.test(x) ? x.trim().normalize("NFKC").toLocaleLowerCase("en") : null;
export function safeLidarrStageFile(path: unknown): path is string {
    return typeof path === "string" && path.startsWith("/") &&
        path.length >= 20 && path.length <= 2048 &&
        !path.includes("\\") && !/[\u0000-\u001f\u007f]/.test(path) &&
        path.split("/").slice(1).every(x => x !== "." && x !== ".." && x !== "") &&
        /\.(mp3|flac|m4a|ogg|opus|wav)$/i.test(path);
}

/**
 * Lidarr's GET /api/v1/manualimport can suggest multiple recordings,
 * albums or editions. Every ambiguity is held for review. No guessed
 * artist, album, track or release identifier is ever sent to Lidarr.
 */
/**
 * ManualImport previews may reject a complete SINGLE recording because the
 * rest of its ALBUM is absent. Lidarr manual import can still copy that exact
 * track without asserting the complete release was downloaded. No other
 * rejection is advisory and no unverified recording gets this exception.
 */
function permittedSingleTrackRejections(value: unknown): boolean {
    if (!Array.isArray(value)) return false;
    if (value.length === 0) return true;
    return value.length === 1 && record(value[0]) &&
        value[0].reason === "Has missing tracks" &&
        value[0].type === "permanent";
}

export function validateLidarrPreview(
    raw: unknown, expected: VerifiedLidarrSource,
): LidarrPreview {
    if (!safeLidarrStageFile(expected.path) ||
        !Number.isSafeInteger(expected.bytes) || expected.bytes < 64 ||
        expected.bytes > 256 * 1024 * 1024 ||
        !label(expected.artist) || !label(expected.album) ||
        !label(expected.title) || !Number.isSafeInteger(expected.durationMs) ||
        expected.durationMs < 1000 || expected.durationMs > 8 * 60 * 60 * 1000) {
        return { state: "invalid_source" };
    }
    if (!Array.isArray(raw) || raw.length !== 1 || !record(raw[0])) {
        return { state: "needs_review" };
    }
    const item = raw[0];
    if (item.path !== expected.path || item.size !== expected.bytes ||
        !record(item.artist) || !record(item.album) ||
        !integerId(item.artist.id) || !integerId(item.album.id) ||
        item.album.artistId !== item.artist.id ||
        !integerId(item.albumReleaseId) ||
        !Array.isArray(item.tracks) || item.tracks.length !== 1 ||
        !record(item.tracks[0]) || !integerId(item.tracks[0].id) ||
        item.tracks[0].albumId !== item.album.id ||
        (item.tracks[0].artistId !== undefined &&
            item.tracks[0].artistId !== item.artist.id) ||
        !permittedSingleTrackRejections(item.rejections) ||
        item.additionalFile === true || item.replaceExistingFiles === true ||
        !record(item.quality) || !record(item.quality.quality) ||
        !label(item.artist.artistName) ||
        label(item.artist.artistName) !== label(expected.artist) ||
        label(item.album.title) !== label(expected.album) ||
        label(item.tracks[0].title) !== label(expected.title)) {
        return { state: "needs_review" };
    }
    // DO NOT round a different recording into a "good enough" album match.
    // Lidarr track.Duration is milliseconds (MusicBrainz source).
    const duration = item.tracks[0].duration;
    if (typeof duration !== "number" ||
        !Number.isFinite(duration) ||
        Math.abs(duration - expected.durationMs) > 4000) {
        return { state: "needs_review" };
    }
    return {
        state: "matched",
        match: {
            path: expected.path,
            artistId: item.artist.id as number,
            albumId: item.album.id as number,
            albumReleaseId: item.albumReleaseId as number,
            trackId: item.tracks[0].id as number,
            quality: item.quality,
        },
    };
}

/** Preview is always read-only and never asks Lidarr to replace media. */
export async function previewVerifiedLidarrImport(
    client: Pick<AxiosInstance, "get">, expected: VerifiedLidarrSource,
): Promise<LidarrPreview> {
    if (!safeLidarrStageFile(expected.path)) return { state: "invalid_source" };
    try {
        const result = await client.get("/api/v1/manualimport", {
            params: {
                folder: expected.path,
                filterExistingFiles: false,
                replaceExistingFiles: false,
            },
            timeout: 15000,
            maxRedirects: 0,
            proxy: false,
            maxContentLength: 3 * 1024 * 1024,
        });
        return validateLidarrPreview(result.data, expected);
    } catch {
        return { state: "unavailable" };
    }
}

export type LidarrSubmission =
    | { state: "accepted"; commandId: number }
    | { state: "unknown_outcome" };

/**
 * A non-repeatable, single-file *copy* request. Staged original remains in
 * place; no overwrite, delete, or direct Lidarr library modification.
 * The caller MUST have stored the immutable intent before invoking.
 */
export async function submitVerifiedLidarrImport(
    client: Pick<AxiosInstance, "post">, match: LidarrMatch,
): Promise<LidarrSubmission> {
    try {
        const response = await client.post("/api/v1/command", {
            name: "ManualImport",
            // Lidarr's documented wire value. Never rely on enum ordinals.
            importMode: "copy",
            replaceExistingFiles: false,
            files: [{
                path: match.path,
                artistId: match.artistId,
                albumId: match.albumId,
                albumReleaseId: match.albumReleaseId,
                trackIds: [match.trackId],
                quality: match.quality,
                // Lidarr mutates Album.AnyReleaseOk when this is true.
                // A third-party import must respect existing album settings.
                disableReleaseSwitching: false,
            }],
        }, {
            timeout: 30000, maxRedirects: 0, proxy: false,
        });
        if (!integerId(response.data?.id)) return { state: "unknown_outcome" };
        return { state: "accepted", commandId: response.data.id as number };
    } catch {
        // A timeout may occur AFTER Lidarr enqueued the command.
        // This is NEVER grounds for automatically sending a second POST.
        return { state: "unknown_outcome" };
    }
}
