import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import {
    getUnifiedDownloadOverview,
    MAX_DOWNLOAD_OFFSET,
    MAX_DOWNLOAD_PAGE_SIZE,
} from "../services/unifiedDownloadOverview";
import { logger } from "../utils/logger";

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

export default router;
