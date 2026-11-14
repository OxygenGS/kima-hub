/**
 * Authenticated, owner-scoped Kima Connect devices.
 * Phase 1 supports player discovery, remote pause and track navigation.
 * Browsers do not accept remote auto-play here: a local user gesture is required.
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import {
    ConnectDeviceLimitError, heartbeatConnectDevice, listConnectDevices, sendConnectCommand,
} from "../services/connectDevices";

import {
    MAX_HANDOFF_TRACKS, HandoffBusyError, HandoffStateError, HandoffUnavailableError,
    createConnectHandoff, getIncomingConnectHandoff, getOutgoingConnectHandoff, transitionConnectHandoff,
} from "../services/connectHandoff";

const router = Router();
router.use(requireAuth);

const deviceId = z.string().uuid();
const heartbeat = z.object({
    id: deviceId,
    name: z.string().trim().min(1).max(80),
    status: z.enum(["idle", "paused", "playing"]),
    trackTitle: z.string().trim().max(200).nullable(),
}).strict();

router.get("/devices", asyncHandler(async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    res.json({ devices: await listConnectDevices(req.user!.id) });
}));

router.post("/heartbeat", asyncHandler(async (req, res) => {
    const data = heartbeat.safeParse(req.body);
    if (!data.success) {
        res.status(400).json({ error: "Invalid player heartbeat" });
        return;
    }
    try {
        const result = await heartbeatConnectDevice(req.user!.id, data.data);
        res.set("Cache-Control", "private, no-store");
        res.json(result);
    } catch (error) {
        if (error instanceof ConnectDeviceLimitError) {
            res.status(429).json({ error: "Too many active players" });
            return;
        }
        throw error;
    }
}));

router.post("/devices/:id/command", asyncHandler(async (req, res) => {
    const id = deviceId.safeParse(req.params.id);
    const body = z.object({ type: z.enum(["pause", "next", "previous"]) }).strict().safeParse(req.body);
    if (!id.success || !body.success) {
        res.status(400).json({ error: "Invalid device command" });
        return;
    }
    const command = await sendConnectCommand(req.user!.id, id.data, body.data.type);
    if (!command) {
        res.status(404).json({ error: "Player is no longer online" });
        return;
    }
    res.set("Cache-Control", "private, no-store");
    res.status(202).json({ queued: true, commandId: command.id });
}));

// Explicit handoff: a receiver always opts in locally. Nothing remotely auto-plays.
const trackId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const offerSchema = z.object({
    sourceDeviceId: deviceId,
    targetDeviceId: deviceId,
    trackIds: z.array(trackId).min(1).max(MAX_HANDOFF_TRACKS),
    currentIndex: z.number().int().min(0).max(MAX_HANDOFF_TRACKS - 1),
    positionSeconds: z.number().finite().min(0).max(86_400),
}).strict().refine(data => data.currentIndex < data.trackIds.length);

router.post("/handoffs", asyncHandler(async (req, res) => {
    const data = offerSchema.safeParse(req.body);
    if (!data.success) {
        res.status(400).json({ error: "Invalid handoff request" });
        return;
    }
    try {
        const offer = await createConnectHandoff(req.user!.id, data.data);
        res.set("Cache-Control", "private, no-store");
        res.status(201).json(offer);
    } catch (error) {
        if (error instanceof HandoffBusyError) {
            res.status(409).json({ error: "An active transfer must finish or expire first" });
        } else if (error instanceof HandoffUnavailableError) {
            res.status(404).json({ error: "Source or target player unavailable" });
        } else throw error;
    }
}));

router.get("/handoffs/incoming/:deviceId", asyncHandler(async (req, res) => {
    const parsed = deviceId.safeParse(req.params.deviceId);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid device" });
        return;
    }
    res.set("Cache-Control", "private, no-store");
    res.json({ handoff: await getIncomingConnectHandoff(req.user!.id, parsed.data) });
}));

router.get("/handoffs/outgoing/:deviceId", asyncHandler(async (req, res) => {
    const parsed = deviceId.safeParse(req.params.deviceId);
    if (!parsed.success) {
        res.status(400).json({ error: "Invalid device" });
        return;
    }
    res.set("Cache-Control", "private, no-store");
    res.json({ handoff: await getOutgoingConnectHandoff(req.user!.id, parsed.data) });
}));

// Only the intended receiver may confirm playback; only the source may
// cancel or acknowledge receiving the confirmation.
router.post("/handoffs/:id/:action", asyncHandler(async (req, res) => {
    const id = deviceId.safeParse(req.params.id);
    const action = z.enum(["started", "declined", "cancelled", "observed"]).safeParse(req.params.action);
    const body = z.object({ deviceId }).strict().safeParse(req.body);
    if (!id.success || !action.success || !body.success) {
        res.status(400).json({ error: "Invalid handoff transition" });
        return;
    }
    try {
        const status = await transitionConnectHandoff(
            req.user!.id, id.data, body.data.deviceId, action.data,
        );
        res.set("Cache-Control", "private, no-store");
        res.json({ status });
    } catch (error) {
        if (error instanceof HandoffUnavailableError) {
            res.status(404).json({ error: "Handoff unavailable or expired" });
        } else if (error instanceof HandoffStateError) {
            res.status(409).json({ error: "Handoff already changed" });
        } else throw error;
    }
}));

export default router;
