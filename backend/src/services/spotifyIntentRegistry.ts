/**
 * v1.18.0 Spotify request preparation registry.
 *
 * A prepared intent is NOT a DownloadJob. The queue workers never read this
 * table. A hard database uniqueness constraint (userId,kind,spotifyId)
 * prevents identical preparation rows even under concurrent requests.
 *
 * This service does not call Downtify/Spotify, access /music, or mark a track
 * indexed. Library duplicates remain UNKNOWN until a trusted metadata + file
 * identity check exists.
 */
import { prisma } from "../utils/db";
import { parseSpotifyDownloadLink, type SpotifyDownloadKind } from "./spotifyLinkIntake";

export type SpotifyIntentStatus = "prepared" | "dispatching" | "dispatch_unknown" | "submitted" | "completed" | "failed" | "unknown";

export interface PreparedSpotifyIntent {
    id: string;
    provider: "spotify";
    kind: SpotifyDownloadKind;
    canonicalUrl: string;
    status: SpotifyIntentStatus;
    alreadyPrepared: boolean;
    duplicateScope: "this_users_prepared_intents_only";
    libraryDuplicateCheck: "not_checked";
    submittedByThisRequest: false;
    downloadStartedByThisRequest: false;
    filesChangedByThisRequest: false;
}

function knownStatus(status: string): SpotifyIntentStatus {
    if (status === "prepared" || status === "dispatching" ||
        status === "dispatch_unknown" || status === "submitted" ||
        status === "completed" || status === "failed") return status;
    return "unknown";
}

function isUniqueConstraint(error: unknown): boolean {
    return !!error && typeof error === "object" && "code" in error && error.code === "P2002";
}

export async function prepareSpotifyIntent(
    userId: string,
    input: unknown,
): Promise<PreparedSpotifyIntent | null> {
    if (!userId) throw new Error("Authenticated user ID required");

    // Revalidate on the backend. Never trust a client-provided canonical URL
    // or user ID, even if the same input passed the earlier preview endpoint.
    const parsed = parseSpotifyDownloadLink(input);
    if (!parsed) return null;

    const spotifyId = parsed.intentKey.split(":")[2];
    const where = {
        userId_kind_spotifyId: {
            userId,
            kind: parsed.kind,
            spotifyId,
        },
    };

    let alreadyPrepared = false;
    let row: { id: string; status: string };

    try {
        row = await prisma.spotifyDownloadIntent.create({
            data: {
                userId,
                kind: parsed.kind,
                spotifyId,
                canonicalUrl: parsed.canonicalUrl,
                status: "prepared",
            },
            select: { id: true, status: true },
        });
    } catch (error: unknown) {
        // The DB unique key, not a read-then-insert race, is authoritative.
        if (!isUniqueConstraint(error)) throw error;
        alreadyPrepared = true;
        const existing = await prisma.spotifyDownloadIntent.findUnique({
            where,
            select: { id: true, status: true },
        });
        if (!existing) throw new Error("Spotify intent vanished after uniqueness conflict");
        row = existing;
    }

    return {
        id: row.id,
        provider: "spotify",
        kind: parsed.kind,
        canonicalUrl: parsed.canonicalUrl,
        status: knownStatus(row.status),
        alreadyPrepared,
        duplicateScope: "this_users_prepared_intents_only",
        libraryDuplicateCheck: "not_checked",
        submittedByThisRequest: false,
        downloadStartedByThisRequest: false,
        filesChangedByThisRequest: false,
    };
}

/**
 * Bound, read-only view of saved *requests*. This never consults the
 * downloader, and does not claim the requested audio exists in the library.
 */
export interface SavedSpotifyIntent {
    id: string;
    provider: "spotify";
    kind: SpotifyDownloadKind | "unknown";
    canonicalUrl: string | null;
    requestState: SpotifyIntentStatus;
    createdAt: string;
    libraryDuplicateCheck: "not_checked";
    engineStatus: "not_checked";
}

export interface SavedSpotifyIntentPage {
    enabled: true;
    items: SavedSpotifyIntent[];
    total: number;
    displayed: number;
    limit: number;
    offset: number;
    hasMore: boolean;
    isDownloadQueue: false;
}

export const MAX_SPOTIFY_INTENT_PAGE_SIZE = 50;
export const MAX_SPOTIFY_INTENT_OFFSET = 1000;

export async function getSavedSpotifyIntents(
    userId: string,
    limit = 20,
    offset = 0,
): Promise<SavedSpotifyIntentPage> {
    if (!userId || !Number.isSafeInteger(limit) || limit < 1 ||
        limit > MAX_SPOTIFY_INTENT_PAGE_SIZE ||
        !Number.isSafeInteger(offset) || offset < 0 ||
        offset > MAX_SPOTIFY_INTENT_OFFSET) {
        throw new Error("Invalid Spotify intent listing");
    }

    // Both the count and selection are mandatory user-scoped. Even an admin
    // has no implicit permission to browse other accounts' saved requests.
    const where = { userId };
    const [total, rows] = await Promise.all([
        prisma.spotifyDownloadIntent.count({ where }),
        prisma.spotifyDownloadIntent.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: offset,
            take: limit,
            select: {
                id: true,
                kind: true,
                spotifyId: true,
                canonicalUrl: true,
                status: true,
                createdAt: true,
            },
        }),
    ]);

    const items: SavedSpotifyIntent[] = rows.map((row) => {
        // DB rows are not an authorization source for showing arbitrary URLs.
        // Re-parse and verify the stored canonical resource identity before
        // returning a URL that the UI might render.
        const parsed = parseSpotifyDownloadLink(row.canonicalUrl);
        const valid = parsed !== null &&
            parsed.intentKey === `spotify:${row.kind}:${row.spotifyId}` &&
            parsed.canonicalUrl === row.canonicalUrl;
        return {
            id: row.id,
            provider: "spotify",
            kind: valid ? parsed.kind : "unknown",
            canonicalUrl: valid ? parsed.canonicalUrl : null,
            requestState: knownStatus(row.status),
            createdAt: row.createdAt.toISOString(),
            libraryDuplicateCheck: "not_checked",
            engineStatus: "not_checked",
        };
    });

    return {
        enabled: true, items, total, displayed: items.length,
        limit, offset, hasMore: offset + items.length < total,
        isDownloadQueue: false,
    };
}
