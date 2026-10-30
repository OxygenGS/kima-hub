import path from "path";
import { config } from "../config";
import { prisma, Prisma } from "../utils/db";
import { logger } from "../utils/logger";
import { redisClient } from "../utils/redis";
import { findArtistArtwork } from "./artwork";
import { recoverLocalArtistPortrait } from "./artistPortraitExtractor";
import { getLocalImagePathAsync } from "./imageStorage";
import { resolveExistingMusicFile } from "../routes/library/trackPath";

const BATCH_LIMIT = 100;
const PAGE_SIZE = 10;
const REMOTE_PAUSE_MS = 300;

export interface ArtistImageRecoveryStatus {
    inProgress: boolean;
    total: number;
    processed: number;
    recoveredLocal: number;
    recoveredExternal: number;
    skipped: number;
    failed: number;
    hasMore: boolean;
    batchLimit: number;
    startedAt: string | null;
    finishedAt: string | null;
    error: string | null;
}
type Candidate = {
    id: string;
    name: string;
    mbid: string | null;
    heroUrl: string | null;
    albums: Array<{ tracks: Array<{ filePath: string }> }>;
};

let progress: ArtistImageRecoveryStatus = {
    inProgress: false, total: 0, processed: 0, recoveredLocal: 0,
    recoveredExternal: 0, skipped: 0, failed: 0, hasMore: false,
    batchLimit: BATCH_LIMIT, startedAt: null, finishedAt: null, error: null,
};
let resumeAfterId: string | null = null;

export function getArtistImageRecoveryStatus(): ArtistImageRecoveryStatus {
    return { ...progress };
}

function eligibleArtists(afterId: string | null): Prisma.ArtistWhereInput {
    return {
        userHeroUrl: null,
        OR: [
            { heroUrl: null },
            { heroUrl: "" },
            { heroUrl: { startsWith: "native:" } },
        ],
        albums: { some: { tracks: { some: { missingSince: null, corrupt: false } } } },
        ...(afterId ? { id: { gt: afterId } } : {}),
    };
}

async function storeImage(artist: Candidate, url: string): Promise<boolean> {
    const result = await prisma.artist.updateMany({
        where: { id: artist.id, heroUrl: artist.heroUrl, userHeroUrl: null },
        data: { heroUrl: url },
    });
    if (result.count !== 1) return false;
    // Replace any stale negative Redis cache used by artist pages.
    try {
        await redisClient.setex("hero:" + artist.id, 7 * 24 * 60 * 60, url);
    } catch {
        // Database is authoritative when Redis is unavailable.
    }
    return true;
}

async function recoverArtist(
    artist: Candidate,
    musicRoot: string,
    coversBase: string,
): Promise<"local" | "external" | "skipped"> {
    if (artist.heroUrl?.startsWith("native:") && await getLocalImagePathAsync(artist.heroUrl)) {
        return "skipped";
    }

    let hasReadableAudio = false;
    for (const album of artist.albums) {
        for (const track of album.tracks) {
            const audioPath = await resolveExistingMusicFile(track.filePath);
            if (!audioPath) continue;
            hasReadableAudio = true;
            try {
                const local = await recoverLocalArtistPortrait(
                    audioPath, artist.name, artist.id, musicRoot, coversBase,
                );
                if (local) return (await storeImage(artist, local)) ? "local" : "skipped";
            } catch (error) {
                logger.warn("[ArtistImageRepair] Local extraction failed for " + artist.id, error);
            }
        }
    }
    if (!hasReadableAudio) return "skipped";

    try {
        const found = await findArtistArtwork({ name: artist.name, mbid: artist.mbid });
        if (!found) return "skipped";
        return (await storeImage(artist, found.url)) ? "external" : "skipped";
    } finally {
        await new Promise<void>((resolve) => setTimeout(resolve, REMOTE_PAUSE_MS));
    }
}

async function processArtistImageRecovery(): Promise<void> {
    const count = await prisma.artist.count({ where: eligibleArtists(resumeAfterId) });
    progress.total = Math.min(count, BATCH_LIMIT);
    const musicRoot = config.music.musicPath;
    const coversBase = path.resolve(config.music.transcodeCachePath, "..", "covers");
    let afterId = resumeAfterId;

    while (progress.processed < progress.total) {
        const artists = await prisma.artist.findMany({
            where: eligibleArtists(afterId),
            orderBy: { id: "asc" },
            take: Math.min(PAGE_SIZE, progress.total - progress.processed),
            select: {
                id: true, name: true, mbid: true, heroUrl: true,
                albums: {
                    where: { tracks: { some: { missingSince: null, corrupt: false } } },
                    orderBy: { id: "asc" },
                    take: 3,
                    select: {
                        tracks: {
                            where: { missingSince: null, corrupt: false },
                            orderBy: { filePath: "asc" },
                            take: 2,
                            select: { filePath: true },
                        },
                    },
                },
            },
        });
        if (!artists.length) break;
        for (const artist of artists) {
            afterId = artist.id;
            try {
                const outcome = await recoverArtist(artist, musicRoot, coversBase);
                if (outcome === "local") progress.recoveredLocal++;
                else if (outcome === "external") progress.recoveredExternal++;
                else progress.skipped++;
            } catch (error) {
                progress.failed++;
                logger.warn("[ArtistImageRepair] Failed artist " + artist.id, error);
            } finally {
                progress.processed++;
            }
        }
    }
    progress.hasMore = (await prisma.artist.count({ where: eligibleArtists(afterId) })) > 0;
    resumeAfterId = progress.hasMore ? afterId : null;
    logger.info("[ArtistImageRepair] Finished: recovered=" +
        (progress.recoveredLocal + progress.recoveredExternal) +
        " skipped=" + progress.skipped + " failed=" + progress.failed);
}

export function startArtistImageRecovery(): boolean {
    if (progress.inProgress) return false;
    progress = {
        inProgress: true, total: 0, processed: 0, recoveredLocal: 0,
        recoveredExternal: 0, skipped: 0, failed: 0, hasMore: false,
        batchLimit: BATCH_LIMIT, startedAt: new Date().toISOString(),
        finishedAt: null, error: null,
    };
    void processArtistImageRecovery()
        .catch((error) => {
            progress.error = "Artist image recovery failed; check server logs";
            logger.error("[ArtistImageRepair] Recovery stopped", error);
        })
        .finally(() => {
            progress.inProgress = false;
            progress.finishedAt = new Date().toISOString();
        });
    return true;
}
