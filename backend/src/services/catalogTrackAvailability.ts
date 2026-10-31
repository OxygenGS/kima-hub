/**
 * MusicBrainz album pages must reflect independently playable local tracks.
 * A Soulseek single can be indexed under its own (different) album tags.
 * Only the UI representation is joined: files and canonical album IDs stay put.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../utils/db";
import { artistIdentityKey, isMbid } from "./artistIdentity";
import { recordingAgrees } from "./recordingMatch";
import { NOT_MISSING } from "../utils/libraryEligibility";
import { LIBRARY_LOCATION } from "./libraryFilters";

export interface CatalogTrack {
    id: string;
    title: string;
    duration: number;
    trackNo?: number;
    recordingMbid?: string | null;
    isAvailable?: boolean;
    [key: string]: unknown;
}

export interface LocalCandidate {
    id: string;
    title: string;
    displayTitle: string | null;
    filePath?: string;
    duration: number;
    recordingMbid: string | null;
    album: {
        id: string;
        title: string;
        coverUrl: string | null;
        rgMbid: string;
        artist: { id: string; name: string; mbid?: string | null };
    };
}

export interface CatalogWithAvailability {
    tracks: CatalogTrack[];
    artist: { name: string; mbid?: string | null };
    title: string;
    rgMbid?: string | null;
    owned?: boolean;
}

const IMPORT_ROOT = "Singles/Kima Downloads/";
const GENERIC_ARTIST_KEYS = new Set([
    "unknownartist", "variousartists", "various", "unknown", "compilation",
]);

function relativeParts(filePath?: string): string[] {
    return filePath ? filePath.replace(/\\/g, "/").split("/") : [];
}

/** Only use literal artist-directory variants; no fuzzy performer identities. */
function artistPathAliases(name: string): string[] {
    if (!name || GENERIC_ARTIST_KEYS.has(artistIdentityKey(name))) return [];
    const values = [name, name.replace(/\band\b/gi, "&"), name.replace(/&/g, "and")];
    return [...new Set(values.map(a => a.trim()))].filter(
        a => a.length <= 180 && a.length > 0 &&
            !a.includes("/") && !a.includes("\\") &&
            ![...a].some(ch => ch.charCodeAt(0) < 32),
    );
}

function importArtistPrefixes(name: string): string[] {
    return artistPathAliases(name).map(a => IMPORT_ROOT + a + "/");
}

/** Extract a credited performer and title from strongly structured filenames:
 * "01. Tones And I - Dance Monkey" and
 * "Tones and I_The Kids Are Coming_02_Dance Monkey".
 */
function creditedFilenameTitle(text: string, expectedArtist: string): string | null {
    const stem = text.replace(/\.(?:flac|mp3|m4a|aac|ogg|opus|wav|wma|ape|wv)$/i, "");
    const trimmed = stem.replace(/^\s*\d{1,3}\s*[._-]\s*/, "").trim();
    const fromArtistAlbumTrack = trimmed.match(/^(.+?)_(.+?)_(\d{1,3})_(.+)$/);
    if (fromArtistAlbumTrack &&
        artistIdentityKey(fromArtistAlbumTrack[1]) === artistIdentityKey(expectedArtist)) {
        return fromArtistAlbumTrack[4].trim();
    }
    const fromArtistTrack = trimmed.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (fromArtistTrack &&
        artistIdentityKey(fromArtistTrack[1]) === artistIdentityKey(expectedArtist)) {
        return fromArtistTrack[2].trim();
    }
    return null;
}

type PathEvidence = { filenameTitle: string | null; source: "artist-folder" | "import-folder" | "import-credited-filename" };

/** Artist proof comes only from an exact artist folder or an explicit,
 * structured "Artist - Title" filename under Kima's dedicated import root.
 * A compilation folder name is never treated as the performing artist.
 */
function pathArtistEvidence(candidate: LocalCandidate, expectedArtist: string): PathEvidence | null {
    const parts = relativeParts(candidate.filePath);
    if (parts.length < 2) return null;
    const filename = parts[parts.length - 1] || "";
    const filenameTitle = creditedFilenameTitle(filename, expectedArtist);
    const isImport = parts.length >= 4 &&
        parts[0].toLowerCase() === "singles" &&
        parts[1].toLowerCase() === "kima downloads";
    const expected = artistIdentityKey(expectedArtist);
    if (isImport) {
        const folder = parts[2] || "";
        if (expected && artistIdentityKey(folder) === expected) {
            return { source: "import-folder", filenameTitle };
        }
        if (filenameTitle) return { source: "import-credited-filename", filenameTitle };
        return null;
    }
    if (expected && artistIdentityKey(parts[0]) === expected) {
        return { source: "artist-folder", filenameTitle };
    }
    return null;
}

