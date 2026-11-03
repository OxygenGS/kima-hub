/**
 * Explicit, reversible album reassignment for indexed Soulseek imports.
 *
 * Only Track.albumId and Track.manualAlbumId change. File paths, tags, bytes,
 * play history and existing Artist/Album identity rows are not modified.
 * Every write is protected by a serializable transaction and a complete
 * server-side re-evaluation of the preview under the caller's identity.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../utils/db";
import { safeStoredPath } from "./smartDownloadInbox";
import { getSmartImportSuggestion } from "./smartImportSuggestion";

export class SmartImportRepairError extends Error {
    constructor(message: string, readonly status: 400 | 404 | 409) {
        super(message);
        this.name = "SmartImportRepairError";
    }
}

export interface ConfirmImportRepairInput {
    trackId: string;
    previousAlbumId: string;
    newAlbumId: string;
    fileModified: string;
    fileSize: number;
}

function conflict(message: string): never {
    throw new SmartImportRepairError(message, 409);
}

function validateInput(value: unknown): ConfirmImportRepairInput {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new SmartImportRepairError("Invalid confirmation", 400);
    }
    const fields = value as Record<string, unknown>;
    const validId = (id: unknown): id is string =>
        typeof id === "string" && id.length > 0 && id.length <= 160;
    if (!validId(fields.trackId) || !validId(fields.previousAlbumId) || !validId(fields.newAlbumId) ||
        typeof fields.fileModified !== "string" || fields.fileModified.length > 48 ||
        !/^\d{4}-\d{2}-\d{2}T/.test(fields.fileModified) ||
        !Number.isFinite(Date.parse(fields.fileModified)) ||
        !Number.isSafeInteger(fields.fileSize) || (fields.fileSize as number) < 0) {
        throw new SmartImportRepairError("Invalid confirmation", 400);
    }
    return fields as unknown as ConfirmImportRepairInput;
}

function translateDbConflict(error: unknown): never {
    if (error instanceof SmartImportRepairError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2034" || error.code === "P2003")) {
        conflict("The import changed or has already been repaired. Refresh before retrying.");
    }
    throw error;
}


/** Artist list filters rely on stored counts; keep both artist summaries
 * correct in the SAME transaction as the album link and its audit record. */
async function refreshArtistSummaries(tx: Prisma.TransactionClient, ids: string[]): Promise<void> {
    for (const artistId of new Set(ids)) {
        const [libraryAlbumCount, discoveryAlbumCount, totalTrackCount] = await Promise.all([
            tx.album.count({ where: { artistId, location: "LIBRARY", tracks: { some: {} } } }),
            tx.album.count({ where: { artistId, location: "DISCOVER", tracks: { some: {} } } }),
            tx.track.count({ where: { album: { artistId } } }),
        ]);
        await tx.artist.update({
            where: { id: artistId },
            data: { libraryAlbumCount, discoveryAlbumCount, totalTrackCount, countsLastUpdated: new Date() },
        });
    }
}

