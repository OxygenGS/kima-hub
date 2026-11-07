/**
 * Durable, fail-closed claim ledger for a future native Downtify importer.
 *
 * This module does not contact Downtify, open files, schedule work, or
 * enable automatic imports. A worker must first independently verify the
 * pinned server/device identity and source recording. Old completed jobs
 * are recorded as "baseline" during initial activation, never imported.
 *
 * Every remote song ID is unique for one verified server and numeric
 * Downtify owner; separate Kima accounts cannot silently take ownership.
 * Once claimed, no automatic retry after worker crash, timeout, file write,
 * scan outage or uncertain outcome. Manual reconciliation is mandatory.
 */
import { randomUUID } from "crypto";
import { prisma } from "../utils/db";

export type NativeImportStatus =
    | "baseline" | "ready" | "claimed" | "published_pending_scan"
    | "imported" | "review" | "uncertain";
export type LedgerState =
    | "recorded" | "already_seen" | "blocked" | "invalid_snapshot" | "not_found"
    | "claimed" | "claimed_elsewhere" | "published_pending_scan"
    | "uncertain";

const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const SERVER_ID = /^[A-Za-z0-9_-]{8,128}$/;
const MAX_QUEUE_ROWS = 5000;
const MAX_QUEUE_BATCH = 5000;
const COMPLETED = "done";
const IMPORT_ROW_LIMIT = 100;
type RemoteJob = Record<string, unknown>;

export interface PinnedImportOwner {
    kimaUserId: string;
    remoteServerId: string;
    remoteUserId: number;
}
export interface NativeSongObservation {
    spotifyTrackId: string;
    /** The remote file path is deliberately NOT retained in this ledger. */
    source: "spotify";
}
export type Selection = {
    state: "ok" | "invalid_snapshot";
    songs: NativeSongObservation[];
    /** Ambiguous rows are rejected, never assumed to be distinct downloads. */
    ambiguous: number;
};

function record(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}
function validOwner(owner: PinnedImportOwner): boolean {
    return !!owner.kimaUserId && owner.kimaUserId.length <= 128 &&
        SERVER_ID.test(owner.remoteServerId) &&
        Number.isSafeInteger(owner.remoteUserId) &&
        owner.remoteUserId > 0 && owner.remoteUserId <= 2_147_483_647;
}

/** Read-only, bounded selection from a pinned and authenticated queue. */
export function selectOwnedCompletedSpotifyJobs(
    queue: unknown, remoteUserId: number,
): Selection {
    if (!Array.isArray(queue) || queue.length > MAX_QUEUE_ROWS ||
        !Number.isSafeInteger(remoteUserId) || remoteUserId <= 0) {
        return { state: "invalid_snapshot", songs: [], ambiguous: 0 };
    }
    const found = new Map<string, number>();
    for (const row of queue) {
        if (!record(row) || row.status !== COMPLETED ||
            !Array.isArray(row.user_ids) || !row.user_ids.includes(remoteUserId) ||
            !record(row.song)) continue;
        const songId = row.song.song_id;
        if ((row.song.source !== undefined && row.song.source !== "spotify") ||
            typeof songId !== "string" || !SPOTIFY_ID.test(songId)) continue;
        found.set(songId, (found.get(songId) ?? 0) + 1);
    }
    const songs: NativeSongObservation[] = [];
    let ambiguous = 0;
    for (const [spotifyTrackId, count] of found) {
        if (count === 1) songs.push({ spotifyTrackId, source: "spotify" });
        else ambiguous++;
    }
    return { state: "ok", songs: songs.slice(0, MAX_QUEUE_BATCH), ambiguous };
}

async function pinnedIdentity(owner: PinnedImportOwner): Promise<{
    paired: boolean; enabled: boolean; baselineAt: Date | null;
}> {
    if (!validOwner(owner)) return { paired: false, enabled: false, baselineAt: null };
    const row = await prisma.downtifyIntegration.findUnique({
        where: { id: "default" },
        select: {
            ownerKimaUserId: true, expectedServerId: true,
            expectedUserId: true, enabled: true,
            nativeImportEnabled: true, nativeImportBaselineAt: true,
        },
    });
    const paired = row?.ownerKimaUserId === owner.kimaUserId &&
        row.expectedServerId === owner.remoteServerId &&
        row.expectedUserId === owner.remoteUserId &&
        row.enabled === true;
    return {
        paired, enabled: paired && row?.nativeImportEnabled === true,
        baselineAt: paired ? row?.nativeImportBaselineAt || null : null,
    };
}

