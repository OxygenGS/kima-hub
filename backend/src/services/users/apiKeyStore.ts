/**
 * API keys: minting, listing, revoking and resolving them. The settings screen
 * (routes/apiKeys.ts) calls a row a key; the TV/mobile pairing flow
 * (routes/deviceLink.ts) calls the same row a device.
 * New keys also store an AEAD-encrypted copy for salted Subsonic login;
 * older keys stay valid through the original hash lookup.
 */

import crypto from "crypto";

import { prisma } from "../../utils/db";
import { encrypt, decrypt } from "../../utils/encryption";

/** Fields safe to hand back for an existing key -- never `key` itself. */
const PUBLIC_FIELDS = {
    id: true,
    name: true,
    lastUsed: true,
    createdAt: true,
} as const;

/** 32 bytes, hex-encoded: 64 characters, 256 bits of entropy. */
function generateApiKeyValue(): string {
    return crypto.randomBytes(32).toString("hex");
}

/**
 * SHA-256, deterministic and unsalted: a 256-bit server-generated token has no
 * dictionary to defend against, and every request needs an indexed lookup.
 * Must match the pgcrypto digest() used by the apikey_hash_at_rest migration.
 */
export function hashApiKey(key: string): string {
    return crypto.createHash("sha256").update(key).digest("hex");
}

/** A newly minted key; plaintext is returned only once. The database stores a SHA-256 digest and an encrypted copy for salted-token authentication. */
export interface CreatedApiKey {
    id: string;
    userId: string;
    name: string;
    lastUsed: Date;
    createdAt: Date;
    key: string;
}

/** Mint an independently revocable key; use the existing at-rest AEAD cipher for token-based clients. */
export async function createApiKey(userId: string, name: string): Promise<CreatedApiKey> {
    const key = generateApiKeyValue();
    const row = await prisma.apiKey.create({
        data: {
            userId,
            name,
            keyHash: hashApiKey(key),
            tokenSecretEncrypted: encrypt(key),
        },
    });
    return { id: row.id, userId: row.userId, name: row.name, lastUsed: row.lastUsed, createdAt: row.createdAt, key };
}

/** A user's keys without the secret: newest first for the settings screen, most recently used first for linked devices. */
export function listApiKeys(userId: string, orderBy: "createdAt" | "lastUsed" = "createdAt") {
    return prisma.apiKey.findMany({
        where: { userId },
        select: PUBLIC_FIELDS,
        orderBy: { [orderBy]: "desc" },
    });
}

/** Deletes the key only if the caller owns it; false when there was nothing of theirs to delete. */
export async function revokeApiKey(userId: string, keyId: string): Promise<boolean> {
    const deleted = await prisma.apiKey.deleteMany({ where: { id: keyId, userId } });
    return deleted.count > 0;
}

const TOUCH_INTERVAL_MS = 60_000;
const touchedAt = new Map<string, number>();

/** Last-used is shown on a settings screen, so minute granularity is enough and keeps a write off every request. */
function touchApiKey(apiKeyId: string): void {
    const last = touchedAt.get(apiKeyId) ?? 0;
    if (Date.now() - last < TOUCH_INTERVAL_MS) return;
    touchedAt.set(apiKeyId, Date.now());
    prisma.apiKey
        .update({ where: { id: apiKeyId }, data: { lastUsed: new Date() } })
        .catch(() => {});
}

/** The user a plaintext key belongs to, or null; a hit records the key as used. */
export async function findApiKeyUser(
    key: string,
): Promise<{ id: string; username: string; role: string } | null> {
    const row = await prisma.apiKey.findUnique({
        where: { keyHash: hashApiKey(key) },
        select: { id: true, user: { select: { id: true, username: true, role: true } } },
    });
    if (!row) return null;
    touchApiKey(row.id);
    return row.user;
}

/**
 * Verify standard Subsonic t=md5(appKey + salt), s=salt, without storing
 * the account password or exposing an app key in a response. Only keys issued
 * after the migration have an encrypted copy: old hash-only keys still work
 * with p= and apiKey=, but require reissuance for salted authentication.
 *
 * Validation is scoped to one indexed username and a bounded number of keys.
 * MD5 is dictated by the Subsonic protocol; app keys are 256-bit random values,
 * not reusable human passwords. The per-request salt prevents static hashes.
 */
export async function findApiKeyUserBySaltedToken(
    username: string,
    token: string,
    salt: string,
): Promise<{ id: string; username: string; role: string } | null> {
    const rows = await prisma.apiKey.findMany({
        where: { user: { username }, tokenSecretEncrypted: { not: null } },
        select: { id: true, tokenSecretEncrypted: true, user: { select: { id: true, username: true, role: true } } },
        take: 128,
    });
    const supplied = Buffer.from(token, "hex");
    let matched: (typeof rows)[number] | undefined;
    for (const row of rows) {
        // Decryption errors must fail closed: never fall back to weaker auth.
        const secret = decrypt(row.tokenSecretEncrypted!);
        const calculated = crypto.createHash("md5").update(secret + salt, "utf8").digest();
        if (crypto.timingSafeEqual(calculated, supplied)) matched = row;
    }
    if (!matched) return null;
    touchApiKey(matched.id);
    return matched.user;
}
