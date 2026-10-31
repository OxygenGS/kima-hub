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

/** Only the dedicated app-owned import folder is eligible for a tagless artist fallback. */
function importFolderArtist(filePath?: string): string | null {
    if (!filePath) return null;
    const parts = filePath.replace(/\\/g, "/").split("/");
    if (parts.length < 5 ||
        parts[0]?.toLowerCase() !== "singles" ||
        parts[1]?.toLowerCase() !== "kima downloads") return null;
    const name = parts[2]?.trim();
    return name && !["unknownartist", "variousartists", "music", "downloads", "unknown"].includes(artistIdentityKey(name))
        ? name : null;
}

/** Peer folders can spell the same name with "&" or "and". These are
 * exact directory prefixes, not a search across the entire music collection.
 */
function importArtistPrefixes(name: string): string[] {
    // "Unknown Artist" is not an identity and must never open a global match.
    if (GENERIC_ARTIST_KEYS.has(artistIdentityKey(name))) return [];
    const aliases = [name, name.replace(/\band\b/gi, "&"), name.replace(/&/g, "and")];
    return [...new Set(aliases.map(a => a.trim()))]
        .filter(a => !!a && !a.includes("/") && !a.includes("\\") && ![...a].some(ch => ch.charCodeAt(0) < 32))
        .map(a => `Singles/Kima Downloads/${a}/`);
}

const GENERIC_ARTIST_KEYS = new Set(["unknownartist", "variousartists", "unknown"]);

/** Use an app-managed download directory only when the file's embedded artist
 * is absent/generic. Explicitly tagged other performers are never overridden.
 */
function candidateArtist(candidate: LocalCandidate, expectedArtist: string): string {
    const embedded = candidate.album.artist.name;
    const folder = importFolderArtist(candidate.filePath);
    return folder &&
        artistIdentityKey(folder) === artistIdentityKey(expectedArtist) &&
        GENERIC_ARTIST_KEYS.has(artistIdentityKey(embedded))
        ? expectedArtist : embedded;
}

/**
 * Tagless Soulseek files can be indexed by their filename (e.g.
 * "02 - Dance Monkey" or "Tones and I - Dance Monkey"). Strip only
 * unambiguous prefixes in our dedicated import folder; never strip version
 * words such as Live, Remix or Acoustic.
 */
function candidateTitle(candidate: LocalCandidate): string {
    const original = candidate.displayTitle || candidate.title;
    const folder = importFolderArtist(candidate.filePath);
    if (!folder) return original;
    let normalized = original.replace(/^\s*\d{1,3}[\s._-]+/, "").trim();
    const prefix = normalized.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (prefix && [candidate.album.artist.name, folder].some(
        name => artistIdentityKey(name) === artistIdentityKey(prefix[1]),
    )) normalized = prefix[2].trim();
    return normalized || original;
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
                title: candidateTitle(candidate),
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
    const importPrefixes = importArtistPrefixes(catalog.artist.name);
    if (!artistIds.length && !importPrefixes.length) {
        return { ...catalog, availableTrackCount: 0 };
    }

    const lookup: Prisma.TrackWhereInput[] = [];
    for (const title of [...new Set(tracks.map(t => t.title.trim()).filter(Boolean))]) {
        const alternatives: Prisma.TrackWhereInput[] = [
            { title: { contains: title, mode: "insensitive" } },
            { displayTitle: { contains: title, mode: "insensitive" } },
        ];
        // A tagless download named "02 - dance_monkey.flac" won't match
        // "Dance Monkey" as a substring. The final matcher still demands
        // title, version, performer and duration agreement.
        const keyword = [...(title.match(/[\p{L}\p{N}]{4,}/gu) || [])]
            .sort((a, b) => b.length - a.length)[0];
        if (keyword && importPrefixes.length) alternatives.push({
            AND: [
                { filePath: { startsWith: "Singles/Kima Downloads/" } },
                { filePath: { contains: keyword, mode: "insensitive" } },
            ],
        });
        lookup.push({ OR: alternatives });
    }
    const recordingMbids = tracks.map(t => t.recordingMbid).filter((v): v is string => isMbid(v));
    if (recordingMbids.length) lookup.push({ recordingMbid: { in: recordingMbids } });
    if (!lookup.length) return { ...catalog, availableTrackCount: 0 };

    const artistScope: Prisma.TrackWhereInput[] = [
        ...(artistIds.length ? [{ album: { artistId: { in: artistIds } } }] : []),
        ...importPrefixes.map(prefix => ({
            filePath: { startsWith: prefix, mode: "insensitive" as const },
        })),
    ];
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