function isGenericOrDerivedCompilationArtist(candidate: LocalCandidate, evidence: PathEvidence): boolean {
    const embedded = candidate.album.artist.name.trim();
    if (GENERIC_ARTIST_KEYS.has(artistIdentityKey(embedded))) return true;
    if (evidence.source !== "import-credited-filename" || isMbid(candidate.album.artist.mbid)) return false;
    const folder = relativeParts(candidate.filePath)[2] || "";
    // The scanner can mistake the numeric compilation folder "87 [2019]"
    // for a performer if the peer's file contains no artist tags.
    return /^\d{1,3}\s*\[\d{4}\]$/.test(folder) &&
        artistIdentityKey(embedded) === artistIdentityKey(folder);
}

/** Never overwrite another explicitly identified artist or MusicBrainz artist. */
function candidateArtist(candidate: LocalCandidate, expectedArtist: string): string {
    const embedded = candidate.album.artist.name;
    const evidence = pathArtistEvidence(candidate, expectedArtist);
    return evidence && isGenericOrDerivedCompilationArtist(candidate, evidence)
        ? expectedArtist : embedded;
}

function candidateTitle(candidate: LocalCandidate, expectedArtist: string): string {
    const original = candidate.displayTitle || candidate.title;
    const evidence = pathArtistEvidence(candidate, expectedArtist);
    if (!evidence) return original;

    // If the scanner used the whole filename as the title, use its artist-
    // verified recording name. Explicit title tags ("Dance Monkey (Live)")
    // take precedence even if the peer's filename says otherwise.
    const filename = relativeParts(candidate.filePath).at(-1) || "";
    const stem = filename.replace(/\.(?:flac|mp3|m4a|aac|ogg|opus|wav|wma|ape|wv)$/i, "");
    if (evidence.filenameTitle && original.trim().toLowerCase() === stem.trim().toLowerCase()) {
        return evidence.filenameTitle;
    }
    const fromRaw = creditedFilenameTitle(original, expectedArtist);
    if (fromRaw) return fromRaw;
    return original.replace(/^\s*\d{1,3}[\s._-]+/, "").trim() || original;
}

function sameRecording(a: string | null | undefined, b: string | null): boolean {
    return !!a && !!b && isMbid(a) && isMbid(b) && a.toLowerCase() === b.toLowerCase();
}

/** Pure, conservative matching. A local file can satisfy at most one row. */
export function matchCatalogTracks(
    catalog: readonly CatalogTrack[],
    available: readonly LocalCandidate[],
    artistName: string,
    releaseGroupId?: string | null,
    artistMbid?: string | null,
): CatalogTrack[] {
    const claimed = new Set<string>();
    return catalog.map((entry) => {
        const matches = available.filter((candidate) => {
            if (claimed.has(candidate.id)) return false;
            // A valid, conflicting artist MBID always wins over folder text.
            if (artistMbid && isMbid(artistMbid) &&
                isMbid(candidate.album.artist.mbid) &&
                candidate.album.artist.mbid.toLowerCase() !== artistMbid.toLowerCase()) return false;
            if (entry.recordingMbid && candidate.recordingMbid &&
                !sameRecording(entry.recordingMbid, candidate.recordingMbid)) return false;
            if (sameRecording(entry.recordingMbid, candidate.recordingMbid)) return true;
            return recordingAgrees({
                id: candidate.id,
                title: candidateTitle(candidate, artistName),
                lengthMs: candidate.duration > 0 ? candidate.duration * 1000 : null,
                artists: [candidateArtist(candidate, artistName)],
            }, {
                title: entry.title,
                durationSec: entry.duration > 0 ? entry.duration : null,
                artists: [artistName],
            });
        });
        if (matches.length === 0) return { ...entry, isAvailable: false };
        const rank = (candidate: LocalCandidate): number => {
            const recording = sameRecording(entry.recordingMbid, candidate.recordingMbid) ? 100 : 0;
            const album = releaseGroupId && candidate.album.rgMbid.toLowerCase() === releaseGroupId.toLowerCase() ? 20 : 0;
            const duration = entry.duration > 0 && candidate.duration > 0
                ? Math.max(0, 5 - Math.abs(entry.duration - candidate.duration)) : 0;
            const taggedArtist = artistIdentityKey(candidate.album.artist.name) === artistIdentityKey(artistName) ? 10 : 0;
            return recording + album + taggedArtist + duration;
        };
        matches.sort((a, b) => rank(b) - rank(a) || a.id.localeCompare(b.id));
        const found = matches[0];
        claimed.add(found.id);
        return {
            ...entry,
            id: found.id,
            isAvailable: true,
            duration: found.duration > 0 ? found.duration : entry.duration,
            album: { id: found.album.id, title: found.album.title, coverArt: found.album.coverUrl },
            artist: { id: found.album.artist.id, name: found.album.artist.name },
        };
    });
}

