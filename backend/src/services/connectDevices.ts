/**
 * Kima Connect phase 1: short-lived, user-scoped browser player presence.
 *
 * Redis owns the ephemeral registry and single-delivery command slot. No personal
 * installation paths, media data or API tokens are stored. This is deliberately
 * separate from persistent DeviceLinkCode (native app API-key pairing).
 */
import { redisClient } from "../utils/redis";
import { randomUUID } from "crypto";

export type ConnectPlaybackStatus = "idle" | "paused" | "playing";
export type ConnectCommandType = "pause" | "next" | "previous";

export interface ConnectDevice {
    id: string;
    name: string;
    status: ConnectPlaybackStatus;
    trackTitle: string | null;
    lastSeen: number;
}

export interface ConnectCommand {
    id: string;
    type: ConnectCommandType;
    createdAt: number;
}

const PRESENCE_SECONDS = 45;
const COMMAND_SECONDS = 20;
const INDEX_SECONDS = 120;
const MAX_DEVICES = 12;

const indexKey = (userId: string) => "connect:devices:" + userId;
const deviceKey = (userId: string, id: string) => "connect:device:" + userId + ":" + id;
const commandKey = (userId: string, id: string) => "connect:command:" + userId + ":" + id;

function staleBefore(now: number): number {
    return now - PRESENCE_SECONDS * 1000;
}

/** Scope every lookup to the authenticated owner, not a name or device-provided user ID. */
export async function listConnectDevices(userId: string, now = Date.now()): Promise<ConnectDevice[]> {
    const ids = await redisClient.zrangebyscore(indexKey(userId), staleBefore(now) + 1, "+inf");
    if (!ids.length) return [];
    const raw = await redisClient.mget(...ids.map(id => deviceKey(userId, id)));
    return raw.flatMap((json, index) => {
        if (!json) return [];
        try {
            const device = JSON.parse(json) as ConnectDevice;
            return device.id === ids[index] && device.lastSeen > staleBefore(now) ? [device] : [];
        } catch {
            return [];
        }
    }).sort((a, b) => b.lastSeen - a.lastSeen).slice(0, MAX_DEVICES);
}

export async function heartbeatConnectDevice(
    userId: string,
    device: Omit<ConnectDevice, "lastSeen">,
    now = Date.now()
): Promise<{ command: ConnectCommand | null; ttlSeconds: number }> {
    const index = indexKey(userId);
    await redisClient.zremrangebyscore(index, "-inf", staleBefore(now));
    const alreadyRegistered = await redisClient.zscore(index, device.id);
    if (alreadyRegistered === null && await redisClient.zcard(index) >= MAX_DEVICES) {
        throw new ConnectDeviceLimitError();
    }
    const stored: ConnectDevice = { ...device, lastSeen: now };
    await redisClient.multi()
        .zadd(index, now, device.id)
        .expire(index, INDEX_SECONDS)
        .set(deviceKey(userId, device.id), JSON.stringify(stored), "EX", PRESENCE_SECONDS)
        .exec();
    // GETDEL is atomic: repeated polls cannot execute a command twice.
    const raw = await redisClient.getdel(commandKey(userId, device.id));
    let command: ConnectCommand | null = null;
    if (raw) {
        try {
            const candidate = JSON.parse(raw) as ConnectCommand;
            if (
                typeof candidate.id === "string" &&
                (candidate.type === "pause" || candidate.type === "next" || candidate.type === "previous") &&
                typeof candidate.createdAt === "number" &&
                now - candidate.createdAt <= COMMAND_SECONDS * 1000
            ) command = candidate;
        } catch {
            // Malformed or expired commands are discarded, never executed.
        }
    }
    return { command, ttlSeconds: PRESENCE_SECONDS };
}

export class ConnectDeviceLimitError extends Error {
    constructor() { super("Too many active Kima Connect devices"); }
}

/** Commands never cross accounts and cannot target an expired browser session. */
export async function sendConnectCommand(
    userId: string,
    deviceId: string,
    type: ConnectCommandType,
    now = Date.now()
): Promise<ConnectCommand | null> {
    const lastSeen = await redisClient.zscore(indexKey(userId), deviceId);
    if (lastSeen === null || Number(lastSeen) <= staleBefore(now)) return null;
    if (!await redisClient.exists(deviceKey(userId, deviceId))) return null;
    const command: ConnectCommand = {
        id: randomUUID(),
        type,
        createdAt: now,
    };
    // One pending instruction per player. A newer user action replaces an older one.
    await redisClient.set(commandKey(userId, deviceId), JSON.stringify(command), "EX", COMMAND_SECONDS);
    return command;
}
