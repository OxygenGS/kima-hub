/**
 * Project NOVA Library Guardian — read-only duplicate-recording candidates.
 *
 * This report uses indexed scan metadata and MusicBrainz recording identity.
 * Equal recording IDs, close durations and matching *acoustic fingerprints*
 * are evidence for a human review, NEVER proof that two files can safely be
 * deleted. Other editions, compilations and encodings are legitimate.
 *
 * One bounded SQL query; no filesystem walk, hash of media bytes, changes,
 * scans, network requests or download jobs. Called only by an administrator.
 */
import { prisma } from "../utils/db";
import { isMbid } from "./artistIdentity";

const DEFAULT_GROUPS = 8;
const MAX_GROUPS = 12;
const MAX_TRACKS_PER_GROUP = 4;

export type GuardianEvidence =
    | "matching-acoustic-fingerprint"
    | "same-recording-close-duration"
    | "shared-recording-id";

interface DuplicateQueryRow {
    recordingMbid: string;
    copies: number;
    trackId: string;
    title: string;
    duration: number;
    filePath: string;
    albumId: string;
    albumTitle: string;
    artistName: string;
    fingerprintDigest: string | null;
}

export interface GuardianTrackSummary {
    id: string;
    title: string;
    duration: number;
    filePath: string;
    albumId: string;
    albumTitle: string;
    artistName: string;
}

export interface GuardianCandidate {
    recordingMbid: string;
    indexedCopies: number;
    evidence: GuardianEvidence;
    tracks: GuardianTrackSummary[];
}

export interface LibraryGuardianDuplicateReport {
    generatedAt: string;
    basis: "indexed-recording-metadata";
    readOnly: true;
    groupLimit: number;
    sampleLimit: number;
    hasMore: boolean;
    candidates: GuardianCandidate[];
}

function normalizeTitle(value: string): string {
    return value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
}

/** Classify *evidence*, never a verdict of byte-identical media. */
export function assessDuplicateEvidence(rows: readonly DuplicateQueryRow[]): GuardianEvidence {
    for (let a = 0; a < rows.length; a++) {
        for (let b = a + 1; b < rows.length; b++) {
            const one = rows[a];
            const two = rows[b];
            if (!Number.isFinite(one.duration) || !Number.isFinite(two.duration)) continue;
            const close = Math.abs(one.duration - two.duration) <= 3;
            if (!close) continue;
            if (one.fingerprintDigest && one.fingerprintDigest === two.fingerprintDigest) {
                return "matching-acoustic-fingerprint";
            }
            if (normalizeTitle(one.title) === normalizeTitle(two.title)) {
                return "same-recording-close-duration";
            }
        }
    }
    return "shared-recording-id";
}

export function groupGuardianCandidates(
    records: readonly DuplicateQueryRow[],
    limit: number,
): { candidates: GuardianCandidate[]; hasMore: boolean } {
    const groups = new Map<string, DuplicateQueryRow[]>();
    for (const row of records) {
        if (!isMbid(row.recordingMbid) || !row.trackId) continue;
        const group = groups.get(row.recordingMbid) ?? [];
        if (!groups.has(row.recordingMbid)) groups.set(row.recordingMbid, group);
        if (group.length < MAX_TRACKS_PER_GROUP) group.push(row);
    }
    const all = [...groups.entries()];
    return {
        hasMore: all.length > limit,
        candidates: all.slice(0, limit).map(([recordingMbid, rows]) => ({
            recordingMbid,
            indexedCopies: rows[0].copies,
            evidence: assessDuplicateEvidence(rows),
            tracks: rows.map(row => ({
                id: row.trackId,
                title: row.title,
                duration: row.duration,
                filePath: row.filePath,
                albumId: row.albumId,
                albumTitle: row.albumTitle,
                artistName: row.artistName,
            })),
        })),
    };
}

export async function getLibraryGuardianDuplicates(
    requestedLimit = DEFAULT_GROUPS,
): Promise<LibraryGuardianDuplicateReport> {
    const limit = Number.isInteger(requestedLimit)
        ? Math.max(1, Math.min(MAX_GROUPS, requestedLimit))
        : DEFAULT_GROUPS;

    // A single PostgreSQL query ranks repeated recording IDs, then samples
    // their rows using ROW_NUMBER in one pass. Avoid an unindexed lateral
    // lookup for each group on large collections. No file bytes are read.
    const rows = await prisma.$queryRaw<DuplicateQueryRow[]>`
        WITH repeated AS (
            SELECT t."recordingMbid" AS recording_id, COUNT(*)::integer AS copies
            FROM "Track" t
            INNER JOIN "Album" a ON a.id = t."albumId"
            WHERE a.location = 'LIBRARY'
              AND t."missingSince" IS NULL
              AND t.corrupt = false
              AND t."recordingMbid" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            GROUP BY t."recordingMbid"
            HAVING COUNT(*) > 1
            ORDER BY copies DESC, recording_id
            LIMIT ${limit + 1}
        ), ranked AS (
            SELECT
                r.recording_id AS "recordingMbid",
                r.copies,
                t.id AS "trackId",
                t.title,
                t.duration,
                t."filePath",
                a.id AS "albumId",
                a.title AS "albumTitle",
                ar.name AS "artistName",
                CASE WHEN t."acoustidFingerprint" IS NULL THEN NULL
                    ELSE MD5(t."acoustidFingerprint") END AS "fingerprintDigest",
                ROW_NUMBER() OVER (PARTITION BY r.recording_id
                    ORDER BY t."filePath", t.id) AS rownum
            FROM "Track" t
            INNER JOIN repeated r ON r.recording_id = t."recordingMbid"
            INNER JOIN "Album" a ON a.id = t."albumId"
            INNER JOIN "Artist" ar ON ar.id = a."artistId"
            WHERE a.location = 'LIBRARY'
              AND t."missingSince" IS NULL
              AND t.corrupt = false
        )
        SELECT "recordingMbid", copies, "trackId", title, duration,
               "filePath", "albumId", "albumTitle", "artistName",
               "fingerprintDigest"
        FROM ranked
        WHERE rownum <= ${MAX_TRACKS_PER_GROUP}
        ORDER BY copies DESC, "recordingMbid", "filePath", "trackId"
    `;
    const { candidates, hasMore } = groupGuardianCandidates(rows, limit);
    return {
        generatedAt: new Date().toISOString(),
        basis: "indexed-recording-metadata",
        readOnly: true,
        groupLimit: limit,
        sampleLimit: MAX_TRACKS_PER_GROUP,
        hasMore,
        candidates,
    };
}
