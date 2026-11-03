import { Router } from "express";
import { requireAdmin } from "../../middleware/auth";
import { getLibraryDoctorReport } from "../../services/libraryDoctor";
import { getSmartDownloadInbox } from "../../services/smartDownloadInbox";
import { getSmartImportSuggestion } from "../../services/smartImportSuggestion";
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

// GET /api/library/doctor/inbox/:jobId/suggestion is read-only and caller-scoped.
router.get("/doctor/inbox/:jobId/suggestion", requireAdmin, async (req, res) => {
    try {
        res.set("Cache-Control", "private, no-store");
        const suggestion = await getSmartImportSuggestion(req.user!.id, req.params.jobId);
        if (!suggestion) return res.status(404).json({ error: "Download not found" });
        return res.json(suggestion);
    } catch (error) {
        logger.error("[SmartInbox] Suggestion lookup failed", error);
        return res.status(500).json({ error: "Failed to inspect import suggestion" });
    }
});

export default router;
