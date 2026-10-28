import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { resolve } from "path";

// Execute the actual shell fixture's INSERTs, not a second copy of its schema.
// Jest's global setup supplies a migrated, per-worker disposable database.
const prisma = new PrismaClient();
const fileSize = 21_168_078;
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
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean);
    expect(statements.shift()).toBe("BEGIN");
    expect(statements.pop()).toBe("COMMIT");
    expect(statements.map((sql) => sql.match(/^INSERT INTO "(\w+)"/)?.[1]))
        .toEqual(["Artist", "Album", "OwnedAlbum", "Track"]);
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
    expect(await prisma.artist.findUnique({ where: { id: artistId } })).toBeNull();
});

afterAll(async () => {
    await prisma.$disconnect();
});

test("release UI fixture creates an owned album with three tracks on the real migrated schema", async () => {
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
        // Always roll back, including successful validation; do not affect other tests.
        throw rollback;
    }, { timeout: 10_000 })).rejects.toBe(rollback);
    expect(await prisma.artist.findUnique({ where: { id: artistId } })).toBeNull();
    expect(await prisma.album.findUnique({ where: { id: albumId } })).toBeNull();
});

test("the previous nonexistent ownership column fails and rolls back the entire fixture", async () => {
    const statements = fixtureInserts().map((sql) => sql.startsWith('INSERT INTO "OwnedAlbum"')
        ? sql.replace('"source"', '"id"') : sql);
    await expect(prisma.$transaction(async (tx) => {
        for (const sql of statements) await tx.$executeRawUnsafe(sql);
    }, { timeout: 10_000 })).rejects.toMatchObject({ code: "P2010", meta: { code: "42703" } });
    expect(await prisma.artist.findUnique({ where: { id: artistId } })).toBeNull();
    expect(await prisma.album.findUnique({ where: { id: albumId } })).toBeNull();
});
