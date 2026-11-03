/**
 * On-demand Smart Download Inbox proposals. This code deliberately performs
 * reads only; a folder name is evidence for review, never proof to auto-retag.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../utils/db";
import { artistIdentityKey } from "./artistIdentity";
import { safeStoredPath } from "./smartDownloadInbox";

type SuggestionStatus = "suggested" | "unavailable" | "no-match" | "conflict";
export type SuggestionEvidence =
    | "folder-artist" | "existing-library-artist"
    | "folder-album" | "same-title-duration";

export interface SmartImportSuggestion {
    status: SuggestionStatus;
    readOnly: true;
    current: {
        trackId: string;
        albumId: string;
        fileModified: string;
        fileSize: number;
        title: string;
        artist: string;
        album: string;
    } | null;
    proposedArtist: { id: string; name: string } | null;
    proposedAlbum: { id: string; title: string } | null;
    evidence: SuggestionEvidence[];
}

const IMPORT_ROOT = "Singles/Kima Downloads/";
const CANDIDATE_LIMIT = 12;
export type SuggestionDb = Pick<Prisma.TransactionClient, "downloadJob" | "track" | "artist" | "album">;
const UNKNOWN_ARTISTS = new Set(["unknown artist", "unknown", "various artists", "various", "v/a"]);
const UNKNOWN_ALBUMS = new Set(["unknown album", "unknown", "untitled", "singles", "compilation", "various artists"]);

function empty(status: Exclude<SuggestionStatus, "suggested">): SmartImportSuggestion {
    return { status, readOnly: true, current: null, proposedArtist: null, proposedAlbum: null, evidence: [] };
}

/**
 * Use only an unambiguous artist-prefix and a filename-derived title.
 * Never infer a new title from a different performer's credit.
 */
function titleFromImportPath(filePath: string, artistName: string): string | null {
    const filename = filePath.split("/").pop() ?? "";
    const withoutExt = filename.replace(/\.(flac|mp3|m4a|aac|ogg|opus|wav)$/i, "");
    let title = withoutExt.replace(/^\s*\d{1,3}\s*[._-]\s*/, "").trim();
    const separator = title.indexOf(" - ");
    if (separator > 0) {
        const credit = title.slice(0, separator);
        if (artistIdentityKey(credit) !== artistIdentityKey(artistName)) return null;
        title = title.slice(separator + 3).trim();
    }
    return title && !["unknown", "track", "untitled"].includes(title.toLowerCase()) ? title : null;
}

export async function getSmartImportSuggestion(
    userId: string,
    jobId: string,
    db: SuggestionDb = prisma,
): Promise<SmartImportSuggestion | null> {
    // 404 for both unknown and other-user jobs; never reveal their existence.
    const job = await db.downloadJob.findFirst({
        where: { id: jobId, userId, type: "soulseek-search", cleared: false },
        select: { status: true, metadata: true },
    });
    if (!job) return null;
    const filePath = safeStoredPath(job.metadata);
    if (job.status !== "completed" || !filePath) return empty("unavailable");

    // Exact index lookup; never guess the source file from its title.
    const imported = await db.track.findUnique({
        where: { filePath },
        select: {
            id: true, title: true, duration: true, fileModified: true, fileSize: true,
            missingSince: true, corrupt: true,
            album: { select: {
                id: true, title: true, location: true,
                artist: { select: { id: true, name: true } },
            } },
        },
    });
    if (!imported || imported.corrupt || imported.missingSince) return empty("unavailable");
    const current: SmartImportSuggestion["current"] = {
        trackId: imported.id,
        albumId: imported.album.id,
        fileModified: imported.fileModified.toISOString(),
        fileSize: imported.fileSize,
        title: imported.title,
        artist: imported.album.artist.name,
        album: imported.album.title,
    };
    const originalArtistKey = artistIdentityKey(current.artist);
    const placeholder = UNKNOWN_ARTISTS.has(current.artist.trim().toLowerCase());
    if (!placeholder && imported.album.location === "LIBRARY") {
        return { ...empty("unavailable"), current };
    }

    const fragments = filePath.slice(IMPORT_ROOT.length).split("/");
    const folderArtist = fragments[0];
    const folderAlbum = fragments[1];
    const folderArtistKey = artistIdentityKey(folderArtist);
    if (!folderArtistKey || UNKNOWN_ARTISTS.has(folderArtist.trim().toLowerCase())) {
        return { ...empty("no-match"), current };
    }
    // A known, *different* tagged artist is a conflict; do not promote
    // folder naming over explicit tag evidence.
    if (!placeholder && originalArtistKey !== folderArtistKey) {
        return { ...empty("conflict"), current };
    }

    const artist = await db.artist.findFirst({
        where: {
            identityKey: folderArtistKey,
            albums: { some: {
                location: "LIBRARY",
                tracks: { some: { missingSince: null, corrupt: false } },
            } },
        },
        select: { id: true, name: true },
    });
    if (!artist || UNKNOWN_ARTISTS.has(artist.name.trim().toLowerCase())) {
        return { ...empty("no-match"), current };
    }

    const evidence: SuggestionEvidence[] = ["folder-artist", "existing-library-artist"];
    let album: { id: string; title: string } | null = null;

    // An exact, non-generic album folder can suggest an existing album for
    // this artist. It does NOT prove that the imported audio belongs there.
    if (folderAlbum && !UNKNOWN_ALBUMS.has(folderAlbum.trim().toLowerCase())) {
        const albums = await db.album.findMany({
            where: {
                artistId: artist.id, location: "LIBRARY",
                title: { equals: folderAlbum, mode: "insensitive" },
                tracks: { some: { missingSince: null, corrupt: false } },
            },
            select: { id: true, title: true },
            take: 2,
        });
        if (albums.length === 1) {
            album = albums[0];
            evidence.push("folder-album");
        }
    } else {
        // When the import says Unknown Album, a UNIQUE local track with an
        // exact title AND compatible duration may suggest its existing album.
        // Never choose the first match from two releases, unknown lengths,
        // or a truncated candidate set.
        const title = titleFromImportPath(filePath, folderArtist);
        if (title && imported.duration > 0) {
            const peers = await db.track.findMany({
                where: {
                    album: { artistId: artist.id, location: "LIBRARY" },
                    missingSince: null, corrupt: false,
                    filePath: { not: filePath },
                    OR: [
                        { title: { equals: title, mode: "insensitive" } },
                        { displayTitle: { equals: title, mode: "insensitive" } },
                    ],
                },
                select: {
                    title: true, displayTitle: true, duration: true,
                    album: { select: { id: true, title: true } },
                },
                take: CANDIDATE_LIMIT,
            });
            const exact = (a: string | null, b: string) =>
                typeof a === "string" && a.normalize("NFKC").trim().toLowerCase() === b.normalize("NFKC").trim().toLowerCase();
            const matches = peers.filter((peer) =>
                (exact(peer.title, title) || exact(peer.displayTitle, title)) &&
                peer.duration > 0 && Math.abs(peer.duration - imported.duration) <= 5
            );
            const releaseIds = new Set(matches.map((peer) => peer.album.id));
            if (peers.length < CANDIDATE_LIMIT && releaseIds.size === 1) {
                album = matches[0].album;
                evidence.push("same-title-duration");
            }
        }
    }

    return {
        status: "suggested", readOnly: true, current,
        proposedArtist: { id: artist.id, name: artist.name },
        proposedAlbum: album,
        evidence,
    };
}
