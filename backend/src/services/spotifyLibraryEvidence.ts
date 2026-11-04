/**
 * v1.18.0: read-only evidence of a locally indexed, physically present
 * Spotify recording. A similar title/artist is NEVER sufficient.
 *
 * An exact ISRC reported by the existing Spotify metadata service is
 * cross-checked against local LIBRARY tracks, compatible duration, and
 * a regular file physically present under the configured music root.
 * This proves an on-disk *recording match*, not the same release/master,
 * a playable audio decode, or a completed album/playlist.
 *
 * No downloads, file writes, scanning, metadata enrichment or DB mutations.
 */
import { promises as fs } from "fs";
import * as path from "path";
import { config } from "../config";
import { prisma } from "../utils/db";
import { spotifyService } from "./spotify";
import { parseSpotifyDownloadLink } from "./spotifyLinkIntake";

export type SpotifyLibraryEvidenceStatus =
    | "recording_match_on_disk"
    | "catalog_recording_unverified"
    | "no_verified_match"
    | "metadata_unavailable"
    | "identity_unavailable"
    | "not_supported";

export interface SpotifyLibraryEvidence {
    provider: "spotify";
    kind: "track" | "album" | "playlist";
    status: SpotifyLibraryEvidenceStatus;
    evidence: "isrc_duration_and_file" | "not_proven";
    recordingMatch: boolean;
    audioDecoded: false;
    albumEditionVerified: false;
    /** A nullable Kima ID, never a source filesystem path. */
    matchedTrackId: string | null;
    /** This check never creates or changes a DownloadJob. */
    downloadStarted: false;
}

interface LocalCandidate {
    id: string;
    filePath: string;
    duration: number;
    fileSize: number;
}

interface SpotifyIdentity {
    spotifyId: string;
    isrc: string | null;
    durationMs: number;
}

type EvidenceDeps = {
    retrieve: (spotifyId: string) => Promise<SpotifyIdentity | null>;
    find: (isrc: string) => Promise<LocalCandidate[]>;
    verify: (filePath: string) => Promise<boolean>;
};

const CANDIDATE_LIMIT = 25;
const MAX_DURATION_DRIFT_MS = 4000;
const ISRC = /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/;

type FileAccess = {
    realpath: (filePath: string) => Promise<string>;
    stat: (filePath: string) => Promise<{ isFile: () => boolean; size: number }>;
};

/**
 * Only test a scanner-owned path relative to MUSIC_PATH. Deny absolute paths,
 * traversal, NUL bytes, symlink escape and non-regular/empty files.
 * A successful stat is not an audio decode and is not cached.
 */
export async function verifyIndexedMusicFile(
    storedPath: string,
    root: string,
    access: FileAccess = fs,
): Promise<boolean> {
    if (typeof storedPath !== "string" || !storedPath || !root ||
        path.isAbsolute(storedPath) || storedPath.includes("\\") ||
        storedPath.includes("\0") ||
        storedPath.split("/").some(part => !part || part === "." || part === "..")) {
        return false;
    }

    try {
        const rootReal = await access.realpath(root);
        const resolvedFile = await access.realpath(path.resolve(rootReal, storedPath));
        const relative = path.relative(rootReal, resolvedFile);
        if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) ||
            path.isAbsolute(relative)) {
            return false;
        }
        const stat = await access.stat(resolvedFile);
        return stat.isFile() && Number.isFinite(stat.size) && stat.size > 0;
    } catch {
        // An absent volume or unresolved symlink must never become a match.
        return false;
    }
}

const defaultDeps: EvidenceDeps = {
    retrieve: (id) => spotifyService.getTrackBySpotifyId(id),
    find: (isrc) => prisma.track.findMany({
        where: {
            isrc: { equals: isrc, mode: "insensitive" },
            missingSince: null,
            corrupt: false,
            album: { location: "LIBRARY" },
        },
        select: { id: true, filePath: true, duration: true, fileSize: true },
        take: CANDIDATE_LIMIT,
    }),
    verify: (filePath) => verifyIndexedMusicFile(filePath, config.music.musicPath),
};

function outcome(
    kind: SpotifyLibraryEvidence["kind"],
    status: SpotifyLibraryEvidenceStatus,
    trackId: string | null = null,
): SpotifyLibraryEvidence {
    const confirmed = status === "recording_match_on_disk";
    return {
        provider: "spotify", kind, status,
        evidence: confirmed ? "isrc_duration_and_file" : "not_proven",
        recordingMatch: confirmed,
        audioDecoded: false,
        albumEditionVerified: false,
        matchedTrackId: confirmed ? trackId : null,
        downloadStarted: false,
    };
}

/**
 * May make one authorized, bounded request to Spotify's existing metadata
 * provider. This MUST NOT run automatically while a user is typing/polling.
 * An unavailable or incomplete source is unknown, never "not in library".
 */
export async function checkSpotifyLibraryEvidence(
    link: unknown,
    deps: EvidenceDeps = defaultDeps,
): Promise<SpotifyLibraryEvidence | null> {
    const parsed = parseSpotifyDownloadLink(link);
    if (!parsed) return null;

    if (parsed.kind !== "track") return outcome(parsed.kind, "not_supported");
    const id = parsed.intentKey.split(":")[2];

    const spotify = await deps.retrieve(id);
    if (!spotify) return outcome("track", "metadata_unavailable");
    if (spotify.spotifyId !== id) return outcome("track", "identity_unavailable");

    const isrc = typeof spotify.isrc === "string" ? spotify.isrc.trim().toUpperCase() : "";
    if (!ISRC.test(isrc) || !Number.isSafeInteger(spotify.durationMs) ||
        spotify.durationMs < 1000) {
        return outcome("track", "identity_unavailable");
    }

    const candidates = await deps.find(isrc);
    if (candidates.length === 0) return outcome("track", "no_verified_match");

    for (const candidate of candidates.slice(0, CANDIDATE_LIMIT)) {
        if (!candidate.id || !Number.isFinite(candidate.duration) || candidate.duration <= 0 ||
            !Number.isFinite(candidate.fileSize) || candidate.fileSize <= 0 ||
            Math.abs(candidate.duration * 1000 - spotify.durationMs) > MAX_DURATION_DRIFT_MS) {
            continue;
        }
        if (await deps.verify(candidate.filePath)) {
            return outcome("track", "recording_match_on_disk", candidate.id);
        }
    }
    // A matching catalog ISRC alone is not evidence of a present file.
    return outcome("track", "catalog_recording_unverified");
}
