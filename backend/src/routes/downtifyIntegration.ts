/**
 * Admin-only Downtify pairing. No endpoint accepts an arbitrary path or
 * changes music files; no plaintext token leaves the backend. Tests use
 * outbound GET requests only, and a saved pairing starts completely OFF.
 */
import { Router } from "express";
import { z } from "zod";
import { requireAdmin } from "../middleware/auth";
import {
    DowntifySetupError, getDowntifyAdminStatus, pairDowntify,
    testSavedDowntifyPair, updateDowntifyControls, verifyDowntifyPair,
} from "../services/downtifyIntegrationSettings";

const router = Router();
router.use(requireAdmin);
router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
});

const pairingSchema = z.object({
    baseUrl: z.string().trim().min(7).max(1024),
    deviceToken: z.string().min(21).max(517).regex(/^dtfy_[A-Za-z0-9_-]{16,512}$/),
}).strict();
const controlSchema = z.object({
    enabled: z.boolean(),
    spotifyIntentsEnabled: z.boolean(),
    trackSubmissionEnabled: z.boolean(),
    reconciliationEnabled: z.boolean(),
    acknowledgeTrackSubmission: z.boolean().optional(),
}).strict();

function handleError(res: import("express").Response, err: unknown) {
    if (err instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid Downtify configuration" });
    }
    if (err instanceof DowntifySetupError) {
        const status =
            err.state === "environment_managed" ? 409 :
            err.state === "confirmation_required" ? 409 :
            err.state === "not_paired" ? 404 :
            err.state === "unauthorized" ? 403 :
            err.state === "unavailable" ? 503 : 400;
        return res.status(status).json({ state: err.state });
    }
    // Never serialize exception messages, axios config, URLs or tokens.
    return res.status(503).json({ state: "unavailable" });
}

router.get("/", async (req, res) => {
    if (!req.user) return res.status(401).json({ state: "unauthorized" });
    try {
        return res.json(await getDowntifyAdminStatus(req.user.id));
    } catch (err) {
        return handleError(res, err);
    }
});

/** Read-only server/account probe: accepts candidate or a saved pairing. */
router.post("/test", async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ state: "unauthorized" });
        const candidate = req.body ?? {};
        if (typeof candidate !== "object" || Array.isArray(candidate)) {
            return res.status(400).json({ state: "invalid_input" });
        }
        const result = Object.keys(candidate).length === 0
            ? await testSavedDowntifyPair(req.user.id)
            : await verifyDowntifyPair(pairingSchema.parse(candidate));
        // Version is a public string; never return token, account IDs, URL,
        // server ID or arbitrary remote payloads.
        return res.json({
            state: "connected", version: result.version,
            // Exact identity stored server-side when /pair is called.
            identityVerified: true,
        });
    } catch (err) {
        return handleError(res, err);
    }
});

/** Tests, pins owner ID, encrypts token and saves every feature OFF. */
router.post("/pair", async (req, res) => {
    if (!req.user) return res.status(401).json({ state: "unauthorized" });
    try {
        const candidate = pairingSchema.parse(req.body);
        await pairDowntify(req.user.id, candidate);
        return res.status(201).json(await getDowntifyAdminStatus(req.user.id));
    } catch (err) {
        return handleError(res, err);
    }
});

/** Exactly four booleans. Track submission requires an explicit warning ACK. */
router.post("/controls", async (req, res) => {
    if (!req.user) return res.status(401).json({ state: "unauthorized" });
    try {
        const input = controlSchema.parse(req.body);
        const { acknowledgeTrackSubmission, ...controls } = input;
        return res.json(await updateDowntifyControls(
            req.user.id, controls, acknowledgeTrackSubmission,
        ));
    } catch (err) {
        return handleError(res, err);
    }
});

export default router;
