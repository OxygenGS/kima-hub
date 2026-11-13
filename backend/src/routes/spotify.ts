import { Router, type Response } from "express";
import multer from "multer";
import path from "path";
import { createRateLimiter } from "../middleware/rateLimiter";
import { withRetry } from "../utils/async";
import { logger } from "../utils/logger";
import { requireAuthOrToken, requireMusicPermission } from "../middleware/auth";
import { safeError } from "../utils/errors";
import { z } from "zod";
import { spotifyService } from "../services/spotify";
import { spotifyImportService, getImportJob } from "../services/spotifyImport";
import { deezerService } from "../services/deezer";
import { readSessionLog, getSessionLogPath } from "../utils/playlistLogger";
import { parseM3U } from "../services/m3uParser";
import { recogniseMusicLink, lacksLinkScheme, FULL_LINK_MESSAGE, type MusicLink, type MusicPlatform } from "../services/musicLink";

const router = Router();

const m3uUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 1 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if ([".m3u", ".m3u8"].includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error("Only .m3u and .m3u8 files are accepted"));
        }
    },
});

// All routes require authentication
router.use(requireAuthOrToken);

// Validation schemas
const parseUrlSchema = z.object({
    url: z.string(),
});

const importSchema = z.object({
    spotifyPlaylistId: z.string(),
    url: z.string().url().optional(),
    playlistName: z.string().min(1).max(200),
    albumMbidsToDownload: z.array(z.string()),
    previewJobId: z.string().optional(),
});

const quickImportSchema = z.object({
    url: z.string(),
    playlistName: z.string().min(1).max(200).optional(),
});

// The sites a playlist can be imported from.
const IMPORT_PLATFORMS: ReadonlySet<MusicPlatform> = new Set([
    "spotify",
    "deezer",
    "youtube",
    "youtubeMusic",
    "soundcloud",
    "mixcloud",
]);

// What a quick import also needs of the address: the start of its path, per site. A site missing here takes any path.
const QUICK_IMPORT_PATHS: Partial<Record<MusicPlatform, string[]>> = {
    spotify: ["/playlist/"],
    deezer: ["/playlist/", "/playlist:"],
    youtube: ["/playlist", "/watch"],
    youtubeMusic: ["/playlist", "/watch"],
};

const INVALID_URL = "Invalid URL. Supported: Spotify, Deezer, YouTube, SoundCloud, Mixcloud.";

/** The 400 reply for an address that is not an importable music link. */
function refuseLink(res: Response, raw: string) {
    return res.status(400).json({ error: lacksLinkScheme(raw) ? FULL_LINK_MESSAGE : INVALID_URL });
}

/** The address as a music link on a site playlists can be imported from, or null. */
function importableLink(raw: string): MusicLink | null {
    const link = recogniseMusicLink(raw);
    return link && IMPORT_PLATFORMS.has(link.platform) ? link : null;
}

/** The address as a music link that a quick import can start from, or null. */
function quickImportableLink(raw: string): MusicLink | null {
    const link = importableLink(raw);
    if (!link || link.domain === "youtu.be") return link;
    const paths = QUICK_IMPORT_PATHS[link.platform];
    const { pathname } = new URL(link.url);
    return !paths || paths.some((start) => pathname.startsWith(start)) ? link : null;
}

/**
 * POST /api/spotify/parse
 * Parse a Spotify URL and return basic info
 */
router.post("/parse", async (req, res) => {
    try {
        const { url } = parseUrlSchema.parse(req.body);

        const link = recogniseMusicLink(url);
        if (!link || link.platform !== "spotify") return refuseLink(res, url);
        const parsed = spotifyService.parseUrl(link.url);
        if (!parsed) {
            return res.status(400).json({
                error: "Invalid Spotify URL. Please provide a valid playlist URL.",
            });
        }

        // Only playlists can be imported
        if (parsed.type !== "playlist") {
            return res.status(400).json({
                error: `Only playlist imports are supported. Got: ${parsed.type}`,
            });
        }

        res.json({
            type: parsed.type,
            id: parsed.id,
            url: `https://open.spotify.com/playlist/${parsed.id}`,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: "Invalid request body" });
        }
        safeError(res, "Spotify parse", error);
    }
});

/**
 * POST /api/spotify/preview/start
 * Start a background preview job and return a job ID immediately.
 * Progress is streamed via SSE (preview:progress / preview:complete).
 */
