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

/** A short-lived browser report; "handled" means the callback ran, not audible output. */
export type ConnectCommandOutcome = "handled" | "ignored";
export type ConnectCommandStatus = "queued" | ConnectCommandOutcome | "expired";
export interface ConnectCommandReceipt extends ConnectCommand {
    deviceId: string;
    status: "queued" | ConnectCommandOutcome;
    reportedAt?: number;
}
export type ConnectCommandView = Omit<ConnectCommandReceipt, "status"> & {
    status: ConnectCommandStatus;
};

const PRESENCE_SECONDS = 45;
const COMMAND_SECONDS = 20;
const RECEIPT_SECONDS = 90;
const INDEX_SECONDS = 120;
const MAX_DEVICES = 12;

const indexKey = (userId: string) => "connect:devices:" + userId;
const deviceKey = (userId: string, id: string) => "connect:device:" + userId + ":" + id;
const commandKey = (userId: string, id: string) => "connect:command:" + userId + ":" + id;
const receiptKey = (userId: string, id: string) => "connect:receipt:" + userId + ":" + id;

// Preserve the receipt's original expiry while atomically resolving a report.
const resolveReceiptScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
    redis.call('SET', KEYS[1], ARGV[2], 'KEEPTTL')
    return 1
end
return 0
`;

function parseReceipt(raw: string | null): ConnectCommandReceipt | null {
    if (!raw) return null;
    try {
        const record = JSON.parse(raw) as ConnectCommandReceipt;
        if (typeof record.id !== "string" || typeof record.deviceId !== "string" ||
            !Number.isFinite(record.createdAt) ||
            !["pause", "previous", "next"].includes(record.type) ||
            !["queued", "handled", "ignored"].includes(record.status)) return null;
        return record;
    } catch {
        return null;
    }
}


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
    // Keep receipt and delivery slot in one Redis transaction: a fast receiver
    // cannot acknowledge a command whose receipt has not been stored yet.
    // A newer command may replace an older undelivered slot. Older receipts
    // will be shown as unconfirmed once their twenty-second window expires.
    const receipt: ConnectCommandReceipt = { ...command, deviceId, status: "queued" };
    const result = await redisClient.multi()
        .set(receiptKey(userId, command.id), JSON.stringify(receipt), "EX", RECEIPT_SECONDS)
        .set(commandKey(userId, deviceId), JSON.stringify(command), "EX", COMMAND_SECONDS)
        .exec();
    if (!result || result.length !== 2 || result.some(([error]) => error !== null)) {
        throw new Error("Unable to queue remote command");
    }
    return command;
}

/** Inspect only receipts belonging to the authenticated account. */
export async function getConnectCommandReceipt(
    userId: string, commandId: string, now = Date.now(),
): Promise<ConnectCommandView | null> {
    const receipt = parseReceipt(await redisClient.get(receiptKey(userId, commandId)));
    if (!receipt || receipt.id !== commandId) return null;
    return {
        ...receipt,
        status: receipt.status === "queued" && now >= receipt.createdAt + COMMAND_SECONDS * 1000
            ? "expired" : receipt.status,
    };
}

/**
 * The addressed browser reports that its control callback ran, or that the
 * command was ignored because its player state no longer allowed the action.
 * This is a client acknowledgement, not proof of audible playback.
 */
export async function acknowledgeConnectCommand(
    userId: string, commandId: string, deviceId: string,
    outcome: ConnectCommandOutcome, now = Date.now(),
): Promise<ConnectCommandView | null> {
    const key = receiptKey(userId, commandId);
    const raw = await redisClient.get(key);
    const receipt = parseReceipt(raw);
    if (!receipt || receipt.id !== commandId || receipt.deviceId !== deviceId) return null;
    if (receipt.status !== "queued") {
        return receipt.status === outcome ? receipt : null; // idempotent retry
    }
    if (now >= receipt.createdAt + COMMAND_SECONDS * 1000) return null;
    const updated: ConnectCommandReceipt = { ...receipt, status: outcome, reportedAt: now };
    const applied = await redisClient.eval(
        resolveReceiptScript, 1, key, raw!, JSON.stringify(updated),
    );
    if (Number(applied) === 1) return updated;
    const current = parseReceipt(await redisClient.get(key));
    return current?.id === commandId && current.deviceId === deviceId &&
        current.status === outcome ? current : null;
}
