import { Router } from "express";
import { requireAuth, requireMusicPermission } from "../middleware/auth";
import {
    getUnifiedDownloadOverview,
    MAX_DOWNLOAD_OFFSET,
    MAX_DOWNLOAD_PAGE_SIZE,
} from "../services/unifiedDownloadOverview";
import { logger } from "../utils/logger";
import { getBoundDowntifyQueue } from "../services/downtifyBoundQueue";
import { parseSpotifyDownloadLink } from "../services/spotifyLinkIntake";

const router = Router();

function safeInt(raw: unknown, fallback: number, max: number): number | null {
    if (raw === undefined) return fallback;
    if (typeof raw !== "string" || !/^\d{1,4}$/.test(raw)) return null;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < (max === MAX_DOWNLOAD_OFFSET ? 0 : 1) || value > max) {
        return null;
    }
    return value;
}

/** Only a read-only caller-owned job feed. No Downtify job attribution yet. */
router.get("/jobs", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const limit = safeInt(req.query.limit, 50, MAX_DOWNLOAD_PAGE_SIZE);
    const offset = safeInt(req.query.offset, 0, MAX_DOWNLOAD_OFFSET);
    if (limit === null || offset === null) {
        return res.status(400).json({ error: "Invalid pagination" });
    }

    // requireAuth supplies this identity. Never accept userId from a query.
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    try {
        return res.json(await getUnifiedDownloadOverview(req.user.id, limit, offset));
    } catch (error) {
        logger.error("Unable to load scoped download overview:", error);
        return res.status(500).json({ error: "Unable to load download overview" });
    }
});


/**
 * Single-bound-user, read-only remote queue. If no verified mapping exists,
 * nothing about other Downtify accounts or their jobs is returned.
 */
router.get("/downtify/jobs", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    try {
        return res.json(await getBoundDowntifyQueue(req.user.id));
    } catch {
        return res.status(503).json({
            state: "unavailable", items: [], displayed: 0, hasMore: false,
        });
    }
});


/**
 * Preview a Spotify link without resolving media or creating a download.
 * Require persisted track download permission even for the preparatory step.
 * This endpoint will never accept a user-supplied engine server address.
 */
router.post(
    "/spotify/preview",
    (_req, res, next) => {
        res.setHeader("Cache-Control", "no-store");
        next();
    },
    requireAuth,
    requireMusicPermission("canDownloadTracks"),
    (req, res) => {
        const input = req.body !== null && typeof req.body === "object" &&
            !Array.isArray(req.body) ? req.body.url : undefined;
        const preview = parseSpotifyDownloadLink(input);
        if (!preview) {
            return res.status(400).json({
                error: "Unsupported Spotify track, album or playlist link",
            });
        }

        // Nothing was checked against a music library or remote download queue.
        // No network request, queue entry or filesystem operation occurs here.
        return res.json(preview);
    }
);

export default router;
