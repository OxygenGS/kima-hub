import { Router } from "express";
import { requireAdmin } from "../../middleware/auth";
import { getLibraryDoctorReport } from "../../services/libraryDoctor";
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

export default router;
