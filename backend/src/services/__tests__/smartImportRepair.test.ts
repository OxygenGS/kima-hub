jest.mock("../../utils/db", () => ({ prisma: { $transaction: jest.fn() } }));
jest.mock("../smartImportSuggestion", () => ({ getSmartImportSuggestion: jest.fn() }));
import { prisma } from "../../utils/db";
import { getSmartImportSuggestion } from "../smartImportSuggestion";
import { applySmartImportRepair, undoSmartImportRepair, SmartImportRepairError } from "../smartImportRepair";

const getSuggestion = getSmartImportSuggestion as jest.Mock;
const transaction = prisma.$transaction as jest.Mock;
const update = jest.fn();
const create = jest.fn();
const findJob = jest.fn();
const findAlbum = jest.fn();
const findRepair = jest.fn();
const mark = jest.fn();
const tx = {
    downloadJob: { findFirst: (...a: unknown[]) => findJob(...a) },
    album: { findFirst: (...a: unknown[]) => findAlbum(...a), findUnique: (...a: unknown[]) => findAlbum(...a) },
    track: { updateMany: (...a: unknown[]) => update(...a) },
    smartImportRepair: { create: (...a: unknown[]) => create(...a),
        findFirst: (...a: unknown[]) => findRepair(...a),
        updateMany: (...a: unknown[]) => mark(...a) },
};
const path = "Singles/Kima Downloads/Tones and I/Unknown Album/Dance Monkey.flac";
const modified = "2026-11-03T10:00:00.000Z";
const confirm = { trackId: "track-1", previousAlbumId: "source",
    newAlbumId: "target", fileModified: modified, fileSize: 200000 };
const proposal = {
    status: "suggested", readOnly: true,
    current: {
        trackId: "track-1", albumId: "source", fileModified: modified, fileSize: 200000,
        title: "Dance Monkey", artist: "Unknown Artist", album: "Unknown Album",
    },
    proposedArtist: { id: "artist-1", name: "Tones and I" },
    proposedAlbum: { id: "target", title: "The Kids Are Coming" },
    evidence: ["folder-artist", "existing-library-artist", "same-title-duration"],
};
beforeEach(() => {
    jest.resetAllMocks();
    transaction.mockImplementation(async (cb) => cb(tx));
    getSuggestion.mockResolvedValue(proposal);
    findJob.mockResolvedValue({ metadata: { importRelativePath: path } });
    findAlbum.mockResolvedValue({ id: "target" });
    update.mockResolvedValue({ count: 1 });
    create.mockResolvedValue({ id: "repair-1", appliedAt: new Date(modified) });
    mark.mockResolvedValue({ count: 1 });
    findRepair.mockResolvedValue({
        id: "repair-1", trackId: "track-1", filePath: path,
        previousAlbumId: "source", newAlbumId: "target",
    });
});

