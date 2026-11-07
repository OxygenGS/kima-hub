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
import { createHash, randomUUID } from "crypto";
import { constants as fsFlags, promises as fs } from "fs";
import * as path from "path";
import { config } from "../config";
import { prisma } from "../utils/db";

export type NativeImportStatus =
    | "baseline" | "ready" | "claimed" | "published_pending_scan"
    | "imported" | "review" | "uncertain";
export type LedgerState =
    | "recorded" | "already_seen" | "blocked" | "invalid_snapshot" | "not_found"
    | "claimed" | "claimed_elsewhere" | "published_pending_scan" | "deferred"
    | "uncertain";

const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const SERVER_ID = /^[A-Za-z0-9_-]{8,128}$/;
const MAX_QUEUE_ROWS = 5000;
const MAX_QUEUE_BATCH = 5000;
const COMPLETED = "done";

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
    /** Changed files not yet attributable to a finished owner job. */
    deferred?: number;
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
    libraryCursor: number | null;
}> {
    if (!validOwner(owner)) return { paired: false, enabled: false, baselineAt: null, libraryCursor: null };
    const row = await prisma.downtifyIntegration.findUnique({
        where: { id: "default" },
        select: {
            ownerKimaUserId: true, expectedServerId: true,
            expectedUserId: true, enabled: true,
            nativeImportEnabled: true, nativeImportBaselineAt: true,
            nativeImportLibraryCursor: true,
        },
    });
    const paired = row?.ownerKimaUserId === owner.kimaUserId &&
        row.expectedServerId === owner.remoteServerId &&
        row.expectedUserId === owner.remoteUserId &&
        row.enabled === true;
    return {
        paired, enabled: paired && row?.nativeImportEnabled === true,
        baselineAt: paired ? row?.nativeImportBaselineAt || null : null,
        libraryCursor: paired ? row?.nativeImportLibraryCursor ?? null : null,
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
    libraryCursor: number,
): Promise<{ state: LedgerState; count: number; ambiguous: number }> {
    const selection = selectOwnedCompletedSpotifyJobs(queueSnapshot, owner.remoteUserId);
    if (selection.state !== "ok" || !validOwner(owner) ||
        !Number.isSafeInteger(libraryCursor) || libraryCursor < 0 ||
        libraryCursor > 2_147_483_647 || selection.ambiguous > 0) {
        // Never silently omit an ambiguous pre-existing song from the
        // initial baseline: it might later appear unique and be reimported.
        return { state: "invalid_snapshot", count: 0, ambiguous: selection.ambiguous };
    }
    const identity = await pinnedIdentity(owner);
    if (!identity.paired || identity.enabled || identity.baselineAt ||
        identity.libraryCursor !== null) {
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
                    nativeImportLibraryCursor: null,
                },
                data: {
                    nativeImportBaselineAt: new Date(),
                    nativeImportLibraryCursor: libraryCursor,
                },
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

/**
 * Select only newly published, owner-attributed Spotify files from an
 * INCREMENTAL authenticated mobile library changefeed.
 *
 * Queue visibility alone does NOT prove newness: old "done" rows can
 * disappear or reappear. Require exact matching filename, one queue job,
 * one mobile track row and a defensible remote library "added" timestamp
 * after Kima's first-activation baseline. Missing timestamps fail closed.
 */
export function selectFreshNativeSongs(
    queueSnapshot: unknown, changedTracks: unknown, remoteUserId: number,
    baselineAt: Date,
): Selection {
    if (!Array.isArray(queueSnapshot) || queueSnapshot.length > MAX_QUEUE_ROWS ||
        !Array.isArray(changedTracks) || changedTracks.length > 100000 ||
        !(baselineAt instanceof Date) || !Number.isFinite(baselineAt.getTime())) {
        return { state: "invalid_snapshot", songs: [], ambiguous: 0 };
    }
    const queueByFile = new Map<string, NativeSongObservation[]>();
    let activeOwnerSpotifyJobs = 0;
    for(const entry of queueSnapshot) {
        if (!record(entry) || !Array.isArray(entry.user_ids) ||
            !entry.user_ids.includes(remoteUserId) || !record(entry.song) ||
            (entry.song.source !== undefined && entry.song.source !== "spotify") ||
            typeof entry.song.song_id !== "string" ||
            !SPOTIFY_ID.test(entry.song.song_id)) continue;
        if (entry.status === "downloading" || entry.status === "queued") {
            // The library may expose the just-written file before the job
            // exposes its final filename/status. Never consume that cursor.
            activeOwnerSpotifyJobs++;
            continue;
        }
        if (entry.status !== "done" || typeof entry.filename !== "string" ||
            entry.filename.length > 1024) continue;
        const old = queueByFile.get(entry.filename) || [];
        old.push({ spotifyTrackId: entry.song.song_id, source: "spotify" });
        queueByFile.set(entry.filename, old);
    }
    const tracks = new Map<string, number>();
    for (const entry of changedTracks) {
        if (!record(entry) || typeof entry.file !== "string" ||
            typeof entry.id !== "string" || !/^t[0-9a-f]{16}$/.test(entry.id) ||
            typeof entry.added !== "number" || !Number.isSafeInteger(entry.added)) {
            continue;
        }
        // Require the first addition to be strictly AFTER activation:
        // an old song retagged during a scan must never be imported.
        // Do not allow a clock-skew grace period that admits older files.
        if (entry.added <= Math.ceil(baselineAt.getTime()/1000)) continue;
        tracks.set(entry.file, (tracks.get(entry.file)||0)+1);
    }
    const ids=new Map<string,number>();
    let deferred = 0;
    for (const [filename, count] of tracks) {
        const jobs=queueByFile.get(filename)||[];
        if (count !== 1 || jobs.length !== 1) {
            // A competing in-flight download may be the new file we see
            // in the changefeed. Hold the ENTIRE cursor for another poll.
            // Otherwise this one-time event is permanently lost.
            if (activeOwnerSpotifyJobs > 0 && jobs.length === 0) deferred++;
            continue;
        }
        const id=jobs[0].spotifyTrackId;
        ids.set(id, (ids.get(id)||0)+1);
    }
    const songs:NativeSongObservation[]=[];
    let ambiguous=0;
    for(const [id,count] of ids) {
        if(count===1)songs.push({spotifyTrackId:id,source:"spotify"});
        else ambiguous++;
    }
    return {state:"ok",songs,ambiguous,deferred};
}

/** Advance a Downtify library cursor atomically with new eligible claims.
 * A full-reset snapshot is treated as baseline ONLY, not new songs.
 */
export async function discoverNativeCompleted(
    owner: PinnedImportOwner, queueSnapshot: unknown,
    changes: { cursor: number; full: boolean; tracks: unknown[] },
): Promise<{ state: LedgerState; count: number; ambiguous: number }> {
    if (!validOwner(owner) || !Number.isSafeInteger(changes.cursor) ||
        changes.cursor < 0 || changes.cursor > 2_147_483_647 ||
        typeof changes.full !== "boolean" || !Array.isArray(changes.tracks)) {
        return { state: "invalid_snapshot", count: 0, ambiguous: 0 };
    }
    const identity = await pinnedIdentity(owner);
    if (!identity.enabled || !identity.baselineAt ||
        identity.libraryCursor === null || changes.cursor < identity.libraryCursor) {
        return { state: "blocked", count: 0, ambiguous: 0 };
    }
    const selection = changes.full
        ? { state: "ok" as const, songs: [], ambiguous: 0 }
        : selectFreshNativeSongs(queueSnapshot, changes.tracks,
            owner.remoteUserId, identity.baselineAt);
    if (selection.state !== "ok") {
        return { state: "invalid_snapshot", count: 0, ambiguous: selection.ambiguous };
    }
    if (selection.deferred) {
        // No cursor update and no partial insertion. On the next poll the
        // completed queue row can be matched to this same library event.
        return { state: "deferred", count: 0, ambiguous: selection.ambiguous };
    }
    if (changes.cursor === identity.libraryCursor) {
        return { state: "recorded", count: 0, ambiguous: selection.ambiguous };
    }
    try {
        const count = await prisma.$transaction(async tx => {
            const changed = await tx.downtifyIntegration.updateMany({
                where: {
                    id: "default", ownerKimaUserId: owner.kimaUserId,
                    expectedServerId: owner.remoteServerId,
                    expectedUserId: owner.remoteUserId,
                    nativeImportEnabled: true,
                    nativeImportLibraryCursor: identity.libraryCursor,
                },
                data: { nativeImportLibraryCursor: changes.cursor },
            });
            if(changed.count!==1)throw new Error("cursor race");
            if(selection.songs.length===0)return 0;
            const created = await tx.downtifyNativeImport.createMany({
                data: selection.songs.map(song => ({
                    ownerKimaUserId: owner.kimaUserId,
                    remoteServerId: owner.remoteServerId,
                    remoteUserId: owner.remoteUserId,
                    spotifyTrackId: song.spotifyTrackId,
                    status: "ready",
                })),
                skipDuplicates: true,
            });
            return created.count;
        });
        return {state:"recorded",count,ambiguous:selection.ambiguous};
    } catch {
        return {state:"blocked",count:0,ambiguous:selection.ambiguous};
    }
}

// Retriable failures BEFORE media publication have a persistent cooldown.
// No after-publication/uncertain claim is eligible for automatic reset.
const SAFE_UNWRITTEN_RETRY_DELAY_MS = 15 * 60 * 1000;
const dueForSafePrewriteRetry = () => ({
    OR: [
        { claimedAt: null },
        { claimedAt: { lt: new Date(Date.now() - SAFE_UNWRITTEN_RETRY_DELAY_MS) } },
    ],
});

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
    if (!identity.enabled || !identity.baselineAt ||
        identity.libraryCursor === null) return { state: "blocked" };
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
                    nativeImportLibraryCursor: true,
                },
            });
            if (pairing?.ownerKimaUserId !== owner.kimaUserId ||
                pairing.expectedServerId !== owner.remoteServerId ||
                pairing.expectedUserId !== owner.remoteUserId ||
                !pairing.enabled || !pairing.nativeImportEnabled ||
                !pairing.nativeImportBaselineAt ||
                pairing.nativeImportLibraryCursor === null)
                return { state: "blocked" } as const;
            const row = await tx.downtifyNativeImport.findFirst({
                where: {
                    id, ownerKimaUserId: owner.kimaUserId,
                    remoteServerId: owner.remoteServerId,
                    remoteUserId: owner.remoteUserId,
                    // A previous pairing's unfinished claim must not be
                    // revived after re-pairing and a fresh baseline.
                    discoveredAt: { gt: pairing.nativeImportBaselineAt },
                    ...dueForSafePrewriteRetry(),
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
                    discoveredAt: { gt: pairing.nativeImportBaselineAt },
                    ...dueForSafePrewriteRetry(),
                },
                data: {
                    status: "claimed", claimToken: token, claimedAt: new Date(),
                    reviewReason: null,
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

/**
 * Explicitly release a claim ONLY while no media file was even opened for
 * writing. A temporary remote outage or unavailable music mount must not
 * require command-line intervention. The last claim timestamp remains in
 * the database and prevents re-claiming for 15 minutes.
 *
 * CALLER CONTRACT: do not call this after publishNativeAudio is invoked.
 * A worker crash or any ambiguous post-write outcome must stay claimed or
 * uncertain for human reconciliation, never automatically retry.
 */
export async function releaseNativeUnwrittenClaim(
    owner: PinnedImportOwner, id: string, token: string,
    reason: "remote_temporarily_unavailable" | "storage_temporarily_unavailable",
): Promise<boolean> {
    if (!validOwner(owner) || !/^[a-z0-9]{10,40}$/.test(id) ||
        !/^[0-9a-f-]{36}$/.test(token)) return false;
    try {
        const changed = await prisma.downtifyNativeImport.updateMany({
            where: {
                id, ownerKimaUserId: owner.kimaUserId,
                remoteServerId: owner.remoteServerId,
                remoteUserId: owner.remoteUserId,
                status: "claimed", claimToken: token,
            },
            data: {
                status: "ready",
                claimToken: null,
                // Preserve claimedAt as the durable retry backoff checkpoint.
                reviewReason: reason,
            },
        });
        return changed.count === 1;
    } catch {
        // Unknown commit outcome: the caller must not issue any new claim.
        return false;
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
        baselineReady: !!identity.baselineAt && identity.libraryCursor !== null,
        waiting: count("ready"),
        inReview: count("claimed") + count("review") + count("uncertain") +
            count("published_pending_scan"),
    };
}


/**
 * Record a published file only after the verified source has been atomically
 * installed by the no-overwrite publisher. This stores evidence, not a Kima
 * library receipt. No operation can reset a previous state to "ready".
 */
export interface NativePublishedFile {
    expectedBytes: number;
    relativeTarget: string;
    fullSha256: string;
    remoteLibraryTrackId: string;
}
const SHA256 = /^[0-9a-f]{64}$/;
const TRACK_ID = /^t[0-9a-f]{16}$/;
const ALLOWED_AUDIO = new Set([".flac", ".mp3", ".m4a", ".ogg", ".opus", ".wav"]);
function safeLocalTarget(p: string): boolean {
    if (typeof p !== "string" || p.length > 1024 || path.isAbsolute(p) ||
        p.includes("\\") || p.includes("\0")) return false;
    const parts = p.split("/");
    return parts.length >= 3 && parts.length <= 8 &&
        parts[0] === "Singles" &&
        parts.every(x => x.length > 0 && x.length <= 180 &&
            x !== "." && x !== ".." && !/[<>:"\\|?*\u0000-\u001f\u007f]/.test(x)) &&
        ALLOWED_AUDIO.has(path.posix.extname(p).toLowerCase());
}

export async function recordNativePublished(
    owner: PinnedImportOwner, id: string, token: string, file: NativePublishedFile,
): Promise<boolean> {
    if (!validOwner(owner) || !/^[0-9a-f-]{36}$/.test(token) ||
        !Number.isSafeInteger(file.expectedBytes) ||
        file.expectedBytes < 64 || file.expectedBytes > 256 * 1024 * 1024 ||
        !safeLocalTarget(file.relativeTarget) ||
        !SHA256.test(file.fullSha256) ||
        !TRACK_ID.test(file.remoteLibraryTrackId)) return false;
    try {
        const changed = await prisma.downtifyNativeImport.updateMany({
            where: {
                id, status: "claimed", claimToken: token,
                ownerKimaUserId: owner.kimaUserId,
                remoteServerId: owner.remoteServerId,
                remoteUserId: owner.remoteUserId,
            },
            data: {
                status: "published_pending_scan",
                remoteLibraryTrackId: file.remoteLibraryTrackId,
                expectedBytes: file.expectedBytes,
                outputRelativePath: file.relativeTarget,
                fullSha256: file.fullSha256,
            },
        });
        return changed.count === 1;
    } catch {
        // An uncertain DB acknowledgement must be reviewed rather than
        // automatically re-publishing a file that might already be on disk.
        return false;
    }
}

export type NativeIndexedReceipt =
    | { state: "imported"; indexedTrackId: string }
    | { state: "not_indexed" | "not_verified" | "blocked" };

/**
 * Confirm a Kima scanner receipt plus the EXACT physically present file hash,
 * not merely remote 'done' or the publisher's returned success flag.
 *
 * The file is opened O_NOFOLLOW; all directory ancestors are checked, and
 * its inode/size/timestamps must remain unchanged during the entire hash.
 * A negative outcome never deletes or re-uploads any recording.
 */
export async function confirmNativeIndexed(
    owner: PinnedImportOwner, id: string, token: string,
    musicRoot: string = config.music.musicPath,
): Promise<NativeIndexedReceipt> {
    if (!validOwner(owner) || !/^[0-9a-f-]{36}$/.test(token)) {
        return { state: "blocked" };
    }
    const entry = await prisma.downtifyNativeImport.findFirst({
        where: {
            id, ownerKimaUserId: owner.kimaUserId,
            remoteServerId: owner.remoteServerId,
            remoteUserId: owner.remoteUserId,
            claimToken: token, status: "published_pending_scan",
        },
        select: {
            outputRelativePath: true,
            expectedBytes: true,
            fullSha256: true,
        },
    });
    if (!entry?.outputRelativePath || !safeLocalTarget(entry.outputRelativePath) ||
        !entry.fullSha256 || !SHA256.test(entry.fullSha256) ||
        !entry.expectedBytes || !Number.isSafeInteger(entry.expectedBytes)) {
        return { state: "not_verified" };
    }
    const rel = entry.outputRelativePath;
    const track = await prisma.track.findUnique({
        where: { filePath: rel },
        select: {
            id: true, fileSize: true, missingSince: true, corrupt: true,
            album: { select: { location: true } },
        },
    });
    if (!track || track.fileSize !== entry.expectedBytes ||
        track.missingSince !== null || track.corrupt ||
        track.album.location !== "LIBRARY") {
        return { state: "not_indexed" };
    }
    if (!path.isAbsolute(musicRoot) || musicRoot === "/" ||
        path.resolve(musicRoot) !== musicRoot) return { state: "not_verified" };

    let file: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
        const rootStat = await fs.lstat(musicRoot);
        if (!rootStat.isDirectory() || rootStat.isSymbolicLink() ||
            await fs.realpath(musicRoot) !== musicRoot) {
            return { state: "not_verified" };
        }
        const parts = rel.split("/");
        let cursor = musicRoot;
        for (let i = 0; i < parts.length - 1; i++) {
            cursor = path.join(cursor, parts[i]);
            const stat = await fs.lstat(cursor);
            if (!stat.isDirectory() || stat.isSymbolicLink() ||
                stat.dev !== rootStat.dev ||
                await fs.realpath(cursor) !== cursor) {
                return { state: "not_verified" };
            }
        }
        const absoluteFile = path.join(cursor, parts[parts.length - 1]);
        file = await fs.open(absoluteFile, fsFlags.O_RDONLY | fsFlags.O_NOFOLLOW);
        const first = await file.stat();
        if (!first.isFile() || first.dev !== rootStat.dev ||
            first.size !== entry.expectedBytes) return { state: "not_verified" };
        const hash = createHash("sha256");
        let offset = 0;
        while (offset < first.size) {
            const buffer = Buffer.allocUnsafe(Math.min(128 * 1024, first.size - offset));
            const { bytesRead } = await file.read(buffer, 0, buffer.byteLength, offset);
            if (bytesRead <= 0) return { state: "not_verified" };
            hash.update(buffer.subarray(0, bytesRead));
            offset += bytesRead;
        }
        const last = await file.stat();
        if (last.dev !== first.dev || last.ino !== first.ino ||
            last.size !== first.size || last.mtimeMs !== first.mtimeMs ||
            last.ctimeMs !== first.ctimeMs ||
            hash.digest("hex") !== entry.fullSha256) {
            return { state: "not_verified" };
        }
    } catch {
        return { state: "not_verified" };
    } finally {
        if (file) await file.close().catch(() => undefined);
    }
    // A concurrent confirmation wins exactly once. This cannot update
    // another import, a changed claim or a row manually held for review.
    const changed = await prisma.downtifyNativeImport.updateMany({
        where: {
            id, status: "published_pending_scan", claimToken: token,
            ownerKimaUserId: owner.kimaUserId,
            remoteServerId: owner.remoteServerId,
            remoteUserId: owner.remoteUserId,
            fullSha256: entry.fullSha256,
            outputRelativePath: rel,
        },
        data: {
            status: "imported", indexedTrackId: track.id,
            reviewReason: null,
        },
    });
    return changed.count === 1
        ? { state: "imported", indexedTrackId: track.id }
        : { state: "blocked" };
}
