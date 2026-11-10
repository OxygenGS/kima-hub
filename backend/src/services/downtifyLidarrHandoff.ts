/**
 * Pure, fail-closed decision boundary for a future Lidarr-owned import.
 *
 * A valid Kima audio file is NOT automatically a Lidarr artist/album/track.
 * Lidarr's own read-only manual-import candidates must uniquely identify
 * the exact tagged recording before any write-capable Lidarr command.
 *
 * No HTTP, DB, disk write, path construction or implicit artist creation.
 * A separate staging / ownership component supplies the verified input.
 */
export type LidarrMatchState =
    | "matched" | "metadata_missing" | "not_found" | "ambiguous"
    | "rejected" | "metadata_mismatch" | "unsafe_source";

export type VerifiedLidarrSource = {
    /** Absolute path already established by an independent staging proof. */
    path: string;
    bytes: number;
    sha256: string;
    artist: string;
    album: string;
    title: string;
    /** Optional independent MusicBrainz artist/release IDs from audio tags. */
    musicbrainzArtistId?: string;
    musicbrainzReleaseId?: string;
};

export type LidarrManualImportCandidate = {
    path?: unknown;
    size?: unknown;
    artist?: unknown;
    album?: unknown;
    albumReleaseId?: unknown;
    tracks?: unknown;
    rejections?: unknown;
    replaceExistingFiles?: unknown;
    additionalFile?: unknown;
};

export type LidarrMatch =
    | { state: "matched"; match: {
        path: string; artistId: number; albumId: number;
        albumReleaseId: number; trackIds: [number];
    } }
    | { state: Exclude<LidarrMatchState, "matched"> };

type Dict = Record<string, unknown>;
const SHA = /^[0-9a-f]{64}$/;
const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dict = (o: unknown): o is Dict =>
    o !== null && typeof o === "object" && !Array.isArray(o);
const id = (n: unknown): n is number =>
    typeof n === "number" && Number.isSafeInteger(n) && n > 0;
const normalized = (s: unknown): string | null => {
    if (typeof s !== "string" || !s.trim() || s.length > 350 ||
        /[\u0000-\u001f\u007f]/.test(s)) return null;
    return s.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en");
};

/** Choose one exact, non-rejected MusicBrainz release/track candidate.
 * Caller must enforce read-only Lidarr API, correct linked host, and a
 * shared staging mount; a match here is NOT permission to send a command.
 */
export function selectVerifiedLidarrImport(
    source: VerifiedLidarrSource,
    candidates: unknown,
): LidarrMatch {
    if (!source || typeof source.path !== "string" ||
        !source.path.startsWith("/") || source.path === "/" ||
        source.path.includes("\\") || source.path.includes("\0") ||
        source.path.split("/").some(part => part === ".." || part === ".") ||
        !Number.isSafeInteger(source.bytes) || source.bytes < 64 ||
        !SHA.test(source.sha256)) return { state: "unsafe_source" };
    const artist = normalized(source.artist);
    const album = normalized(source.album);
    const title = normalized(source.title);
    if (!artist || !album || !title ||
        (source.musicbrainzArtistId !== undefined &&
            !MBID.test(source.musicbrainzArtistId)) ||
        (source.musicbrainzReleaseId !== undefined &&
            !MBID.test(source.musicbrainzReleaseId))) {
        return { state: "metadata_missing" };
    }
    if (!Array.isArray(candidates) || candidates.length > 1000) {
        return { state: "unsafe_source" };
    }
    const sameFile = candidates.filter(c =>
        dict(c) && c.path === source.path
    );
    if (!sameFile.length) return { state: "not_found" };
    if (sameFile.length !== 1) return { state: "ambiguous" };
    const candidate = sameFile[0] as Dict;
    if (candidate.replaceExistingFiles !== false ||
        candidate.additionalFile === true ||
        !Array.isArray(candidate.rejections) ||
        candidate.rejections.length > 0) return { state: "rejected" };
    if (!id(candidate.size) || candidate.size !== source.bytes ||
        !dict(candidate.artist) || !dict(candidate.album) ||
        !id(candidate.artist.id) || !id(candidate.album.id) ||
        !id(candidate.albumReleaseId) ||
        !Array.isArray(candidate.tracks) || candidate.tracks.length !== 1 ||
        !dict(candidate.tracks[0]) || !id(candidate.tracks[0].id)) {
        return { state: "metadata_mismatch" };
    }
    const a = candidate.artist;
    const release = candidate.album;
    const track = candidate.tracks[0] as Dict;
    if (normalized(a.artistName) !== artist ||
        normalized(release.title) !== album ||
        normalized(track.title) !== title ||
        (id(release.artistId) && release.artistId !== a.id) ||
        (id(track.artistId) && track.artistId !== a.id) ||
        (id(track.albumId) && track.albumId !== release.id) ||
        (source.musicbrainzArtistId !== undefined &&
            normalized(a.foreignArtistId) !==
                source.musicbrainzArtistId.toLowerCase()) ||
        (source.musicbrainzReleaseId !== undefined &&
            normalized(release.foreignAlbumId) !==
                source.musicbrainzReleaseId.toLowerCase())) {
        return { state: "metadata_mismatch" };
    }
    return {
        state: "matched",
        match: {
            path: source.path,
            artistId: a.id,
            albumId: release.id,
            albumReleaseId: candidate.albumReleaseId as number,
            trackIds: [track.id as number],
        },
    };
}
