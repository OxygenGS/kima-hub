import { Router, Request, Response } from "express";
import { createShareLink, ShareError } from "../services/shareService";
import { prisma } from "../utils/db";
import { logger } from "../utils/logger";
import { requireAuth } from "../middleware/auth";
import { createRateLimiter } from "../middleware/rateLimiter";
import path from "path";
import fs from "fs";
import { getLocalImagePath, getResizedImagePath } from "../services/imageStorage";
import { getAudioStreamingService } from "../services/audioStreaming";
import { config } from "../config";
import { resolveWithinMusicRoot } from "./library/trackPath";

const router = Router();

const recentPlays = new Map<string, number>();
const PLAY_DEDUP_MS = 30_000;

setInterval(() => {
    const now = Date.now();
    for (const [key, ts] of recentPlays) {
        if (now - ts > PLAY_DEDUP_MS * 2) recentPlays.delete(key);
    }
}, 60_000).unref();

const shareResolveLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 60 });

const shareStreamLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 300 });

function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
        ".mp3": "audio/mpeg",
        ".flac": "audio/flac",
        ".ogg": "audio/ogg",
        ".opus": "audio/opus",
        ".wav": "audio/wav",
        ".m4a": "audio/mp4",
        ".aac": "audio/aac",
        ".wma": "audio/x-ms-wma",
    };
    return mimeTypes[ext] || "application/octet-stream";
}

/** The share link for `token`, or null once the response has gone out: 404 unknown, 410 expired or out of plays. */
async function loadUsableShareLink(token: string, res: Response) {
    const shareLink = await prisma.shareLink.findUnique({ where: { token } });

    if (!shareLink) {
        res.status(404).json({ error: "Share link not found" });
        return null;
    }

    if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
        res.status(410).json({ error: "Share link has expired" });
        return null;
    }

    if (shareLink.maxPlays && shareLink.playCount >= shareLink.maxPlays) {
        res.status(410).json({ error: "Share link play limit reached" });
        return null;
    }

    return shareLink;
}

/**
 * A share token grants access to the art attached to its shared tracks,
 * NOT every native image stored on the server. Use indexed relations so even
 * large playlists need no unbounded per-request materialization.
 */
async function shareContainsCover(
    shareLink: { entityType: string; entityId: string },
    coverArtId: string,
): Promise<boolean> {
    if (shareLink.entityType === "track") {
        const track = await prisma.track.findUnique({
            where: { id: shareLink.entityId },
            select: { album: { select: { coverUrl: true } } },
        });
        return track?.album?.coverUrl === coverArtId;
    }
    if (shareLink.entityType === "album") {
        const album = await prisma.album.findUnique({
            where: { id: shareLink.entityId },
            select: { coverUrl: true },
        });
        return album?.coverUrl === coverArtId;
    }
    if (shareLink.entityType === "playlist") {
        const item = await prisma.playlistItem.findFirst({
            where: {
                playlistId: shareLink.entityId,
                track: { album: { coverUrl: coverArtId } },
            },
            select: { id: true },
        });
        return !!item;
    }
    return false;
}

/**
 * POST /api/share - Create a share link (authenticated)
 */
router.post("/", requireAuth, async (req: Request, res: Response) => {
    try {
        const { entityType, entityId } = req.body;
        if (!entityType || !entityId) {
            return res
                .status(400)
                .json({ error: "entityType and entityId are required" });
        }

        // Creation lives in shareService so the Subsonic surface can create a
        // REAL share rather than fabricating one.
        const result = await createShareLink(req.user!.id, entityType, entityId);
        res.json(result);
    } catch (error: any) {
        if (error instanceof ShareError) {
            const status =
                error.code === "INVALID_ENTITY_TYPE" ? 400
                : error.code === "NOT_FOUND" ? 404
                : error.code === "FORBIDDEN" ? 403
                : 429;
            return res.status(status).json({ error: error.message });
        }
        logger.error(`[Share] Failed to create share link: ${error.message}`);
        res.status(500).json({ error: "Failed to create share link" });
    }
});

/**
 * GET /api/share/:token - Resolve a share link (public, no auth)
 */
