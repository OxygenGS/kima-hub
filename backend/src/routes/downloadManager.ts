import { Router } from "express";
import { requireAuth, requireMusicPermission } from "../middleware/auth";
import {
    getUnifiedDownloadOverview,
    MAX_DOWNLOAD_OFFSET,
    MAX_DOWNLOAD_PAGE_SIZE,
} from "../services/unifiedDownloadOverview";
import { logger } from "../utils/logger";
import { getBoundDowntifyQueue } from "../services/downtifyBoundQueue";
import { parseSpotifyDownloadLink } from "../services/spotifyLinkIntake";
import { checkSpotifyLibraryEvidence } from "../services/spotifyLibraryEvidence";
import { dispatchPreparedSpotifyTrack, getDispatchCapability } from "../services/downtifyTrackDispatch";
import { getReconciliationCapability, verifyRemoteSpotifyIntent } from "../services/downtifyDispatchReconciliation";
import {
    prepareSpotifyIntent,
    getSavedSpotifyIntents,
    MAX_SPOTIFY_INTENT_PAGE_SIZE,
    MAX_SPOTIFY_INTENT_OFFSET,
} from "../services/spotifyIntentRegistry";

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


/**
 * Single-bound-user, read-only remote queue. If no verified mapping exists,
 * nothing about other Downtify accounts or their jobs is returned.
 */
router.get("/downtify/jobs", requireAuth, async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    try {
        return res.json(await getBoundDowntifyQueue(req.user.id));
    } catch {
        return res.status(503).json({
            state: "unavailable", items: [], displayed: 0, hasMore: false,
        });
    }
});


/**
 * Preview a Spotify link without resolving media or creating a download.
 * Require persisted track download permission even for the preparatory step.
 * This endpoint will never accept a user-supplied engine server address.
 */
router.post(
    "/spotify/preview",
    (_req, res, next) => {
        res.setHeader("Cache-Control", "no-store");
        next();
    },
    requireAuth,
    requireMusicPermission("canDownloadTracks"),
    (req, res) => {
        const input = req.body !== null && typeof req.body === "object" &&
            !Array.isArray(req.body) ? req.body.url : undefined;
        const preview = parseSpotifyDownloadLink(input);
        if (!preview) {
            return res.status(400).json({
                error: "Unsupported Spotify track, album or playlist link",
            });
        }

        // Nothing was checked against a music library or remote download queue.
        // No network request, queue entry or filesystem operation occurs here.
        return res.json(preview);
    }
);




/**
 * Explicit, read-only recording check: one Spotify track ID -> provider ISRC
 * -> indexed LIBRARY track -> real, non-empty file within MUSIC_PATH.
 * Album and playlist links report not_supported, not "not in library".
 * Do not expose raw upstream metadata, full paths or filesystem errors.
 */
router.post(
    "/spotify/check-library",
    requireAuth,
    requireMusicPermission("canDownloadTracks"),
    async (req, res) => {
        res.setHeader("Cache-Control", "no-store");
        if (!req.user) return res.status(401).json({ error: "Not authenticated" });
        const input = req.body !== null && typeof req.body === "object" &&
            !Array.isArray(req.body) ? req.body.url : undefined;
        try {
            const result = await checkSpotifyLibraryEvidence(input);
            if (!result) return res.status(400).json({ error: "Unsupported Spotify link" });
            return res.json(result);
        } catch {
            // A provider/db/filesystem outage is not proof a recording is absent.
            return res.status(503).json({ error: "Library verification unavailable" });
        }
    }
);

/**
 * Saved-request status is not an engine queue and not proof of library files.
 * Disabled mode returns an empty capability response without touching Prisma.
 */
router.get(
    "/spotify/intents",
    requireAuth,
    (_req, res, next) => {
        res.setHeader("Cache-Control", "no-store");
        if (process.env.KIMA_SPOTIFY_INTENTS_ENABLED !== "true") {
            return res.json({
                enabled: false, items: [], displayed: 0, total: 0,
                limit: 20, offset: 0, hasMore: false, isDownloadQueue: false,
            });
        }
        next();
    },
    requireMusicPermission("canDownloadTracks"),
    async (req, res) => {
        if (!req.user) return res.status(401).json({ error: "Not authenticated" });
        const limit = safeInt(req.query.limit, 20, MAX_SPOTIFY_INTENT_PAGE_SIZE);
        const offset = safeInt(req.query.offset, 0, MAX_SPOTIFY_INTENT_OFFSET);
        if (limit === null || offset === null) {
            return res.status(400).json({ error: "Invalid pagination" });
        }
        try {
            return res.json(await getSavedSpotifyIntents(req.user.id, limit, offset));
        } catch {
            return res.status(503).json({ error: "Unable to load prepared requests" });
        }
    },
);