router.post("/preview/start", async (req, res) => {
    try {
        const { url } = parseUrlSchema.parse(req.body);

        const link = importableLink(url);
        if (!link) return refuseLink(res, url);

        logger.debug(`[Playlist Import] Starting preview job for: ${link.url}`);
        const { jobId } = await spotifyImportService.startPreviewJob(link.url, req.user!.id);
        res.json({ jobId });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: "Invalid request body" });
        }
        safeError(res, "Playlist preview start", error);
    }
});

/**
 * GET /api/spotify/preview/:jobId
 * Poll for a completed preview result stored in Redis.
 * Returns { status: "pending" } while the background job is still running.
 */
router.get("/preview/:jobId", async (req, res) => {
    try {
        const { jobId } = req.params;
        const result = await spotifyImportService.getPreviewResult(jobId);
        if (!result) {
            return res.json({ status: "pending" });
        }
        if (result.userId && result.userId !== req.user!.id) {
            return res.status(403).json({ error: "Not authorized to view this preview" });
        }
        res.json(result);
    } catch (error) {
        safeError(res, "Playlist preview fetch", error);
    }
});

/**
 * POST /api/spotify/import/quick
 * Fire-and-forget import: skip preview, fetch + match + download all in background
 */
router.post("/import/quick", requireMusicPermission("canRequestAlbums"), requireMusicPermission("canDownloadTracks"), async (req, res) => {
    try {
        const { url, playlistName } = quickImportSchema.parse(req.body);

        const link = quickImportableLink(url);
        if (!link) return refuseLink(res, url);

        const { jobId } = await spotifyImportService.quickImport(link.url, req.user!.id, playlistName);

        res.json({ jobId });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: "Invalid request body" });
        }
        safeError(res, "Quick import", error);
    }
});

/**
 * POST /api/spotify/import
 * Start importing a Spotify playlist
 */
router.post("/import", requireMusicPermission("canRequestAlbums"), requireMusicPermission("canDownloadTracks"), async (req, res) => {
    try {
        const { spotifyPlaylistId, url, playlistName, albumMbidsToDownload, previewJobId } =
            importSchema.parse(req.body);
        const userId = req.user!.id;

        let preview;
        if (previewJobId) {
            const stored = await spotifyImportService.getPreviewResult(previewJobId);
            if (!stored || stored.status !== "completed" || !stored.preview) {
                return res.status(400).json({
                    error: "Preview not ready or expired. Please generate a new preview.",
                });
            }
            if (stored.userId && stored.userId !== userId) {
                return res.status(403).json({ error: "Not authorized to use this preview" });
            }
            preview = stored.preview;
        } else {
            // No preview job: build the preview now
            const effectiveUrl =
                url?.trim() ||
                `https://open.spotify.com/playlist/${spotifyPlaylistId}`;

            const link = importableLink(effectiveUrl);
            if (!link) return refuseLink(res, effectiveUrl);

            if (link.platform === "deezer") {
                const deezerMatch = link.url.match(/playlist[\/:](\d+)/);
                if (!deezerMatch) {
                    return res
                        .status(400)
                        .json({ error: "Invalid Deezer playlist URL" });
                }
                const playlistId = deezerMatch[1];
                const deezerPlaylist = await withRetry(() => deezerService.getPlaylist(playlistId));
                if (!deezerPlaylist) {
                    return res
                        .status(404)
                        .json({ error: "Deezer playlist not found" });
                }
                preview = await spotifyImportService.generatePreviewFromDeezer(deezerPlaylist);
            } else if (link.platform !== "spotify") {
                preview = await spotifyImportService.generatePreviewFromExternalPlatform(link);
            } else {
                preview = await spotifyImportService.generatePreview(link.url);
            }
        }

        logger.debug(
            `[Spotify Import] Starting import for user ${userId}: ${playlistName}`
        );
        logger.debug(
            `[Spotify Import] Downloading ${albumMbidsToDownload.length} albums`
        );

        const job = await spotifyImportService.startImport(
            userId,
            spotifyPlaylistId,
            playlistName,
            albumMbidsToDownload,
            preview
        );

        res.json({
            jobId: job.id,
            status: job.status,
            message: "Import started",
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: "Invalid request body" });
        }
        safeError(res, "Spotify import", error);
    }
});