/**
 * Initial cutover preparation: atomically remembers every pre-existing
 * completed song as "baseline". All are excluded from future automation.
 *
 * The transaction either stores all observations and the baseline epoch, or
 * none. Repeating a successful call must never reset that baseline.
 *
 * Not called by an HTTP route or background scheduler in this release.
 */
export async function recordNativeBaseline(
    owner: PinnedImportOwner,
    queueSnapshot: unknown,
): Promise<{ state: LedgerState; count: number; ambiguous: number }> {
    const selection = selectOwnedCompletedSpotifyJobs(queueSnapshot, owner.remoteUserId);
    if (selection.state !== "ok" || !validOwner(owner)) {
        return { state: "invalid_snapshot", count: 0, ambiguous: 0 };
    }
    const identity = await pinnedIdentity(owner);
    if (!identity.paired || identity.enabled || identity.baselineAt) {
        return { state: "blocked", count: 0, ambiguous: selection.ambiguous };
    }
    try {
        const count = await prisma.$transaction(async tx => {
            const changed = await tx.downtifyIntegration.updateMany({
                where: {
                    id: "default", ownerKimaUserId: owner.kimaUserId,
                    expectedServerId: owner.remoteServerId,
                    expectedUserId: owner.remoteUserId,
                    enabled: true, nativeImportEnabled: false,
                    nativeImportBaselineAt: null,
                },
                data: { nativeImportBaselineAt: new Date() },
            });
            if (changed.count !== 1) throw new Error("baseline race");
            if (selection.songs.length === 0) return 0;
            const inserted = await tx.downtifyNativeImport.createMany({
                data: selection.songs.map(song => ({
                    ownerKimaUserId: owner.kimaUserId,
                    remoteServerId: owner.remoteServerId,
                    remoteUserId: owner.remoteUserId,
                    spotifyTrackId: song.spotifyTrackId,
                    status: "baseline",
                })),
                skipDuplicates: true,
            });
            return inserted.count;
        });
        return { state: "recorded", count, ambiguous: selection.ambiguous };
    } catch {
        return { state: "blocked", count: 0, ambiguous: selection.ambiguous };
    }
}

/** Persist *newly* completed songs only while native auto-import was enabled. */
export async function discoverNativeCompleted(
    owner: PinnedImportOwner, queueSnapshot: unknown,
): Promise<{ state: LedgerState; count: number; ambiguous: number }> {
    const selection = selectOwnedCompletedSpotifyJobs(queueSnapshot, owner.remoteUserId);
    if (selection.state !== "ok" || !validOwner(owner)) {
        return { state: "invalid_snapshot", count: 0, ambiguous: 0 };
    }
    const identity = await pinnedIdentity(owner);
    if (!identity.enabled || !identity.baselineAt) {
        return { state: "blocked", count: 0, ambiguous: selection.ambiguous };
    }
    if (selection.songs.length === 0) {
        return { state: "recorded", count: 0, ambiguous: selection.ambiguous };
    }
    // Unique constraint is the durable idempotency boundary across workers,
    // restarts and previous baseline snapshots. No upsert resets an old state.
    try {
        const created = await prisma.downtifyNativeImport.createMany({
            data: selection.songs.map(song => ({
                ownerKimaUserId: owner.kimaUserId,
                remoteServerId: owner.remoteServerId,
                remoteUserId: owner.remoteUserId,
                spotifyTrackId: song.spotifyTrackId,
                status: "ready",
            })),
            skipDuplicates: true,
        });
        return { state: "recorded", count: created.count, ambiguous: selection.ambiguous };
    } catch {
        return { state: "blocked", count: 0, ambiguous: selection.ambiguous };
    }
}

export type ClaimResult =
    | { state: "claimed"; id: string; claimToken: string; spotifyTrackId: string }
    | { state: "blocked" | "not_found" | "claimed_elsewhere" };

