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

export type SpotifyIntentStatus = "prepared" | "submitted" | "completed" | "failed" | "unknown";

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
    if (status === "prepared" || status === "submitted" ||
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