router.get("/:token", shareResolveLimiter, async (req: Request, res: Response) => {
    try {
        const shareLink = await loadUsableShareLink(req.params.token, res);
        if (!shareLink) return;

        // Public endpoints return an explicit safe projection. In particular,
        // raw Track includes filePath, identity analysis and private metadata;
        // only the shared music display fields belong in an anonymous response.
        const sharedTrackSelect = {
            id: true,
            title: true,
            duration: true,
            trackNo: true,
            discNumber: true,
            discSubtitle: true,
            album: {
                select: {
                    title: true,
                    coverUrl: true,
                    artist: { select: { name: true } },
                },
            },
        } as const;

        let entity: unknown = null;

        if (shareLink.entityType === "playlist") {
            entity = await prisma.playlist.findUnique({
                where: { id: shareLink.entityId },
                select: {
                    id: true,
                    name: true,
                    items: {
                        select: { track: { select: sharedTrackSelect } },
                        orderBy: { sort: "asc" },
                    },
                    user: { select: { username: true } },
                },
            });
        } else if (shareLink.entityType === "track") {
            entity = await prisma.track.findUnique({
                where: { id: shareLink.entityId },
                select: sharedTrackSelect,
            });
        } else if (shareLink.entityType === "album") {
            entity = await prisma.album.findUnique({
                where: { id: shareLink.entityId },
                select: {
                    id: true,
                    title: true,
                    coverUrl: true,
                    artist: { select: { name: true } },
                    tracks: {
                        orderBy: [
                            { discNumber: { sort: "asc", nulls: "first" } },
                            { trackNo: "asc" },
                        ],
                        select: {
                            id: true,
                            title: true,
                            trackNo: true,
                            discNumber: true,
                            discSubtitle: true,
                            duration: true,
                        },
                    },
                },
            });
        }

        if (!entity) {
            return res.status(404).json({ error: "Shared content no longer exists" });
        }

        res.json({
            entityType: shareLink.entityType,
            entity,
            createdAt: shareLink.createdAt,
        });
    } catch (error: any) {
        logger.error(`[Share] Failed to resolve share link: ${error.message}`);
        res.status(500).json({ error: "Failed to load shared content" });
    }
});

/**
 * GET /api/share/:token/cover-art/:coverArtId - Serve cover art via share token (public)
 */
router.get("/:token/cover-art/:coverArtId", shareResolveLimiter, async (req: Request, res: Response) => {
    try {
        const shareLink = await loadUsableShareLink(req.params.token, res);
        if (!shareLink) return;

        // Express has already decoded the path parameter once.
        const coverArtId = req.params.coverArtId;
        const size = req.query.size as string | undefined;

        if (!coverArtId.startsWith("native:")) {
            return res.status(404).json({ error: "Cover art not found" });
        }
        if (!(await shareContainsCover(shareLink, coverArtId))) {
            return res.status(403).json({ error: "Cover art not in shared content" });
        }

        const localPath = getLocalImagePath(coverArtId);
        if (!localPath) {
            return res.status(404).json({ error: "Cover art not found" });
        }

        const width = size ? parseInt(size, 10) : 0;
        if (width >= 16 && width <= 2048) {
            const resizedPath = getResizedImagePath(coverArtId, width);
            if (resizedPath) {
                try {
                    await fs.promises.access(resizedPath, fs.constants.R_OK);
                    res.setHeader("Content-Type", "image/jpeg");
                    // Expiry/revocation must not leave year-long tokened artwork cached.
                    res.setHeader("Cache-Control", "private, no-store");
                    return res.sendFile(resizedPath);
                } catch {
                    // No resized copy yet: serve the original below.
                }
            }
        }

        res.setHeader("Content-Type", "image/jpeg");
        // Expiry/revocation must not leave year-long tokened artwork cached.
                    res.setHeader("Cache-Control", "private, no-store");
        return res.sendFile(localPath);
    } catch (error: any) {
        logger.error(`[Share] Cover art error: ${error.message}`);
        res.status(500).json({ error: "Failed to serve cover art" });
    }
});

/**
 * GET /api/share/:token/stream/:trackId - Stream audio via share token (public, no auth)
 */
