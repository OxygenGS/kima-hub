/**
 * Real PostgreSQL regression: exercise the exact read-only window query,
 * eligibility filters and fingerprint comparison against disposable CI DB.
 */
import { randomUUID } from "crypto";
import { prisma } from "../../utils/db";
import { getLibraryGuardianDuplicates } from "../libraryGuardianDuplicates";

jest.setTimeout(60000);

const stamp = randomUUID().replace(/-/g, "").slice(0, 12);
const artistId = "guardian-artist-" + stamp;
const sourceAlbumId = "guardian-album-a-" + stamp;
const targetAlbumId = "guardian-album-b-" + stamp;
const discoverAlbumId = "guardian-discover-" + stamp;
const recordingMbid = randomUUID();
const trackIds = ["one", "two", "discover", "missing", "corrupt"]
    .map(label => "guardian-" + stamp + "-" + label);

const modified = new Date("2026-11-17T08:00:00.000Z");

beforeAll(async () => {
    await prisma.artist.create({
        data: {
            id: artistId, name: "Guardian Test Artist " + stamp,
            identityKey: "guardiantestartist" + stamp,
        },
    });
    for (const [id, kind] of [
        [sourceAlbumId, "LIBRARY"],
        [targetAlbumId, "LIBRARY"],
        [discoverAlbumId, "DISCOVER"],
    ] as const) {
        await prisma.album.create({
            data: {
                id, artistId, rgMbid: "rg-guardian-" + id,
                title: "Album " + id, primaryType: "Album", location: kind,
            },
        });
    }
    const records = [
        { id: trackIds[0], albumId: sourceAlbumId, title: "Same Recording", duration: 200,
            fingerprint: "guardian-signature-" + stamp, missingSince: null, corrupt: false },
        { id: trackIds[1], albumId: targetAlbumId, title: "Same Recording", duration: 201,
            fingerprint: "guardian-signature-" + stamp, missingSince: null, corrupt: false },
        { id: trackIds[2], albumId: discoverAlbumId, title: "Same Recording", duration: 200,
            fingerprint: "guardian-signature-" + stamp, missingSince: null, corrupt: false },
        { id: trackIds[3], albumId: sourceAlbumId, title: "Same Recording", duration: 200,
            fingerprint: "guardian-signature-" + stamp, missingSince: new Date(), corrupt: false },
        { id: trackIds[4], albumId: sourceAlbumId, title: "Same Recording", duration: 200,
            fingerprint: "guardian-signature-" + stamp, missingSince: null, corrupt: true },
    ];
    for (const r of records) {
        await prisma.track.create({
            data: {
                id: r.id, albumId: r.albumId, title: r.title,
                trackNo: 1, duration: r.duration,
                filePath: `Guardian Test/${stamp}/${r.id}.flac`,
                fileModified: modified, fileSize: 1000,
                recordingMbid, acoustidFingerprint: r.fingerprint,
                missingSince: r.missingSince, corrupt: r.corrupt,
            },
        });
    }
});

afterAll(async () => {
    await prisma.track.deleteMany({ where: { id: { in: trackIds } } });
    await prisma.album.deleteMany({
        where: { id: { in: [sourceAlbumId, targetAlbumId, discoverAlbumId] } },
    });
    await prisma.artist.deleteMany({ where: { id: artistId } });
    await prisma.$disconnect();
});

describe("Library Guardian real PostgreSQL query", () => {
    it("finds two available copies but excludes DISCOVER, missing and corrupt tracks", async () => {
        const report = await getLibraryGuardianDuplicates(12);
        const row = report.candidates.find(c => c.recordingMbid === recordingMbid);
        expect(row).toBeDefined();
        expect(row).toMatchObject({
            recordingMbid, indexedCopies: 2,
            evidence: "matching-acoustic-fingerprint",
        });
        expect(row!.tracks.map(t => t.id).sort()).toEqual(trackIds.slice(0, 2).sort());
        expect(report.readOnly).toBe(true);
        expect(report.sampleLimit).toBe(4);
        expect(JSON.stringify(row)).not.toContain("guardian-signature-");
        expect(JSON.stringify(row)).not.toContain("fingerprintDigest");
    });

    it("does not edit, deduplicate or delete any indexed track", async () => {
        const before = await prisma.track.count({ where: { id: { in: trackIds } } });
        await getLibraryGuardianDuplicates(8);
        const after = await prisma.track.count({ where: { id: { in: trackIds } } });
        expect(before).toBe(5);
        expect(after).toBe(before);
    });
});
