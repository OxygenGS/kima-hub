/**
 * Project ONE / stage 2: explicit, short-lived playback handoff.
 *
 * A source offers only library track identifiers and an approximate seek position.
 * The target must explicitly press Play; the source stops only when the target
 * reports a matching *playing* audio-engine generation. Everything is account-
 * scoped in Redis. No file paths, tokens, artwork URLs or passwords are relayed.
 */
import { randomUUID } from "crypto";
import { redisClient } from "../utils/redis";
import type { ConnectDevice } from "./connectDevices";

const OFFER_SECONDS = 120;
const RECORD_SECONDS = 150;
const PRESENCE_MS = 45_000;
export const MAX_HANDOFF_TRACKS = 50;

export type HandoffStatus = "pending" | "started" | "declined" | "cancelled" | "observed";
export interface ConnectHandoff {
    id: string;
    sourceDeviceId: string;
    targetDeviceId: string;
    sourceName: string;
    trackTitle: string | null;
    sourceTrackId: string;
    trackIds: string[];
    currentIndex: number;
    positionSeconds: number;
    createdAt: number;
    expiresAt: number;
}
export interface HandoffView extends ConnectHandoff { status: HandoffStatus; }
export interface HandoffOffer {
    sourceDeviceId: string;
    targetDeviceId: string;
    trackIds: string[];
    currentIndex: number;
    positionSeconds: number;
}

export class HandoffUnavailableError extends Error {}
export class HandoffBusyError extends Error {}
export class HandoffStateError extends Error {}

const recordKey = (userId: string, id: string) => `connect:handoff:offer:${userId}:${id}`;
const statusKey = (userId: string, id: string) => `connect:handoff:status:${userId}:${id}`;
const sourceKey = (userId: string, id: string) => `connect:handoff:source:${userId}:${id}`;
const targetKey = (userId: string, id: string) => `connect:handoff:target:${userId}:${id}`;
const deviceKey = (userId: string, id: string) => `connect:device:${userId}:${id}`;

const VALID_STATUSES: ReadonlySet<string> = new Set(["pending", "started", "declined", "cancelled", "observed"]);
const releasePointerScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
end
return 0
`;
const transitionScript = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
    redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
    return 1
end
return 0
`;

async function releasePointer(key: string, offerId: string): Promise<void> {
    await redisClient.eval(releasePointerScript, 1, key, offerId);
}

async function liveDevice(userId: string, id: string, now: number): Promise<ConnectDevice | null> {
    const json = await redisClient.get(deviceKey(userId, id));
    if (!json) return null;
    try {
        const device = JSON.parse(json) as ConnectDevice;
        if (device.id !== id || !Number.isFinite(device.lastSeen) ||
            device.lastSeen <= now - PRESENCE_MS) return null;
        return device;
    } catch {
        return null;
    }
}

async function readOffer(userId: string, offerId: string): Promise<HandoffView | null> {
    const [raw, status] = await redisClient.mget(recordKey(userId, offerId), statusKey(userId, offerId));
    if (!raw || !status || !VALID_STATUSES.has(status)) return null;
    try {
        const request = JSON.parse(raw) as ConnectHandoff;
        return request.id === offerId ? { ...request, status: status as HandoffStatus } : null;
    } catch {
        return null;
    }
}

