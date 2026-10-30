/**
 * Explicit, bounded recovery for artists that genuinely have no picture.
 *
 * The normal scanner/enrichment path remains the primary source of artwork.
 * This job is admin-initiated, uses the existing providers and local files,
 * and never resets enrichment state or overwrites a custom image.
 */
import { config } from "../config";
import { randomUUID } from "crypto";
import { prisma } from "../utils/db";
import { logger } from "../utils/logger";
import { redisClient } from "../utils/redis";
import { findArtistArtwork } from "./artwork";
import { isMbid } from "./artistIdentity";
import { downloadAndStoreImage, findLocalArtistImage } from "./imageStorage";
import { LIBRARY_LOCATION } from "./libraryFilters";

const MAX_ARTISTS_PER_BATCH = 20;
const PROVIDER_CONCURRENCY = 2;

export interface ArtistArtworkRecoveryProgress {
    inProgress: boolean;
    queued: number;
    processed: number;
    recovered: number;
    missing: number;
    failed: number;
    startedAt: string | null;
    finishedAt: string | null;
}

let progress: ArtistArtworkRecoveryProgress = {
    inProgress: false,
    queued: 0,
    processed: 0,
    recovered: 0,
    missing: 0,
    failed: 0,
    startedAt: null,
    finishedAt: null,
};

// Rotate through unresolved artists instead of searching the same first 20 on
// each click. This lightweight cursor is local to the current AIO process.
let lastArtistId: string | null = null;

export function getArtistArtworkRecoveryProgress(): ArtistArtworkRecoveryProgress {
    return { ...progress };
}

export async function getMissingArtistArtworkCount(): Promise<number> {
    return prisma.artist.count({
        where: { heroUrl: null, userHeroUrl: null },
    });
}

type MissingArtist = { id: string; name: string; mbid: string | null };

/** Recovery accepts known provider CDN addresses, never arbitrary URL input. */
function isTrustedArtistImageUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" && (
            parsed.hostname === "assets.fanart.tv" ||
            parsed.hostname === "e-cdns-images.dzcdn.net"
        );
    } catch {
        return false;
    }
}

async function selectMissingArtists(): Promise<MissingArtist[]> {
    const where = {
        heroUrl: null,
        userHeroUrl: null,
        ...(lastArtistId ? { id: { gt: lastArtistId } } : {}),
    };
    let artists = await prisma.artist.findMany({
        where,
        orderBy: { id: "asc" },
        take: MAX_ARTISTS_PER_BATCH,
        select: { id: true, name: true, mbid: true },
    });
    if (!artists.length && lastArtistId) {
        // Completed a pass, then wrap to still-unresolved items.
        lastArtistId = null;
        artists = await prisma.artist.findMany({
            where: { heroUrl: null, userHeroUrl: null },
            orderBy: { id: "asc" },
            take: MAX_ARTISTS_PER_BATCH,
            select: { id: true, name: true, mbid: true },
        });
    }
    if (artists.length) lastArtistId = artists[artists.length - 1].id;
    return artists;
}

async function recoverArtist(artist: MissingArtist): Promise<void> {
    try {
        // Always write recovered files to a fresh path. A concurrent manual
        // override may already reference artists/{id}.jpg; even a failed DB
        // compare-and-set must not mutate that user's image on disk.
        const recoveryId = `recovery-${artist.id}-${randomUUID()}`;
        // Explicit artist.* filenames are authoritative; folder.jpg in an
        // album directory is album cover art, not an artist portrait.
        const track = await prisma.track.findFirst({
            where: {
                album: { artistId: artist.id, location: LIBRARY_LOCATION },
            },
            select: { filePath: true },
        });

        const local = track
            ? await findLocalArtistImage(config.music.musicPath, track.filePath, artist.id, {
                artistOnly: true,
                cacheId: recoveryId,
            })
            : null;

        let image = local;
        if (!image) {
            const remote = await findArtistArtwork({
                name: artist.name,
                mbid: isMbid(artist.mbid) ? artist.mbid : undefined,
                refresh: true,
            });
            if (remote?.url && isTrustedArtistImageUrl(remote.url)) {
                // Never cache a URL supplied by a caller: it must originate
                // from the shared, verified provider pipeline.
                image = (await downloadAndStoreImage(remote.url, recoveryId, "artist")) || remote.url;
            }
        }

        if (!image) {
            progress.missing++;
            return;
        }

        // Even if an admin edits the artist while the lookup is running,
        // the recovery job must never overwrite the newer image/override.
        const updated = await prisma.artist.updateMany({
            where: { id: artist.id, heroUrl: null, userHeroUrl: null },
            data: { heroUrl: image },
        });
        if (updated.count === 1) {
            progress.recovered++;
            try {
                // Removes an old 'NOT_FOUND' in list caches immediately.
                await redisClient.del(`hero:${artist.id}`);
            } catch {
                // Redis is an optimization. DB remains source of truth.
            }
        }
    } catch (error) {
        progress.failed++;
        logger.warn(
            `[ArtworkRecovery] Artist ${artist.id} could not be recovered: ${error instanceof Error ? error.message : String(error)}`,
        );
    } finally {
        progress.processed++;
    }
}

async function recoverBatch(): Promise<void> {
    const artists = await selectMissingArtists();
    progress.queued = artists.length;

    // Never flood public services: at most two lookups at a time.
    for (let i = 0; i < artists.length; i += PROVIDER_CONCURRENCY) {
        await Promise.all(artists.slice(i, i + PROVIDER_CONCURRENCY).map(recoverArtist));
    }
}

/** Start a single nonblocking, capped job. Return false when one is running. */
export function startArtistArtworkRecovery(): boolean {
    if (progress.inProgress) return false;

    progress = {
        inProgress: true,
        queued: 0,
        processed: 0,
        recovered: 0,
        missing: 0,
        failed: 0,
        startedAt: new Date().toISOString(),
        finishedAt: null,
    };

    void recoverBatch()
        .catch((error) => {
            progress.failed++;
            logger.warn("[ArtworkRecovery] Could not list artists without pictures:", error);
        })
        .finally(() => {
            progress.inProgress = false;
            progress.finishedAt = new Date().toISOString();
        });

    return true;
}