/** Reconcile on *every request*, even when the MusicBrainz catalog was cached. */
export async function withLocalTrackAvailability(
    catalog: CatalogWithAvailability,
): Promise<CatalogWithAvailability & { availableTrackCount: number }> {
    const tracks = Array.isArray(catalog.tracks) ? catalog.tracks : [];
    if (!tracks.length || tracks.length > 120 || !catalog.artist?.name) {
        return { ...catalog, availableTrackCount: 0 };
    }
    const identityKey = artistIdentityKey(catalog.artist.name);
    if (!identityKey) return { ...catalog, availableTrackCount: 0 };
    const artistMbid = isMbid(catalog.artist.mbid) ? catalog.artist.mbid : null;
    const artists = await prisma.artist.findMany({
        where: { OR: [{ identityKey }, ...(artistMbid ? [{ mbid: artistMbid }] : [])] },
        select: { id: true, mbid: true },
        take: 8,
    });
    // An identified but *different* artist must not be silently merged.
    const artistIds = artists
        .filter((a) => !artistMbid || !a.mbid || a.mbid.toLowerCase() === artistMbid.toLowerCase())
        .map((a) => a.id);
    // A track imported through the UI can be tagged "Unknown Artist" even
    // though its app-controlled folder correctly names the performer. Do not
    // require a matching Artist DB row before considering that narrow fallback.
    // Artist rows may be generic for an imported compilation. Keep the SQL
    // fallback bounded by an app-owned directory AND a literal artist name.
    const aliases = artistPathAliases(catalog.artist.name);
    const artistScope: Prisma.TrackWhereInput[] = [
        ...(artistIds.length ? [{ album: { artistId: { in: artistIds } } }] : []),
        ...importArtistPrefixes(catalog.artist.name).map(prefix => ({
            filePath: { startsWith: prefix, mode: "insensitive" as const },
        })),
        ...aliases.map(name => ({
            filePath: { startsWith: name + "/", mode: "insensitive" as const },
        })),
        ...(aliases.length ? [{
            AND: [
                { filePath: { startsWith: IMPORT_ROOT, mode: "insensitive" as const } },
                { OR: aliases.map(name => ({
                    filePath: { contains: name, mode: "insensitive" as const },
                })) },
            ],
        }] : []),
    ];
    if (!artistScope.length) return { ...catalog, availableTrackCount: 0 };

    const lookup: Prisma.TrackWhereInput[] = [];
    for (const title of [...new Set(tracks.map(t => t.title.trim()).filter(Boolean))]) {
        const alternatives: Prisma.TrackWhereInput[] = [
            { title: { contains: title, mode: "insensitive" } },
            { displayTitle: { contains: title, mode: "insensitive" } },
        ];
        // Covers underscore and album-prefixed filenames such as
        // "Tones and I_The Kids Are Coming_02_Dance Monkey.flac".
        const keyword = [...(title.match(/[\p{L}\p{N}]{4,}/gu) || [])]
            .sort((a, b) => b.length - a.length)[0];
        if (keyword) alternatives.push({
            filePath: { contains: keyword, mode: "insensitive" },
        });
        lookup.push({ OR: alternatives });
    }
    const recordingMbids = tracks.map(t => t.recordingMbid).filter((v): v is string => isMbid(v));
    if (recordingMbids.length) lookup.push({ recordingMbid: { in: recordingMbids } });
    if (!lookup.length) return { ...catalog, availableTrackCount: 0 };

    const candidates = await prisma.track.findMany({
        where: {
            ...NOT_MISSING,
            corrupt: false,
            AND: [
                { OR: [
                    { album: { location: LIBRARY_LOCATION } },
                    // Include older manual imports still indexed as DISCOVER.
                    { filePath: { startsWith: "Singles/Kima Downloads/" } },
                ] },
                { OR: artistScope },
                { OR: lookup },
            ],
        },
        select: {
            id: true, title: true, displayTitle: true, filePath: true, duration: true, recordingMbid: true,
            album: {
                select: {
                    id: true, title: true, coverUrl: true, rgMbid: true,
                    artist: { select: { id: true, name: true, mbid: true } },
                },
            },
        },
        take: 450,
    });
    const merged = matchCatalogTracks(tracks, candidates, catalog.artist.name, catalog.rgMbid, artistMbid);
    return { ...catalog, tracks: merged, availableTrackCount: merged.filter(t => t.isAvailable).length };
}
