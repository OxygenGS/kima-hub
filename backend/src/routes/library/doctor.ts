import { Router } from "express";
import { requireAdmin } from "../../middleware/auth";
import { getLibraryDoctorReport } from "../../services/libraryDoctor";
import { getSmartDownloadInbox } from "../../services/smartDownloadInbox";
import { logger } from "../../utils/logger";

const router = Router();

// GET /api/library/doctor/report — admin-only, read-only, on demand.
// This is deliberately separate from a scan or any repair operation.
router.get("/doctor/report", requireAdmin, async (_req, res) => {
    try {
        res.set("Cache-Control", "private, no-store");
        res.json(await getLibraryDoctorReport());
    } catch (error) {
        logger.error("[LibraryDoctor] Report failed", error);
        res.status(500).json({ error: "Failed to inspect the library" });
    }
});

// GET /api/library/doctor/inbox — admin-only and scoped to the caller.
router.get("/doctor/inbox", requireAdmin, async (req, res) => {
    try {
        res.set("Cache-Control", "private, no-store");
        res.json(await getSmartDownloadInbox(req.user!.id));
    } catch (error) {
        logger.error("[SmartInbox] Report failed", error);
        res.status(500).json({ error: "Failed to inspect Soulseek imports" });
    }
});

export default router;