/**
 * Staged, default-OFF durable Spotify request preparation.
 *
 * A prepared intent is not a job. No downloader is called, even when a
 * request already exists; atomic uniqueness only prevents duplicate
 * preparation rows for the SAME user and SAME Spotify resource.
 */
router.post(
    "/spotify/intents",
    requireAuth,
    (_req, res, next) => {
        res.setHeader("Cache-Control", "no-store");
        if (process.env.KIMA_SPOTIFY_INTENTS_ENABLED !== "true") {
            return res.status(404).json({ error: "Spotify intent preparation unavailable" });
        }
        next();
    },
    requireMusicPermission("canDownloadTracks"),
    async (req, res) => {
        if (!req.user) return res.status(401).json({ error: "Not authenticated" });
        const input = req.body !== null && typeof req.body === "object" &&
            !Array.isArray(req.body) ? req.body.url : undefined;
        try {
            const prepared = await prepareSpotifyIntent(req.user.id, input);
            if (!prepared) {
                return res.status(400).json({
                    error: "Unsupported Spotify track, album or playlist link",
                });
            }
            return res.status(prepared.alreadyPrepared ? 200 : 201).json(prepared);
        } catch {
            // Never reflect database errors, bearer tokens, SQL, or private URLs.
            return res.status(503).json({ error: "Unable to prepare Spotify request" });
        }
    }
);


/**
 * D3: owner-only explicit remote status check. Completely independent of the
 * D2 submission toggle, read-only and disabled in production by default.
 */
router.get(
    "/spotify/reconciliation-capability",
    requireAuth,
    requireMusicPermission("canDownloadTracks"),
    (req, res) => {
        res.setHeader("Cache-Control", "no-store");
        if (!req.user) return res.status(401).json({ error: "Not authenticated" });
        return res.json(getReconciliationCapability(req.user.id));
    },
);

router.get(
    "/spotify/intents/:intentId/remote-status",
    requireAuth,
    requireMusicPermission("canDownloadTracks"),
    async (req, res) => {
        res.setHeader("Cache-Control", "no-store");
        if (!req.user) return res.status(401).json({ error: "Not authenticated" });
        if (!getReconciliationCapability(req.user.id).canCheck) {
            return res.status(404).json({ error: "Remote verification unavailable" });
        }
        try {
            const result = await verifyRemoteSpotifyIntent(req.user.id, req.params.intentId);
            if (result.state === "not_found") return res.status(404).json(result);
            // A remote transfer is not an indexed, imported or playable track.
            return res.json(result);
        } catch {
            return res.status(503).json({ error: "Remote verification unavailable; do not retry submission" });
        }
    },
);

/**
 * Read-only dispatch capability. This reveals no token, remote account ID,
 * server address, music path or matching user's identity.
 */
router.get(
    "/spotify/dispatch-capability",
    requireAuth,
    requireMusicPermission("canDownloadTracks"),
    (req, res) => {
        res.setHeader("Cache-Control", "no-store");
        if (!req.user) return res.status(401).json({ error: "Not authenticated" });
        return res.json(getDispatchCapability(req.user.id));
    },
);

/**
 * Explicit single-track submission only. Default OFF; operator must pin the
 * exact Downtify server ID and remote user's numeric ID before any write.
 * A caller cannot supply a Downtify URL, other user's ID, or arbitrary song.
 */
router.post(
    "/spotify/intents/:intentId/submit",
    requireAuth,
    requireMusicPermission("canDownloadTracks"),
    async (req, res) => {
        res.setHeader("Cache-Control", "no-store");
        if (!req.user) return res.status(401).json({ error: "Not authenticated" });
        const capability = getDispatchCapability(req.user.id);
        if (!capability.canSubmit) {
            return res.status(404).json({ error: "Downtify submission not available" });
        }

        const body = req.body && typeof req.body === "object" &&
            !Array.isArray(req.body) ? req.body : {};
        const ack = body.acknowledgeUnverified === true;
        try {
            const result = await dispatchPreparedSpotifyTrack(req.user.id, req.params.intentId, ack);
            if (result.state === "submitted") return res.status(202).json(result);
            if (result.state === "already_in_remote_queue") return res.status(200).json(result);
            // A timed-out HTTP response does NOT prove the remote job absent.
            // Return a non-retriable application status and preserve DB claim.
            if (result.state === "dispatch_unknown") return res.status(202).json(result);
            if (result.state === "confirmation_required") return res.status(400).json(result);
            if (result.state === "not_found") return res.status(404).json(result);
            if (result.state === "remote_unavailable" ||
                result.state === "remote_unauthorized" ||
                result.state === "remote_incompatible") return res.status(503).json(result);
            return res.status(409).json(result);
        } catch {
            // An unexpected storage error might happen after a remote POST.
            // Never echo secrets, errors or paths and never advertise retry.
            return res.status(503).json({ error: "Submission state unavailable; do not retry automatically" });
        }
    },
);

export default router;
