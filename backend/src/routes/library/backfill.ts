import { Router } from "express";
import { requireAdmin } from "../../middleware/auth";
import { logger } from "../../utils/logger";
import {
  isImageBackfillNeeded,
  getImageBackfillProgress,
  backfillAllImages,
} from "../../services/imageBackfill";

import {
  getAlbumCoverRecoveryStatus,
  startAlbumCoverRecovery,
} from "../../services/albumCoverRecovery";

router.get("/album-cover-recovery/status", requireAdmin, (_req, res) => {
  res.json(getAlbumCoverRecoveryStatus());
});

router.post("/album-cover-recovery/start", requireAdmin, (_req, res) => {
  const started = startAlbumCoverRecovery();
  res.status(202).json({
    started,
    status: getAlbumCoverRecoveryStatus(),
  });
});

const router = Router();

router.get("/image-backfill/status", async (_req, res) => {
  try {
    const [status, progress] = await Promise.all([
      isImageBackfillNeeded(),
      getImageBackfillProgress(),
    ]);

    res.json({
      ...status,
      ...progress,
    });
  } catch (error: any) {
    logger.error("[ImageBackfill] Status check error:", error?.message);
    res.status(500).json({ error: "Failed to check status" });
  }
});

router.post("/image-backfill/start", requireAdmin, async (_req, res) => {
  try {
    const progress = getImageBackfillProgress();
    if (progress.inProgress) {
      return res.json({
        message: "Image backfill already in progress",
        status: "processing",
        progress,
      });
    }

    res.json({ message: "Image backfill started", status: "processing" });

    backfillAllImages().catch((error) => {
      logger.error("[ImageBackfill] Backfill failed:", error);
    });
  } catch (error: any) {
    logger.error("[ImageBackfill] Backfill trigger error:", error?.message);
    res.status(500).json({ error: "Failed to start image backfill" });
  }
});

export default router;
