/**
 * Project NOVA Discovery Radar: read-only, user-requested external discovery.
 *
 * Only a playable indexed library track may be used as a seed. Every result
 * comes from existing ListenBrainz/Deezer artist-similarity sources; Kima
 * verifies against its OWN playable catalog before describing it as missing.
 * No album, job, download or filesystem writes are performed here.
 */
import { prisma } from "../utils/db";
import { findSimilarArtists } from "./artistSimilarity";
import { artistIdentityKey, isMbid } from "./artistIdentity";
import { LIBRARY_TRACK_WHERE } from "./libraryFilters";
import { NOT_MISSING } from "../utils/libraryEligibility";

export interface NovaDiscoveryArtist {
    name: string;
    mbid: string | null;
    /** Source similarity ranking, not a probability of enjoyment. */
    match: number;
}

export interface NovaDiscoveryResult {
    unavailableSeed: boolean;
    seedArtist: string | null;
    artists: NovaDiscoveryArtist[];
    sourceFailed: boolean;
}

const playable = { ...LIBRARY_TRACK_WHERE, ...NOT_MISSING, corrupt: false };

/** Keep only grounded source results with a displayable artist and identity. */
export function distinctDiscoveryArtists(
    artists: Array<{ name: string; mbid?: string; match: number }>,
    seedArtistName: string,
): NovaDiscoveryArtist[] {
    const found = new Set<string>([artistIdentityKey(seedArtistName)]);
    const result: NovaDiscoveryArtist[] = [];
    for (const artist of artists) {
        if (typeof artist.name !== "string" || artist.name.length > 180) continue;
        const name = artist.name.trim();
        const key = artistIdentityKey(name);
        if (!key || found.has(key) || !Number.isFinite(artist.match)) continue;
        found.add(key);
        result.push({
            name,
            mbid: isMbid(artist.mbid) ? artist.mbid.toLowerCase() : null,
            match: Math.max(0, Math.min(1, artist.match)),
        });
    }
    return result;
}

export async function buildNovaDiscovery(
    seedTrackId: string,
    limit: number,
): Promise<NovaDiscoveryResult> {
    const seed = await prisma.track.findFirst({
        where: { ...playable, id: seedTrackId },
        select: {
            album: { select: { artist: { select: { name: true, mbid: true } } } },
        },
    });
    if (!seed) {
        return { unavailableSeed: true, seedArtist: null, artists: [], sourceFailed: false };
    }

    const artist = seed.album.artist;
    // Use the proven, externally sourced similar-artist service. Its results
    // are explicitly requested by a user; never call it during player refill.
    const external = await findSimilarArtists(
        isMbid(artist.mbid) ? artist.mbid : "",
        artist.name,
        Math.min(40, Math.max(12, limit * 4)),
        { interactive: true },
    );
    const distinct = distinctDiscoveryArtists(external.artists, artist.name);
    if (distinct.length === 0) {
        return {
            unavailableSeed: false,
            seedArtist: artist.name,
            artists: [],
            sourceFailed: external.failed,
        };
    }

    const mbids = distinct.map(row => row.mbid).filter((id): id is string => id !== null);
    const identityKeys = distinct.map(row => artistIdentityKey(row.name));
    // A bare Artist row is NOT evidence that music is owned: DISCOVER albums,
    // placeholder artists and missing files must not be treated as playable.
    const owned = await prisma.artist.findMany({
        where: {
            OR: [
                ...(mbids.length > 0 ? [{ mbid: { in: mbids } }] : []),
                { identityKey: { in: identityKeys } },
            ],
            albums: {
                some: {
                    location: "LIBRARY",
                    tracks: { some: { missingSince: null, corrupt: false } },
                },
            },
        },
        select: { mbid: true, identityKey: true },
    });
    const ownedMbids = new Set(owned.map(row => row.mbid).filter(Boolean).map(id => id!.toLowerCase()));
    const ownedNames = new Set(owned.map(row => row.identityKey));

    const missing = distinct.filter(row =>
        !ownedNames.has(artistIdentityKey(row.name)) &&
        !(row.mbid && ownedMbids.has(row.mbid)),
    );
    return {
        unavailableSeed: false,
        seedArtist: artist.name,
        artists: missing.slice(0, limit),
        sourceFailed: external.failed,
    };
}