describe("Confirmed Smart Inbox album reclassification", () => {
    it("rejects invalid inputs before opening a transaction", async () => {
        await expect(applySmartImportRepair("admin", "job-1", {}))
            .rejects.toMatchObject({ status: 400 });
        expect(transaction).not.toHaveBeenCalled();
    });

    it("authorizes and revalidates the suggestion inside a serializable transaction", async () => {
        const result = await applySmartImportRepair("admin-1", "job-1", confirm);
        expect(getSuggestion).toHaveBeenCalledWith("admin-1", "job-1", tx);
        expect(transaction.mock.calls[0][1]).toEqual(expect.objectContaining({
            isolationLevel: "Serializable",
        }));
        expect(findJob).toHaveBeenCalledWith({
            where: { id: "job-1", userId: "admin-1", type: "soulseek-search",
                cleared: false, status: "completed" },
            select: { metadata: true },
        });
        expect(update.mock.calls[0][0]).toMatchObject({
            where: { id: "track-1", albumId: "source", filePath: path,
                manualAlbumId: null, missingSince: null, corrupt: false,
                fileModified: new Date(modified), fileSize: 200000 },
            data: { albumId: "target", manualAlbumId: "target" },
        });
        expect(create).toHaveBeenCalledWith({
            data: {
                jobId: "job-1", userId: "admin-1", trackId: "track-1", filePath: path,
                previousAlbumId: "source", newAlbumId: "target",
            },
            select: { id: true, appliedAt: true },
        });
        expect(result).toMatchObject({ status: "relinked", repairId: "repair-1" });
    });

    it("rejects stale source, file timestamp, unsafe proposals and guessed targets", async () => {
        for (const change of [
            { previousAlbumId: "another" }, { fileModified: "2026-11-01T10:00:00.000Z" },
            { newAlbumId: "other" }, { fileSize: 20 },
        ]) {
            await expect(applySmartImportRepair("admin", "job", { ...confirm, ...change }))
                .rejects.toMatchObject({ status: 409 });
        }
        getSuggestion.mockResolvedValue({ ...proposal, proposedAlbum: null });
        await expect(applySmartImportRepair("admin", "job", confirm))
            .rejects.toMatchObject({ status: 409 });
        expect(update).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
    });

    it("rejects another user's job without reading a track or writing", async () => {
        getSuggestion.mockResolvedValue(null);
        await expect(applySmartImportRepair("other", "job-1", confirm))
            .rejects.toMatchObject({ status: 404 });
        expect(update).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
    });

    it("rejects stale revisions and never creates an audit row", async () => {
        update.mockResolvedValue({ count: 0 });
        await expect(applySmartImportRepair("admin", "job", confirm))
            .rejects.toMatchObject({ status: 409 });
        expect(create).not.toHaveBeenCalled();
    });

    it("does not apply repairs when the library album was deleted", async () => {
        findAlbum.mockResolvedValue(null);
        await expect(applySmartImportRepair("admin", "job", confirm))
            .rejects.toMatchObject({ status: 409 });
        expect(update).not.toHaveBeenCalled();
    });
});

describe("Undo Smart Inbox album reclassification", () => {
    it("restores the exact original album and clears the manual scanner override", async () => {
        const result = await undoSmartImportRepair("admin", "job-1", "repair-1");
        expect(findRepair).toHaveBeenCalledWith({
            where: { id: "repair-1", jobId: "job-1", userId: "admin", undoneAt: null },
            select: { id: true, trackId: true, filePath: true,
                previousAlbumId: true, newAlbumId: true },
        });
        expect(update).toHaveBeenCalledWith({
            where: { id: "track-1", filePath: path, albumId: "target", manualAlbumId: "target" },
            data: { albumId: "source", manualAlbumId: null },
        });
        expect(mark).toHaveBeenCalledWith({
            where: { id: "repair-1", undoneAt: null },
            data: { undoneAt: expect.any(Date) },
        });
        expect(result).toEqual({ status: "undone", repairId: "repair-1", trackId: "track-1" });
    });
    it("does not disclose or undo a repair belonging to another user", async () => {
        findRepair.mockResolvedValue(null);
        await expect(undoSmartImportRepair("other", "job-1", "repair-1"))
            .rejects.toMatchObject({ status: 404 });
        expect(update).not.toHaveBeenCalled();
    });
    it("refuses undo if the source album no longer exists or target state changed", async () => {
        findAlbum.mockResolvedValue(null);
        await expect(undoSmartImportRepair("admin", "job", "repair-1"))
            .rejects.toMatchObject({ status: 409 });
        expect(update).not.toHaveBeenCalled();
        findAlbum.mockResolvedValue({ id: "source" });
        update.mockResolvedValue({ count: 0 });
        await expect(undoSmartImportRepair("admin", "job", "repair-1"))
            .rejects.toMatchObject({ status: 409 });
        expect(mark).not.toHaveBeenCalled();
    });
});