/**
 * A row is claimed with one compare-and-swap UPDATE in a database transaction.
 * A crashed worker leaves "claimed" until human reconciliation. There is no
 * timer that releases an expired lease and re-fetches an unknown file.
 */
export async function claimNativeImport(
    owner: PinnedImportOwner, id: string,
): Promise<ClaimResult> {
    if (!validOwner(owner) || !/^[a-z0-9]{10,40}$/.test(id)) {
        return { state: "blocked" };
    }
    const identity = await pinnedIdentity(owner);
    if (!identity.enabled || !identity.baselineAt) return { state: "blocked" };
    const token = randomUUID();
    try {
        return await prisma.$transaction(async tx => {
            // Repeat the setting/owner check under the same transaction. A
            // control flip between requests must not permit new file writes.
            const pairing = await tx.downtifyIntegration.findUnique({
                where: { id: "default" },
                select: {
                    ownerKimaUserId: true, expectedServerId: true,
                    expectedUserId: true, enabled: true,
                    nativeImportEnabled: true, nativeImportBaselineAt: true,
                },
            });
            if (pairing?.ownerKimaUserId !== owner.kimaUserId ||
                pairing.expectedServerId !== owner.remoteServerId ||
                pairing.expectedUserId !== owner.remoteUserId ||
                !pairing.enabled || !pairing.nativeImportEnabled ||
                !pairing.nativeImportBaselineAt) return { state: "blocked" } as const;
            const row = await tx.downtifyNativeImport.findFirst({
                where: {
                    id, ownerKimaUserId: owner.kimaUserId,
                    remoteServerId: owner.remoteServerId,
                    remoteUserId: owner.remoteUserId,
                },
                select: { id: true, status: true, spotifyTrackId: true },
            });
            if (!row) return { state: "not_found" } as const;
            if (row.status !== "ready") return { state: "claimed_elsewhere" } as const;
            const changed = await tx.downtifyNativeImport.updateMany({
                where: {
                    id, status: "ready", ownerKimaUserId: owner.kimaUserId,
                    remoteServerId: owner.remoteServerId,
                    remoteUserId: owner.remoteUserId,
                },
                data: {
                    status: "claimed", claimToken: token, claimedAt: new Date(),
                },
            });
            if (changed.count !== 1) return { state: "claimed_elsewhere" } as const;
            return {
                state: "claimed" as const,
                id: row.id, claimToken: token, spotifyTrackId: row.spotifyTrackId,
            };
        });
    } catch {
        return { state: "blocked" };
    }
}

/** Persist an uncertain result; never reset claims to READY automatically. */
export async function holdNativeImportForReview(
    owner: PinnedImportOwner, id: string, token: string, reason: string,
): Promise<boolean> {
    if (!validOwner(owner) || !/^[0-9a-f-]{36}$/.test(token) ||
        !/^[a-z_]{2,50}$/.test(reason)) return false;
    const saved = await prisma.downtifyNativeImport.updateMany({
        where: {
            id, ownerKimaUserId: owner.kimaUserId,
            remoteServerId: owner.remoteServerId,
            remoteUserId: owner.remoteUserId,
            claimToken: token, status: "claimed",
        },
        data: { status: "uncertain", reviewReason: reason },
    });
    return saved.count === 1;
}

export async function getNativeImportSummary(
    owner: PinnedImportOwner,
): Promise<{ enabled: boolean; baselineReady: boolean; waiting: number; inReview: number }> {
    const identity = await pinnedIdentity(owner);
    if (!identity.paired) return { enabled: false, baselineReady: false, waiting: 0, inReview: 0 };
    const rows = await prisma.downtifyNativeImport.groupBy({
        by: ["status"],
        where: {
            ownerKimaUserId: owner.kimaUserId,
            remoteServerId: owner.remoteServerId,
            remoteUserId: owner.remoteUserId,
        },
        _count: { _all: true },
    });
    const count = (status: string) => rows.find(row => row.status === status)?._count._all ?? 0;
    return {
        enabled: identity.enabled,
        baselineReady: !!identity.baselineAt,
        waiting: count("ready"),
        inReview: count("claimed") + count("review") + count("uncertain") +
            count("published_pending_scan"),
    };
}
