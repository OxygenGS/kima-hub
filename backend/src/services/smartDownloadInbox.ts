/**
 * Read-only, caller-scoped Smart Download Inbox for manual Soulseek downloads.
 * A completed network transfer is not the same thing as an indexed, usable
 * library track. Never claim a verified import without an exact track path.
 */
import { prisma } from "../utils/db";

const IMPORT_ROOT = "Singles/Kima Downloads/";
const LIMIT = 25;

export type SmartInboxStage =
    | "active" | "failed" | "awaiting-index" | "indexed"
    | "review" | "unavailable" | "unverified";

export type SmartInboxReason =
    | "in-progress" | "download-failed" | "legacy-untracked"
    | "not-indexed" | "missing-file" | "corrupt-file"
    | "discovery-album" | "unknown-artist" | "indexed";

export interface SmartInboxItem {
    id: string;
    subject: string;
    createdAt: string;
    stage: SmartInboxStage;
    reason: SmartInboxReason;
    filePath: string | null;
    track: { id: string; album: string; artist: string } | null;
}

export interface SmartInboxReport {
    generatedAt: string;
    total: number;
    displayed: number;
    limit: number;
    items: SmartInboxItem[];
}

export function safeStoredPath(meta: unknown): string | null {
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
    const value = (meta as Record<string, unknown>).importRelativePath;
    if (typeof value !== "string" || !value.startsWith(IMPORT_ROOT) ||
        value.includes("\\") || value.includes("\0")) return null;
    // A stored path is never trusted to be an absolute path or traversal.
    const parts = value.slice(IMPORT_ROOT.length).split("/");
    if (parts.length < 3 || parts.some((part) => !part || part === "." || part === "..")) return null;
    return value;
}

export async function getSmartDownloadInbox(userId: string): Promise<SmartInboxReport> {
    const where = { userId, type: "soulseek-search", cleared: false };
    const [total, jobs] = await Promise.all([
        prisma.downloadJob.count({ where }),
        prisma.downloadJob.findMany({
            where, orderBy: { createdAt: "desc" }, take: LIMIT,
            select: {
                id: true, subject: true, status: true,
                metadata: true, createdAt: true,
            },
        }),
    ]);

    const paths = [...new Set(jobs.map((job) => safeStoredPath(job.metadata))
        .filter((value): value is string => value !== null))];
    const tracks = paths.length ? await prisma.track.findMany({
        where: { filePath: { in: paths } },
        select: {
            id: true, filePath: true, missingSince: true, corrupt: true,
            album: {
                select: {
                    title: true, location: true,
                    artist: { select: { name: true } },
                },
            },
        },
        take: LIMIT,
    }) : [];
    const indexed = new Map(tracks.map((track) => [track.filePath, track]));

    const items: SmartInboxItem[] = jobs.map((job) => {
        const filePath = safeStoredPath(job.metadata);
        const found = filePath ? indexed.get(filePath) : undefined;
        const track = found ? {
            id: found.id,
            album: found.album.title,
            artist: found.album.artist.name,
        } : null;
        let stage: SmartInboxStage;
        let reason: SmartInboxReason;

        if (job.status === "failed" || job.status === "exhausted") {
            stage = "failed"; reason = "download-failed";
        } else if (job.status !== "completed") {
            stage = "active"; reason = "in-progress";
        } else if (!filePath) {
            stage = "unverified"; reason = "legacy-untracked";
        } else if (!found) {
            stage = "awaiting-index"; reason = "not-indexed";
        } else if (found.missingSince) {
            stage = "unavailable"; reason = "missing-file";
        } else if (found.corrupt) {
            stage = "unavailable"; reason = "corrupt-file";
        } else if (found.album.location !== "LIBRARY") {
            stage = "review"; reason = "discovery-album";
        } else if (["unknown", "unknown artist"].includes(found.album.artist.name.trim().toLowerCase())) {
            stage = "review"; reason = "unknown-artist";
        } else {
            stage = "indexed"; reason = "indexed";
        }

        return {
            id: job.id, subject: job.subject,
            createdAt: job.createdAt.toISOString(), stage, reason, filePath, track,
        };
    });

    return { generatedAt: new Date().toISOString(), total, displayed: items.length, limit: LIMIT, items };
}
