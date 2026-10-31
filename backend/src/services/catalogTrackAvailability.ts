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
    duration: number;
    recordingMbid: string | null;
    album: {
        id: string;
        title: string;
        coverUrl: string | null;
        rgMbid: string;
        artist: { id: string; name: string };
    };
}

export interface CatalogWithAvailability {
    tracks: CatalogTrack[];
    artist: { name: string; mbid?: string | null };
    title: string;
    rgMbid?: string | null;
    owned?: boolean;
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
): CatalogTrack[] {
    const claimed = new Set<string>();
    return catalog.map((entry) => {
        const matches = available.filter((candidate) => {
            if (claimed.has(candidate.id)) return false;
            if (entry.recordingMbid && candidate.recordingMbid &&
                !sameRecording(entry.recordingMbid, candidate.recordingMbid)) return false;
            if (sameRecording(entry.recordingMbid, candidate.recordingMbid)) return true;
            return recordingAgrees({
                id: candidate.id,
                title: candidate.displayTitle || candidate.title,
                lengthMs: candidate.duration > 0 ? candidate.duration * 1000 : null,
                artists: [candidate.album.artist.name],
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
            return recording + album + duration;
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
    if (!artistIds.length) return { ...catalog, availableTrackCount: 0 };

    const lookup: Prisma.TrackWhereInput[] = [];
    for (const title of [...new Set(tracks.map(t => t.title.trim()).filter(Boolean))]) {
        lookup.push({
            OR: [
                { title: { contains: title, mode: "insensitive" } },
                { displayTitle: { contains: title, mode: "insensitive" } },
            ],
        });
    }
    const recordingMbids = tracks.map(t => t.recordingMbid).filter((v): v is string => isMbid(v));
    if (recordingMbids.length) lookup.push({ recordingMbid: { in: recordingMbids } });
    if (!lookup.length) return { ...catalog, availableTrackCount: 0 };

    const candidates = await prisma.track.findMany({
        where: {
            ...NOT_MISSING,
            corrupt: false,
            album: { artistId: { in: artistIds } },
            AND: [
                { OR: [
                    { album: { location: LIBRARY_LOCATION } },
                    // Include earlier manual imports indexed while an artist
                    // was otherwise discovery-only, but not other suggestions.
                    { filePath: { startsWith: "Singles/Kima Downloads/" } },
                ] },
                { OR: lookup },
            ],
        },
        select: {
            id: true, title: true, displayTitle: true, duration: true, recordingMbid: true,
            album: {
                select: {
                    id: true, title: true, coverUrl: true, rgMbid: true,
                    artist: { select: { id: true, name: true } },
                },
            },
        },
        take: 450,
    });
    const merged = matchCatalogTracks(tracks, candidates, catalog.artist.name, catalog.rgMbid);
    return { ...catalog, tracks: merged, availableTrackCount: merged.filter(t => t.isAvailable).length };
}
