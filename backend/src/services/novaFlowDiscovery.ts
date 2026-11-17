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


/**
 * Phase 6 — explicit Album Spotlight. Source release groups are catalog
 * metadata, NOT ranked recommendations or proof of missing files.
 * No downloads, inserts, scanner calls or media operations.
 */
export interface NovaAlbumSuggestion {
    id: string;
    title: string;
    type: "Album" | "EP";
    year: number | null;
}

export interface NovaAlbumSpotlightResult {
    artistMbid: string;
    albums: NovaAlbumSuggestion[];
    sourceFailed: boolean;
    readOnly: true;
}

const EXCLUDED_RELEASE_TYPES = new Set([
    "Live", "Compilation", "Soundtrack", "Remix", "DJ-mix", "Mixtape/Street",
]);

/** Convert untrusted MusicBrainz release-group records into small, safe cards. */
export function normalizeNovaAlbumSuggestions(records: readonly unknown[]): NovaAlbumSuggestion[] {
    const results: NovaAlbumSuggestion[] = [];
    const seen = new Set<string>();
    for (const entry of records) {
        if (!entry || typeof entry !== "object") continue;
        const record = entry as Record<string, unknown>;
        if (typeof record.id !== "string" || !isMbid(record.id)) continue;
        if (typeof record.title !== "string") continue;
        const title = record.title.trim();
        if (!title || title.length > 240) continue;
        const type = record["primary-type"];
        if (type !== "Album" && type !== "EP") continue;
        const secondary = record["secondary-types"];
        if (Array.isArray(secondary) && secondary.some(value =>
            typeof value === "string" && EXCLUDED_RELEASE_TYPES.has(value))) continue;
        const id = record.id.toLowerCase();
        if (seen.has(id)) continue;
        seen.add(id);
        const date = record["first-release-date"];
        const year = typeof date === "string" && /^\d{4}(?:-|$)/.test(date)
            ? Number(date.slice(0, 4)) : null;
        results.push({
            id,
            title,
            type,
            year: year !== null && year >= 1850 && year <= 3000 ? year : null,
        });
    }
    return results;
}

/**
 * Only called from an authenticated, explicitly clicked album-preview action.
 * MusicBrainz may have no data or may fail; never invent an album.
 * A small pre-filtered list is checked against available local albums.
 */
export async function buildNovaAlbumSpotlight(
    artistMbid: string,
    requestedLimit = 3,
): Promise<NovaAlbumSpotlightResult> {
    const limit = Number.isInteger(requestedLimit)
        ? Math.max(1, Math.min(4, requestedLimit)) : 3;
    const normalizedMbid = artistMbid.toLowerCase();
    if (!isMbid(normalizedMbid)) {
        return { artistMbid: normalizedMbid, albums: [], sourceFailed: false, readOnly: true };
    }

    // Lazy-load the existing provider only for an explicit Album Spotlight
    // request; ordinary Flow, startup and auto-refill remain local-only.
    const { musicBrainzService } = await import("./musicbrainz");
    const source = await musicBrainzService.getReleaseGroups(
        normalizedMbid, ["album", "ep"], 50, { interactive: true },
    );
    if (source.kind !== "answered") {
        return {
            artistMbid: normalizedMbid, albums: [],
            sourceFailed: source.kind !== "absent", readOnly: true,
        };
    }

    const candidates = normalizeNovaAlbumSuggestions(source.value).slice(0, 30);
    if (candidates.length === 0) {
        return { artistMbid: normalizedMbid, albums: [], sourceFailed: false, readOnly: true };
    }

    // DISCOVER placeholders and missing/corrupt files are not owned music.
    const owned = await prisma.album.findMany({
        where: {
            rgMbid: { in: candidates.map(album => album.id) },
            location: "LIBRARY",
            tracks: { some: { missingSince: null, corrupt: false } },
        },
        select: { rgMbid: true },
    });
    const locallyPlayable = new Set(owned.map(album => album.rgMbid.toLowerCase()));
    return {
        artistMbid: normalizedMbid,
        albums: candidates.filter(album => !locallyPlayable.has(album.id)).slice(0, limit),
        sourceFailed: false,
        readOnly: true,
    };
}
