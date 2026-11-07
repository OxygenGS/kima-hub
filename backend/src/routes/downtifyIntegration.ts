/**
 * Admin-only Downtify pairing. No endpoint accepts an arbitrary path or
 * changes music files; no plaintext token leaves the backend. Tests use
 * outbound GET requests only, and a saved pairing starts completely OFF.
 */
import { Router } from "express";
import { getDowntifyRuntimeEnv } from "../services/downtifyIntegrationSettings";
import { inspectNativeDowntifyImport } from "../services/downtifyNativeImportPreflight";
import {
    getNativeAutoImportStatus, setNativeAutoImport, NativeImportSetupError,
} from "../services/downtifyNativeAutoImportSettings";
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

/**
 * Read-only transport and storage feasibility. It cannot copy/download an
 * entire file or start the native importer, and returns no paths or secrets.
 * Frontend controls may not treat this as safe importer-cutover approval.
 */
router.get("/import-readiness", async (req, res) => {
    if (!req.user) return res.status(401).json({ state: "unbound" });
    try {
        const env = await getDowntifyRuntimeEnv();
        return res.json(await inspectNativeDowntifyImport(req.user.id, env));
    } catch {
        return res.status(503).json({ state: "unavailable",
            autoImportAvailable: false, importerCutoverAuthorized: false,
            libraryImportVerified: false, filesChanged: false });
    }
});

/**
 * Normal one-switch native importer controls. A new enable requires an
 * explicit one-time single-writer acknowledgement; no browser path, token
 * or free-form command is accepted.
 */
router.get("/native-import", async (req, res) => {
    if (!req.user) return res.status(401).json({ state: "unpaired" });
    try {
        return res.json(await getNativeAutoImportStatus(req.user.id));
    } catch {
        return res.status(503).json({ state: "unavailable", enabled: false });
    }
});

router.post("/native-import", async (req, res) => {
    if (!req.user) return res.status(401).json({ state: "unpaired" });
    const schema = z.object({
        enabled: z.boolean(),
        acknowledgeSingleWriter: z.boolean(),
    }).strict();
    try {
        const body = schema.parse(req.body);
        return res.json(await setNativeAutoImport(
            req.user.id, body.enabled, body.acknowledgeSingleWriter,
        ));
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ state: "invalid_input" });
        }
        if (err instanceof NativeImportSetupError) {
            const status = err.state === "unauthorized" ? 403 :
                err.state === "not_paired" ? 404 :
                err.state === "source_unavailable" ? 503 : 409;
            return res.status(status).json({ state: err.state });
        }
        return res.status(503).json({ state: "unavailable" });
    }
});

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
