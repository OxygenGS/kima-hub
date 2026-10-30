import { Router } from "express";
import { z } from "zod";
import { requireAuthOrToken } from "../middleware/auth";
import { generateSmartDj } from "../services/smartDj";
import { logger } from "../utils/logger";

const router = Router();
router.use(requireAuthOrToken);

const optionsSchema = z.object({
    preset: z.enum(["flow", "explore", "focus", "energy"]).default("flow"),
    limit: z.number().int().min(5).max(30).default(25),
    seedTrackId: z.string().trim().min(1).max(128).optional(),
    excludeIds: z.array(z.string().trim().min(1).max(128)).max(120).default([]),
}).strict();

/** No writes or playback side effects: the listener decides whether to play. */
router.post("/next", async (req, res) => {
    const parsed = optionsSchema.safeParse(req.body || {});
    if (!parsed.success) {
        return res.status(400).json({ error: "Invalid Smart DJ options" });
    }
    try {
        const response = await generateSmartDj(req.user!.id, parsed.data);
        return res.json(response);
    } catch (error) {
        logger.error("[SmartDJ] Could not generate personal queue", error);
        return res.status(500).json({ error: "Could not generate Smart DJ queue" });
    }
});
export default router;