export async function createConnectHandoff(
    userId: string, offer: HandoffOffer, now = Date.now(),
): Promise<{ id: string; expiresAt: number }> {
    const { sourceDeviceId, targetDeviceId, trackIds, currentIndex, positionSeconds } = offer;
    if (sourceDeviceId === targetDeviceId || trackIds.length === 0 ||
        trackIds.length > MAX_HANDOFF_TRACKS || !trackIds[currentIndex] ||
        !Number.isFinite(positionSeconds)) {
        throw new HandoffUnavailableError("Invalid handoff request");
    }
    const [source, target] = await Promise.all([
        liveDevice(userId, sourceDeviceId, now),
        liveDevice(userId, targetDeviceId, now),
    ]);
    if (!source || !target || source.status !== "playing") {
        throw new HandoffUnavailableError("Both devices must be online and the source must be playing");
    }

    const id = randomUUID();
    const sourcePointer = sourceKey(userId, sourceDeviceId);
    const targetPointer = targetKey(userId, targetDeviceId);
    const acquiredSource = await redisClient.set(sourcePointer, id, "EX", OFFER_SECONDS, "NX");
    if (acquiredSource !== "OK") throw new HandoffBusyError("Source has a pending handoff");

    let acquiredTarget = false;
    try {
        const result = await redisClient.set(targetPointer, id, "EX", OFFER_SECONDS, "NX");
        if (result !== "OK") throw new HandoffBusyError("Target has a pending handoff");
        acquiredTarget = true;

        const request: ConnectHandoff = {
            id, sourceDeviceId, targetDeviceId,
            sourceName: source.name,
            trackTitle: source.trackTitle,
            sourceTrackId: trackIds[currentIndex],
            trackIds, currentIndex, positionSeconds,
            createdAt: now, expiresAt: now + OFFER_SECONDS * 1000,
        };
        const written = await redisClient.multi()
            .set(recordKey(userId, id), JSON.stringify(request), "EX", RECORD_SECONDS)
            .set(statusKey(userId, id), "pending", "EX", RECORD_SECONDS)
            .exec();
        if (!written) throw new Error("Unable to store handoff");
        return { id, expiresAt: request.expiresAt };
    } catch (error) {
        await releasePointer(sourcePointer, id);
        if (acquiredTarget) await releasePointer(targetPointer, id);
        throw error;
    }
}

/** Device ID is only a locator; the authenticated owner always scopes Redis keys. */
export async function getIncomingConnectHandoff(
    userId: string, targetDeviceId: string, now = Date.now(),
): Promise<HandoffView | null> {
    if (!await liveDevice(userId, targetDeviceId, now)) return null;
    const id = await redisClient.get(targetKey(userId, targetDeviceId));
    if (!id) return null;
    const offer = await readOffer(userId, id);
    return offer && offer.targetDeviceId === targetDeviceId &&
        offer.status === "pending" && now < offer.expiresAt ? offer : null;
}

/** The source bridge polls independently of its devices menu being open. */
export async function getOutgoingConnectHandoff(
    userId: string, sourceDeviceId: string, now = Date.now(),
): Promise<HandoffView | null> {
    if (!await liveDevice(userId, sourceDeviceId, now)) return null;
    const id = await redisClient.get(sourceKey(userId, sourceDeviceId));
    if (!id) return null;
    const offer = await readOffer(userId, id);
    return offer && offer.sourceDeviceId === sourceDeviceId && now < offer.expiresAt ? offer : null;
}

type Transition = "started" | "declined" | "cancelled" | "observed";
/** Atomic compare-and-set rejects double confirmations and late cancellation. */
export async function transitionConnectHandoff(
    userId: string, offerId: string, deviceId: string, to: Transition, now = Date.now(),
): Promise<HandoffStatus> {
    const offer = await readOffer(userId, offerId);
    if (!offer || now >= offer.expiresAt) throw new HandoffUnavailableError("Handoff expired");
    const isSource = to === "cancelled" || to === "observed";
    if ((isSource ? offer.sourceDeviceId : offer.targetDeviceId) !== deviceId) {
        throw new HandoffUnavailableError("Handoff not found");
    }
    if (!await liveDevice(userId, deviceId, now)) throw new HandoffUnavailableError("Device offline");

    const expected = to === "observed" ? "started" : "pending";
    if (offer.status !== expected) {
        if (offer.status === to) return offer.status; // Idempotent response for network retry.
        throw new HandoffStateError("Handoff already changed");
    }
    const changed = await redisClient.eval(
        transitionScript, 1, statusKey(userId, offerId), expected, to, RECORD_SECONDS,
    );
    if (Number(changed) !== 1) throw new HandoffStateError("Handoff already changed");

    if (to === "started" || to === "declined" || to === "cancelled") {
        await releasePointer(targetKey(userId, offer.targetDeviceId), offerId);
    }
    if (to === "observed" || to === "declined" || to === "cancelled") {
        await releasePointer(sourceKey(userId, offer.sourceDeviceId), offerId);
    }
    return to;
}