router.get("/:token/stream/:trackId", shareStreamLimiter, async (req: Request, res: Response) => {
    try {
        const shareLink = await loadUsableShareLink(req.params.token, res);
        if (!shareLink) return;

        const trackId = req.params.trackId;
        let authorized = false;

        if (shareLink.entityType === "track" && shareLink.entityId === trackId) {
            authorized = true;
        } else if (shareLink.entityType === "playlist") {
            const item = await prisma.playlistItem.findFirst({
                where: { playlistId: shareLink.entityId, trackId },
            });
            authorized = !!item;
        } else if (shareLink.entityType === "album") {
            const track = await prisma.track.findFirst({
                where: { id: trackId, albumId: shareLink.entityId },
            });
            authorized = !!track;
        }

        if (!authorized) {
            return res.status(403).json({ error: "Track not in shared content" });
        }

        const track = await prisma.track.findUnique({
            where: { id: trackId },
            select: { filePath: true },
        });

        if (!track?.filePath) {
            return res.status(404).json({ error: "Track file not found" });
        }

        // Stored file paths can contain traversal segments or point to a
        // symlink escaping the music root. Compare canonical, existing paths
        // before making this public stream available to an anonymous token.
        const candidatePath = resolveWithinMusicRoot(track.filePath);
        if (!candidatePath) {
            return res.status(403).json({ error: "Access denied" });
        }
        let fullPath: string;
        let realMusicRoot: string;
        try {
            [fullPath, realMusicRoot] = await Promise.all([
                fs.promises.realpath(candidatePath),
                fs.promises.realpath(config.music.musicPath),
            ]);
            await fs.promises.access(fullPath, fs.constants.R_OK);
        } catch {
            return res.status(404).json({ error: "Audio file not found" });
        }
        if (!fullPath.startsWith(realMusicRoot + path.sep)) {
            return res.status(403).json({ error: "Access denied" });
        }

        // Deduplicate play count: only increment once per share+track within time window
        const playKey = `${shareLink.id}:${trackId}`;
        const lastPlay = recentPlays.get(playKey);
        const now = Date.now();

        if (!lastPlay || now - lastPlay > PLAY_DEDUP_MS) {
            recentPlays.set(playKey, now);

            if (shareLink.maxPlays) {
                // Atomic check-and-increment: only succeeds if under the limit
                const updated = await prisma.$executeRaw`
                    UPDATE "share_links"
                    SET "playCount" = "playCount" + 1
                    WHERE "id" = ${shareLink.id}
                      AND ("maxPlays" IS NULL OR "playCount" < "maxPlays")
                `;
                if (updated === 0) {
                    recentPlays.delete(playKey);
                    return res.status(410).json({ error: "Share link play limit reached" });
                }
            } else {
                await prisma.shareLink.update({
                    where: { id: shareLink.id },
                    data: { playCount: { increment: 1 } },
                });
            }
        }

        const mimeType = getMimeType(track.filePath);
        const streamingService = getAudioStreamingService(
            config.music.transcodeCachePath,
            config.music.transcodeCacheMaxGb,
        );
        // A revoked/expired token must not leave a reusable cached audio file.
        await streamingService.streamFileWithRangeSupport(req, res, fullPath, mimeType, "private, no-store");
    } catch (error: any) {
        logger.error(`[Share] Stream error: ${error.message}`);
        if (!res.headersSent) {
            res.status(500).json({ error: "Failed to stream audio" });
        }
    }
});

/**
 * DELETE /api/share/:token - Revoke a share link (authenticated, owner only)
 */
router.delete("/:token", requireAuth, async (req: Request, res: Response) => {
    try {
        const shareLink = await prisma.shareLink.findUnique({
            where: { token: req.params.token },
        });

        if (!shareLink) {
            return res.status(404).json({ error: "Share link not found" });
        }

        if (shareLink.createdBy !== req.user!.id) {
            return res.status(403).json({ error: "Not the link owner" });
        }

        await prisma.shareLink.delete({ where: { id: shareLink.id } });

        res.json({ message: "Share link revoked" });
    } catch (error: any) {
        logger.error(`[Share] Failed to revoke share link: ${error.message}`);
        res.status(500).json({ error: "Failed to revoke share link" });
    }
});

export default router;