/** Undo is available until the track/album has been independently changed or deleted. */
export async function applySmartImportRepair(userId: string, jobId: string, raw: unknown) {
    const input = validateInput(raw);
    if (input.previousAlbumId === input.newAlbumId) conflict("The track already belongs to that album.");

    try {
        return await prisma.$transaction(async (tx) => {
            const proposal = await getSmartImportSuggestion(userId, jobId, tx);
            if (!proposal) throw new SmartImportRepairError("Download not found", 404);
            if (proposal.status !== "suggested" || !proposal.current || !proposal.proposedAlbum ||
                !proposal.proposedArtist || !proposal.evidence.some((evidence) =>
                    evidence === "folder-album" || evidence === "same-title-duration"
                )) {
                conflict("No actionable album suggestion exists. Review the import again.");
            }

            const { current, proposedAlbum, proposedArtist } = proposal;
            if (current.trackId !== input.trackId ||
                current.albumId !== input.previousAlbumId ||
                current.fileModified !== input.fileModified ||
                current.fileSize !== input.fileSize ||
                proposedAlbum.id !== input.newAlbumId) {
                conflict("The import or proposed album has changed. Review it again.");
            }

            const job = await tx.downloadJob.findFirst({
                where: { id: jobId, userId, type: "soulseek-search", cleared: false, status: "completed" },
                select: { metadata: true },
            });
            const filePath = safeStoredPath(job?.metadata);
            if (!filePath) conflict("The import no longer has an identifiable file.");

            const target = await tx.album.findFirst({
                where: { id: input.newAlbumId, artistId: proposedArtist.id, location: "LIBRARY" },
                select: { id: true, artistId: true },
            });
            if (!target) conflict("The proposed album no longer exists in the library.");
            const original = await tx.album.findUnique({
                where: { id: input.previousAlbumId }, select: { id: true, artistId: true },
            });
            if (!original) conflict("The original album no longer exists.");

            // Optimistic CAS prevents overwriting concurrent scan/metadata changes.
            // The migration's BEFORE UPDATE trigger keeps any subsequent scanner
            // update from reverting a manually selected album.
            const updated = await tx.track.updateMany({
                where: {
                    id: input.trackId,
                    albumId: input.previousAlbumId,
                    filePath,
                    fileModified: new Date(input.fileModified),
                    fileSize: input.fileSize,
                    missingSince: null,
                    corrupt: false,
                    manualAlbumId: null,
                },
                data: { manualAlbumId: input.newAlbumId, albumId: input.newAlbumId },
            });
            if (updated.count !== 1) conflict("The track changed during confirmation. Refresh and retry.");

            // Last write in the same transaction: if a uniqueness guard rejects
            // this audit record, the Track change is rolled back atomically.
            const repair = await tx.smartImportRepair.create({
                data: {
                    jobId, trackId: input.trackId, userId, filePath,
                    previousAlbumId: input.previousAlbumId,
                    newAlbumId: input.newAlbumId,
                },
                select: { id: true, appliedAt: true },
            });
            await refreshArtistSummaries(tx, [original.artistId, target.artistId]);
            return {
                status: "relinked" as const,
                repairId: repair.id, trackId: input.trackId,
                previousAlbumId: input.previousAlbumId,
                newAlbumId: input.newAlbumId,
                appliedAt: repair.appliedAt.toISOString(),
            };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
        return translateDbConflict(error);
    }
}

export async function undoSmartImportRepair(userId: string, jobId: string, repairId: string) {
    if (!repairId || repairId.length > 160) {
        throw new SmartImportRepairError("Invalid repair ID", 400);
    }
    try {
        return await prisma.$transaction(async (tx) => {
            const repair = await tx.smartImportRepair.findFirst({
                where: { id: repairId, jobId, userId, undoneAt: null },
                select: {
                    id: true, trackId: true, filePath: true,
                    previousAlbumId: true, newAlbumId: true,
                },
            });
            // No difference between another user's repair and unknown IDs.
            if (!repair) throw new SmartImportRepairError("Repair not found", 404);

            const original = await tx.album.findUnique({
                where: { id: repair.previousAlbumId }, select: { id: true, artistId: true },
            });
            if (!original) conflict("The original album has been removed. No changes made.");
            const target = await tx.album.findUnique({
                where: { id: repair.newAlbumId }, select: { id: true, artistId: true },
            });
            if (!target) conflict("The repaired album has been removed. No changes made.");

            const updated = await tx.track.updateMany({
                where: {
                    id: repair.trackId, filePath: repair.filePath,
                    albumId: repair.newAlbumId, manualAlbumId: repair.newAlbumId,
                },
                data: { manualAlbumId: null, albumId: repair.previousAlbumId },
            });
            if (updated.count !== 1) conflict("The track has changed. Cannot safely undo.");

            const marked = await tx.smartImportRepair.updateMany({
                where: { id: repair.id, undoneAt: null },
                data: { undoneAt: new Date() },
            });
            if (marked.count !== 1) conflict("The repair was already undone.");
            await refreshArtistSummaries(tx, [original.artistId, target.artistId]);

            return { status: "undone" as const, repairId: repair.id, trackId: repair.trackId };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
        return translateDbConflict(error);
    }
}