/**
 * GET /api/spotify/import/:jobId/status
 * Get the status of an import job
 */
router.get("/import/:jobId/status", async (req, res) => {
    try {
        const { jobId } = req.params;
        const userId = req.user!.id;

        const job = await getImportJob(jobId);
        if (!job) {
            return res.status(404).json({ error: "Import job not found" });
        }

        if (job.userId !== userId) {
            return res
                .status(403)
                .json({ error: "Not authorized to view this job" });
        }

        res.json(job);
    } catch (error) {
        safeError(res, "Spotify job status", error);
    }
});

/**
 * GET /api/spotify/imports
 * Get all import jobs for the current user
 */
router.get("/imports", async (req, res) => {
    try {
        const userId = req.user!.id;
        const jobs = await spotifyImportService.getUserJobs(userId);
        res.json(jobs);
    } catch (error) {
        safeError(res, "Spotify imports", error);
    }
});

/**
 * POST /api/spotify/import/:jobId/refresh
 * Re-match pending tracks and add newly downloaded ones to the playlist
 */
router.post("/import/:jobId/refresh", async (req, res) => {
    try {
        const { jobId } = req.params;
        const userId = req.user!.id;

        const job = await getImportJob(jobId);
        if (!job) {
            return res.status(404).json({ error: "Import job not found" });
        }

        if (job.userId !== userId) {
            return res
                .status(403)
                .json({ error: "Not authorized to refresh this job" });
        }

        const result = await spotifyImportService.refreshJobMatches(jobId);

        res.json({
            message:
                result.added > 0
                    ? `Added ${result.added} newly downloaded track(s)`
                    : "No new tracks found yet. Albums may still be downloading.",
            added: result.added,
            total: result.total,
        });
    } catch (error) {
        safeError(res, "Spotify refresh", error);
    }
});

/**
 * POST /api/spotify/import/:jobId/cancel
 * Cancel an import job and clean up all artifacts
 */
router.post("/import/:jobId/cancel", async (req, res) => {
    try {
        const { jobId } = req.params;
        const userId = req.user!.id;

        const job = await getImportJob(jobId);
        if (!job) {
            return res.status(404).json({ error: "Import job not found" });
        }

        if (job.userId !== userId) {
            return res
                .status(403)
                .json({ error: "Not authorized to cancel this job" });
        }

        const result = await spotifyImportService.cancelJob(jobId);

        res.json({
            message: result.playlistCreated
                ? `Import cancelled. Playlist created with ${result.tracksMatched} track(s).`
                : "Import cancelled.",
            playlistId: result.playlistId,
            tracksMatched: result.tracksMatched,
        });
    } catch (error) {
        safeError(res, "Spotify cancel", error);
    }
});

const m3uImportLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 5,
    message: { error: "Too many M3U imports, please wait a minute" },
});

/**
 * POST /api/spotify/import/m3u
 * Upload an M3U file, parse it, match tracks against library, create playlist.
 */
router.post("/import/m3u", requireMusicPermission("canRequestAlbums"), requireMusicPermission("canDownloadTracks"), m3uImportLimiter, (req, res, next) => {
    m3uUpload.single("file")(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: err.message });
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });

        const playlistName = req.body.playlistName?.trim();
        if (!playlistName || playlistName.length > 200) {
            return res.status(400).json({ error: "playlistName is required (1-200 chars)" });
        }

        const content = req.file.buffer.toString("utf-8");
        const entries = parseM3U(content);

        if (entries.length === 0) {
            return res.status(400).json({ error: "M3U file contains no entries" });
        }

        const result = await spotifyImportService.importFromM3U(
            req.user!.id,
            playlistName,
            entries,
        );

        res.json(result);
    } catch (error: any) {
        if (error.message?.includes("exceeds maximum") || error.message?.includes("null bytes")) {
            return res.status(400).json({ error: error.message });
        }
        safeError(res, "M3U import", error);
    }
});

/**
 * GET /api/spotify/import/session-log
 * Get the current session log for debugging import issues
 */
router.get("/import/session-log", async (_req, res) => {
    try {
        const log = readSessionLog();
        const logPath = getSessionLogPath();

        res.json({
            path: logPath,
            content: log,
        });
    } catch (error) {
        safeError(res, "Session log", error);
    }
});

export default router;
