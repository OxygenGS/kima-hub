import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { probeDowntify } from "../services/downtifyClient";
import { inspectDowntifyStorage } from "../services/downtifyStoragePreflight";
import { getDowntifyRuntimeEnv } from "../services/downtifyIntegrationSettings";

const router = Router();

// Administrative diagnostics only in phase A. No user download list, no
// credentials, no mutation and no engine-side import or queue changes.
router.use(requireAuth, requireAdmin);
router.get("/downtify/status", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
        return res.json(await probeDowntify(await getDowntifyRuntimeEnv()));
    } catch {
        return res.status(503).json({ engine: "downtify", enabled: false,
            configured: false, state: "unavailable" });
    }
});


// Admin-only, explicitly enabled local storage topology inspection. No paths,
// device IDs, file names or secrets are returned. Never performs a write.
router.get("/downtify/storage-preflight", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
        return res.json(await inspectDowntifyStorage(await getDowntifyRuntimeEnv()));
    } catch {
        return res.status(503).json({ error: "Storage inspection unavailable" });
    }
});

export default router;
