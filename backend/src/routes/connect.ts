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

export default router;
