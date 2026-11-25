import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { resolve } from "path";

// Execute the actual shell fixture's INSERTs, not a second copy of its schema.
// Jest's global setup supplies a migrated, per-worker disposable database.
const prisma = new PrismaClient();
const fileSize = 21_168_078;
const djFileSize = 48 * 44_100 * 2 + 44;
const djArtistId = "ci-dj-timing-artist";
const djAlbumId = "ci-dj-timing-album";
const djRgMbid = "ci-dj-timing-fixture-album";
const profile = (first: number) => {
    const edge = { windowMs: 24000, beatsMs: Array.from({ length: 48 }, (_, i) => first + i * 500),
        tempoBpm: 120, confidence: 3, rmsDb: Array(24).fill(-20) };
    return { version: 1, head: edge, tail: edge };
};
const artistId = "ci-ui-artist";
const albumId = "ci-ui-album";
const rgMbid = "ci-ui-fixture-album";

function fixtureInserts(): string[] {
    const source = readFileSync(resolve(__dirname, "../../../.github/ci/seed-release-ui.sh"), "utf8");
    const blocks = [...source.matchAll(/<<SQL\n([\s\S]*?)\nSQL(?:\n|$)/g)];
    expect(blocks).toHaveLength(1);
    const statements = blocks[0][1]
        .replace(/^\s*--[^\n]*/gm, "")
        .replace(/\$size\b/g, String(fileSize))
        .replace(/\$dj_size\b/g, String(djFileSize))
        // Stand in for the psql-bound JSON values only; execute the actual
        // fixture SQL against the migrated schema. Native CI generates the
        // corresponding real PCM and profile values independently.
        .replace(/:'dj_one'/g, "'" + JSON.stringify(profile(250)) + "'")
        .replace(/:'dj_two'/g, "'" + JSON.stringify(profile(370)) + "'")
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean);
    expect(statements.shift()).toBe("BEGIN");
    expect(statements.pop()).toBe("COMMIT");
    expect(statements.map((sql) => sql.match(/^INSERT INTO "(\w+)"/)?.[1]))
        .toEqual(["Artist", "Album", "OwnedAlbum", "Track", "Artist", "Album", "OwnedAlbum", "Track", "TrackDjCue"]);
    return statements;
}

beforeAll(async () => {
    const worker = process.env.JEST_WORKER_ID;
    const database = new URL(process.env.DATABASE_URL!);
    if (process.env.NODE_ENV !== "test" || !worker ||
        !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) ||
        !database.pathname.endsWith(`_w${worker}`)) {
        throw new Error("Release fixture regression requires a local isolated Jest worker database");
    }
    await expectFixturesAbsent();
});

async function expectFixturesAbsent() {
    for (const id of [artistId, djArtistId]) expect(await prisma.artist.findUnique({ where: { id } })).toBeNull();
    for (const id of [albumId, djAlbumId]) expect(await prisma.album.findUnique({ where: { id } })).toBeNull();
    expect(await prisma.track.count({ where: { id: { startsWith: "ci-dj-timing-" } } })).toBe(0);
    expect(await prisma.trackDjCue.count({ where: { trackId: { startsWith: "ci-dj-timing-" } } })).toBe(0);
}

afterAll(async () => {
    await prisma.$disconnect();
});

test("release UI fixture creates both owned albums and current DJ cues on the real migrated schema", async () => {
    const rollback = new Error("rollback successful release UI fixture regression");
    await expect(prisma.$transaction(async (tx) => {
        for (const sql of fixtureInserts()) await tx.$executeRawUnsafe(sql);
        const album = await tx.album.findUniqueOrThrow({
            where: { id: albumId },
            include: { tracks: { orderBy: { trackNo: "asc" } } },
        });
        // This is the exact composite-key lookup used by GET /library/albums/:id.
        const owned = await tx.ownedAlbum.findUnique({
            where: { artistId_rgMbid: { artistId: album.artistId, rgMbid: album.rgMbid } },
        });
        expect(owned).toEqual({ artistId, rgMbid, source: "import" });
        expect(album.tracks.map((track) => ({
            id: track.id, duration: track.duration, filePath: track.filePath, fileSize: track.fileSize,
        }))).toEqual(["one", "two", "three"].map((suffix) => ({
            id: `ci-ui-track-${suffix}`, duration: 120,
            filePath: `ci-release-ui/${suffix}.wav`, fileSize,
        })));
        const djAlbum = await tx.album.findUniqueOrThrow({
            where: { id: djAlbumId },
            include: { tracks: { orderBy: { trackNo: "asc" }, include: { djCue: true } } },
        });
        expect(await tx.ownedAlbum.findUnique({
            where: { artistId_rgMbid: { artistId: djArtistId, rgMbid: djRgMbid } },
        })).toEqual({ artistId: djArtistId, rgMbid: djRgMbid, source: "import" });
        expect(djAlbum.tracks.map(track => track.id)).toEqual(["ci-dj-timing-one", "ci-dj-timing-two"]);
        for (const [i, track] of djAlbum.tracks.entries()) {
            expect(track.duration).toBe(48);
            expect(track.fileSize).toBe(djFileSize);
            expect(track.analysisStatus).toBe("completed");
            expect(track.djCue).toMatchObject({
                sourcePath: track.filePath, sourceModified: track.fileModified,
                sourceSize: track.fileSize, sourceAnalyzedAt: track.analyzedAt,
                profile: profile(i === 0 ? 250 : 370),
            });
        }
        // Always roll back, including successful validation; do not affect other tests.
        throw rollback;
    }, { timeout: 10_000 })).rejects.toBe(rollback);
    await expectFixturesAbsent();
});

test("the previous nonexistent ownership column fails and rolls back the entire fixture", async () => {
    const statements = fixtureInserts().map((sql) => sql.startsWith('INSERT INTO "OwnedAlbum"')
        ? sql.replace('"source"', '"id"') : sql);
    await expect(prisma.$transaction(async (tx) => {
        for (const sql of statements) await tx.$executeRawUnsafe(sql);
    }, { timeout: 10_000 })).rejects.toMatchObject({ code: "P2010", meta: { code: "42703" } });
    await expectFixturesAbsent();
});

test("a failing cue insert rolls back the entire ordinary and rhythmic fixture", async () => {
    const statements = fixtureInserts().map(sql => sql.startsWith('INSERT INTO "TrackDjCue"')
        ? sql.replace('"sourceAnalyzedAt"', '"nonexistentAnalysisTime"') : sql);
    await expect(prisma.$transaction(async tx => {
        for (const sql of statements) await tx.$executeRawUnsafe(sql);
    }, { timeout: 10_000 })).rejects.toMatchObject({ code: "P2010", meta: { code: "42703" } });
    await expectFixturesAbsent();
});
