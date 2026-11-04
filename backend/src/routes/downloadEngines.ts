import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { probeDowntify } from "../services/downtifyClient";

const router = Router();

// Administrative diagnostics only in phase A. No user download list, no
// credentials, no mutation and no engine-side import or queue changes.
router.use(requireAuth, requireAdmin);
router.get("/downtify/status", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const status = await probeDowntify();
    res.json(status);
});

export default router;
