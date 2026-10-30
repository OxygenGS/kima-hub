/**
 * Bounded, admin-triggered repair for album covers on already-indexed tracks.
 * The normal music scanner skips unchanged files; this job never rescans audio
 * or changes track metadata. Its cursor survives consecutive batches in the
 * API process; restarting the process begins a fresh pass.
 */
import path from "path";
import { config } from "../config";
import { prisma, Prisma } from "../utils/db";
import { logger } from "../utils/logger";
import { findAlbumArtwork } from "./artwork";
import { CoverArtExtractor } from "./coverArtExtractor";
import { getLocalImagePathAsync } from "./imageStorage";
import { resolveExistingMusicFile } from "../routes/library/trackPath";

const BATCH_LIMIT = 200;
const PAGE_SIZE = 20;
const REMOTE_PAUSE_MS = 250;

export interface AlbumCoverRecoveryStatus {
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
    title: string;
    rgMbid: string;
    coverUrl: string | null;
    artist: { name: string };
    tracks: Array<{ filePath: string }>;
};

let status: AlbumCoverRecoveryStatus = {
    inProgress: false,
    total: 0,
    processed: 0,
    recoveredLocal: 0,
    recoveredExternal: 0,
    skipped: 0,
    failed: 0,
    hasMore: false,
    batchLimit: BATCH_LIMIT,
    startedAt: null,
    finishedAt: null,
    error: null,
};
let resumeAfterId: string | null = null;

export function getAlbumCoverRecoveryStatus(): AlbumCoverRecoveryStatus {
    return { ...status };
}

function eligibleAlbums(afterId: string | null): Prisma.AlbumWhereInput {
    return {
        // Manual image choices are not managed by automatic repairs.
        userCoverUrl: null,
        // External URLs are retained. Native URLs get checked for missing files.
        OR: [
            { coverUrl: null },
            { coverUrl: "" },
            { coverUrl: { startsWith: "native:" } },
        ],
        tracks: { some: { missingSince: null, corrupt: false } },
        ...(afterId ? { id: { gt: afterId } } : {}),
    };
}

async function writeCover(
    album: Candidate,
    url: string,
): Promise<boolean> {
    // Compare-and-set ensures a concurrent scan or manual change wins.
    const result = await prisma.album.updateMany({
        where: {
            id: album.id,
            coverUrl: album.coverUrl,
            userCoverUrl: null,
        },
        data: { coverUrl: url },
    });
    return result.count === 1;
}

async function recoverAlbum(
    album: Candidate,
    extractor: CoverArtExtractor,
): Promise<"local" | "external" | "skipped"> {
    if (album.coverUrl?.startsWith("native:")) {
        // Avoid changing good native images or re-reading their audio.
        if (await getLocalImagePathAsync(album.coverUrl)) return "skipped";
    }

    // Never trust stored paths to remain inside the configured music root:
    // physical realpath containment also rejects symlinks leading outside it.
    let audioPath: string | null = null;
    for (const track of album.tracks) {
        audioPath = await resolveExistingMusicFile(track.filePath);
        if (audioPath) break;
    }
    if (!audioPath) return "skipped";

    // Keep the scanner's priority: cached/embedded -> folder -> providers.
    try {
        const filename = await extractor.extractCoverArt(audioPath, album.id);
        if (filename) {
            return (await writeCover(album, "native:" + filename))
                ? "local"
                : "skipped";
        }
    } catch (error) {
        logger.warn("[ArtworkRepair] Local extraction failed for " + album.id, error);
    }

    try {
        const found = await findAlbumArtwork({
            rgMbid: album.rgMbid,
            artistName: album.artist.name,
            albumTitle: album.title,
        });
        if (!found) return "skipped";
        return (await writeCover(album, found.url)) ? "external" : "skipped";
    } finally {
        // Only remote lookups are paced; locally cached covers remain fast.
        await new Promise<void>((resolve) => setTimeout(resolve, REMOTE_PAUSE_MS));
    }
}

async function processAlbumCoverRecovery(): Promise<void> {
    const count = await prisma.album.count({ where: eligibleAlbums(resumeAfterId) });
    status.total = Math.min(count, BATCH_LIMIT);
    const coversDir = path.resolve(config.music.transcodeCachePath, "..", "covers");
    const extractor = new CoverArtExtractor(coversDir);
    let afterId = resumeAfterId;

    while (status.processed < status.total) {
        const albums = await prisma.album.findMany({
            where: eligibleAlbums(afterId),
            orderBy: { id: "asc" },
            take: Math.min(PAGE_SIZE, status.total - status.processed),
            select: {
                id: true,
                title: true,
                rgMbid: true,
                coverUrl: true,
                artist: { select: { name: true } },
                tracks: {
                    where: { missingSince: null, corrupt: false },
                    orderBy: { filePath: "asc" },
                    take: 5,
                    select: { filePath: true },
                },
            },
        });

        if (albums.length === 0) break;
        for (const album of albums) {
            afterId = album.id;
            try {
                const outcome = await recoverAlbum(album, extractor);
                if (outcome === "local") status.recoveredLocal++;
                else if (outcome === "external") status.recoveredExternal++;
                else status.skipped++;
            } catch (error) {
                status.failed++;
                logger.warn("[ArtworkRepair] Album recovery failed for " + album.id, error);
            } finally {
                status.processed++;
            }
        }
    }

    const remaining = await prisma.album.count({ where: eligibleAlbums(afterId) });
    status.hasMore = remaining > 0;
    resumeAfterId = status.hasMore ? afterId : null;
    logger.info(
        "[ArtworkRepair] Finished: local=" + status.recoveredLocal +
        " remote=" + status.recoveredExternal + " skipped=" + status.skipped +
        " failed=" + status.failed + " hasMore=" + status.hasMore,
    );
}

export function startAlbumCoverRecovery(): boolean {
    if (status.inProgress) return false;
    status = {
        inProgress: true,
        total: 0,
        processed: 0,
        recoveredLocal: 0,
        recoveredExternal: 0,
        skipped: 0,
        failed: 0,
        hasMore: false,
        batchLimit: BATCH_LIMIT,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        error: null,
    };
    void processAlbumCoverRecovery()
        .catch((error) => {
            status.error = "Album artwork recovery failed; see server logs";
            logger.error("[ArtworkRepair] Recovery stopped", error);
        })
        .finally(() => {
            status.inProgress = false;
            status.finishedAt = new Date().toISOString();
        });
    return true;
}
