/**
 * v1.18.0 Unified Download Manager — read-only, user-scoped Kima job feed.
 *
 * A completed transfer is not proof that the track is indexed/playable.
 * No raw metadata, source paths, peer identifiers, upstream URLs or error
 * strings are exposed by this endpoint.
 */
import { prisma } from "../utils/db";

export type DownloadEngine = "soulseek" | "lidarr" | "unknown";
export type DownloadPhase =
    | "queued" | "processing" | "downloaded" | "failed" | "cancelled" | "unknown";

export interface UnifiedDownloadItem {
    id: string;
    subject: string;
    engine: DownloadEngine;
    phase: DownloadPhase;
    /** The backend has not checked this job's exact indexed playable file. */
    libraryVerification: "not_checked";
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
    /** No percentage is fabricated when an engine lacks trustworthy progress. */
    progress: null;
}

export interface UnifiedDownloadOverview {
    items: UnifiedDownloadItem[];
    total: number;
    displayed: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    /** Counts are for this page, not a global total. */
    pageCounts: Record<DownloadPhase, number>;
}

export const MAX_DOWNLOAD_PAGE_SIZE = 100;
export const MAX_DOWNLOAD_OFFSET = 1000;

function engineFromType(type: string): DownloadEngine {
    if (type === "soulseek-search") return "soulseek";
    if (type === "artist" || type === "album") return "lidarr";
    return "unknown";
}

function phaseFromStatus(status: string): DownloadPhase {
    switch (status) {
        case "pending":
        case "queued":
            return "queued";
        case "processing":
        case "downloading":
        case "scanning":
            return "processing";
        case "completed":
            return "downloaded";
        case "failed":
        case "exhausted":
            return "failed";
        case "cancelled":
        case "canceled":
            return "cancelled";
        default:
            return "unknown";
    }
}

export async function getUnifiedDownloadOverview(
    userId: string,
    limit = 50,
    offset = 0,
): Promise<UnifiedDownloadOverview> {
    if (!userId || limit < 1 || limit > MAX_DOWNLOAD_PAGE_SIZE ||
        !Number.isSafeInteger(limit) || !Number.isSafeInteger(offset) ||
        offset < 0 || offset > MAX_DOWNLOAD_OFFSET) {
        throw new Error("Invalid unified download query");
    }

    // The user filter is mandatory for BOTH count and selection.
    // Administrators still see their own tasks, not everyone else's.
    const where = { userId, cleared: false };
    const [total, jobs] = await Promise.all([
        prisma.downloadJob.count({ where }),
        prisma.downloadJob.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: offset,
            take: limit,
            select: {
                id: true,
                subject: true,
                type: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                completedAt: true,
            },
        }),
    ]);

    const pageCounts: UnifiedDownloadOverview["pageCounts"] = {
        queued: 0, processing: 0, downloaded: 0,
        failed: 0, cancelled: 0, unknown: 0,
    };
    const items: UnifiedDownloadItem[] = jobs.map((job) => {
        const phase = phaseFromStatus(job.status);
        pageCounts[phase]++;
        return {
            id: job.id,
            subject: job.subject.slice(0, 240),
            engine: engineFromType(job.type),
            phase,
            libraryVerification: "not_checked",
            createdAt: job.createdAt.toISOString(),
            updatedAt: job.updatedAt.toISOString(),
            completedAt: job.completedAt?.toISOString() ?? null,
            progress: null,
        };
    });

    return {
        items, total, displayed: items.length, limit, offset,
        hasMore: offset + items.length < total,
        pageCounts,
    };
}
