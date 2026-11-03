/**
 * Real PostgreSQL smoke: apply, scanner-trigger safety, undo, stale revision.
 * This suite runs only with CI's disposable test database.
 */
jest.mock("../../utils/logger", () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
import { randomUUID } from "crypto";
import { prisma } from "../../utils/db";
import { artistIdentityKey } from "../artistIdentity";
import { applySmartImportRepair, undoSmartImportRepair } from "../smartImportRepair";

jest.setTimeout(60000);

let userId = "";
let targetArtistId = "";
let sourceAlbumId = "";
let targetAlbumId = "";
let importedTrackId = "";
let peerTrackId = "";
let jobId = "";
let filePath = "";
const stamp = new Date("2026-11-03T10:00:00.000Z");
const SIZE = 200000;

async function cleanup() {
    if (userId) await prisma.smartImportRepair.deleteMany({ where: { userId } });
    if (jobId) await prisma.downloadJob.deleteMany({ where: { id: jobId } });
    if (importedTrackId || peerTrackId) {
        await prisma.track.deleteMany({
            where: { id: { in: [importedTrackId, peerTrackId].filter(Boolean) } },
        });
    }
    if (sourceAlbumId || targetAlbumId) {
        await prisma.album.deleteMany({
            where: { id: { in: [sourceAlbumId, targetAlbumId].filter(Boolean) } },
        });
    }
    if (targetArtistId) await prisma.artist.deleteMany({ where: { id: targetArtistId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
}

beforeEach(async () => {
    const id = randomUUID().slice(0, 12);
    const name = "Smart Repair Artist " + id;
    userId = "smart-repair-" + id;
    await prisma.user.create({ data: {
        id: userId, username: userId, passwordHash: "test-only", role: "admin",
    } });
    const unknownArtist = await prisma.artist.upsert({
        where: { identityKey: "unknownartist" },
        create: { name: "Unknown Artist", identityKey: "unknownartist" },
        update: {},
    });
    const targetArtist = await prisma.artist.create({
        data: { name, identityKey: artistIdentityKey(name) },
    });
    targetArtistId = targetArtist.id;
    const source = await prisma.album.create({
        data: {
            artistId: unknownArtist.id, title: "Unknown Album",
            identityKey: "repairsource" + id,
            rgMbid: "temp-repair-source-" + id,
            primaryType: "Album", location: "LIBRARY",
        },
    });
    const destination = await prisma.album.create({
        data: {
            artistId: targetArtist.id, title: "The Kids Are Coming",
            identityKey: "thekidsarecoming",
            rgMbid: "temp-repair-target-" + id,
            primaryType: "Album", location: "LIBRARY",
        },
    });
    sourceAlbumId = source.id;
    targetAlbumId = destination.id;
    filePath = "Singles/Kima Downloads/" + name + "/Unknown Album/02 - " + name + " - Dance Monkey.flac";
    const downloaded = await prisma.track.create({
        data: {
            albumId: source.id, title: "Dance Monkey", trackNo: 2, duration: 209,
            filePath, fileModified: stamp, fileSize: SIZE,
        },
    });
    const peer = await prisma.track.create({
        data: {
            albumId: destination.id, title: "Dance Monkey", trackNo: 2, duration: 210,
            filePath: name + "/The Kids Are Coming/02 - Dance Monkey.flac",
            fileModified: stamp, fileSize: SIZE,
        },
    });
    importedTrackId = downloaded.id;
    peerTrackId = peer.id;
    const job = await prisma.downloadJob.create({
        data: {
            userId, status: "completed", type: "soulseek-search",
            subject: name + " - Dance Monkey",
            metadata: { importRelativePath: filePath },
        },
    });
    jobId = job.id;
});
afterEach(async () => {
    await cleanup();
    userId = targetArtistId = sourceAlbumId = targetAlbumId = importedTrackId = peerTrackId = jobId = "";
});
afterAll(async () => prisma.$disconnect());

function confirm() {
    return {
        trackId: importedTrackId, previousAlbumId: sourceAlbumId,
        newAlbumId: targetAlbumId, fileModified: stamp.toISOString(), fileSize: SIZE,
    };
}

describe("Smart Import Repair database guarantees", () => {
    it("applies only to the owner's job, survives scanner's album upsert, and undoes cleanly", async () => {
        await expect(applySmartImportRepair("not-the-owner", jobId, confirm()))
            .rejects.toMatchObject({ status: 404 });
        const applied = await applySmartImportRepair(userId, jobId, confirm());
        expect(applied.status).toBe("relinked");
        let stored = await prisma.track.findUniqueOrThrow({ where: { id: importedTrackId } });
        expect(stored.albumId).toBe(targetAlbumId);
        expect(stored.manualAlbumId).toBe(targetAlbumId);
        expect(await prisma.smartImportRepair.count({
            where: { trackId: importedTrackId, undoneAt: null },
        })).toBe(1);

        // Simulate the scanner trying to overwrite the manual album choice.
        await prisma.$executeRawUnsafe(
            'UPDATE "Track" SET "albumId" = $1 WHERE id = $2',
            sourceAlbumId, importedTrackId,
        );
        stored = await prisma.track.findUniqueOrThrow({ where: { id: importedTrackId } });
        expect(stored.albumId).toBe(targetAlbumId);

        const reverted = await undoSmartImportRepair(userId, jobId, applied.repairId);
        expect(reverted.status).toBe("undone");
        stored = await prisma.track.findUniqueOrThrow({ where: { id: importedTrackId } });
        expect(stored.albumId).toBe(sourceAlbumId);
        expect(stored.manualAlbumId).toBeNull();
        expect(await prisma.smartImportRepair.count({
            where: { trackId: importedTrackId, undoneAt: null },
        })).toBe(0);
        expect(await prisma.smartImportRepair.count({
            where: { trackId: importedTrackId },
        })).toBe(1);
    });

    it("fails closed on stale input without updating the track or creating an audit row", async () => {
        await expect(applySmartImportRepair(userId, jobId, {
            ...confirm(), fileSize: SIZE + 10,
        })).rejects.toMatchObject({ status: 409 });
        const stored = await prisma.track.findUniqueOrThrow({ where: { id: importedTrackId } });
        expect(stored.albumId).toBe(sourceAlbumId);
        expect(stored.manualAlbumId).toBeNull();
        expect(await prisma.smartImportRepair.count({
            where: { trackId: importedTrackId },
        })).toBe(0);
    });
});
