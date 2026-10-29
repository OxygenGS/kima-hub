/**
 * Real PostgreSQL regression for v1.14 search: no mocks and no external APIs.
 * CI applies the same additive migration that a self-hosted upgrade receives.
 */
import { randomUUID } from "crypto";
import { prisma } from "../../utils/db";
import { searchService } from "../search";

jest.setTimeout(30_000);

const suffix = randomUUID().replace(/-/g, "");
const artistId = `search-artist-${suffix}`;
const albumId = `search-album-${suffix}`;
const trackId = `search-track-${suffix}`;
const missingId = `search-missing-${suffix}`;

describe("indexed music typo search on real PostgreSQL", () => {
    beforeAll(async () => {
        await prisma.artist.create({
            data: { id: artistId, name: "Astraloria", identityKey: `search-identity-${suffix}` },
        });
        await prisma.album.create({
            data: {
                id: albumId,
                artistId,
                rgMbid: `search-rg-${suffix}`,
                title: "Velvet Currents",
                primaryType: "Album",
            },
        });
        await prisma.track.createMany({
            data: [
                {
                    id: trackId,
                    albumId,
                    title: "Golden Halos",
                    trackNo: 1,
                    duration: 180,
                    filePath: `/tmp/kima-search-${suffix}-1.flac`,
                    fileModified: new Date(),
                    fileSize: 12000,
                },
                {
                    id: missingId,
                    albumId,
                    title: "Neon Silences",
                    trackNo: 2,
                    duration: 160,
                    filePath: `/tmp/kima-search-${suffix}-2.flac`,
                    fileModified: new Date(),
                    fileSize: 12000,
                    missingSince: new Date(),
                },
            ],
        });
    });

    afterAll(async () => {
        // Album/Track rows have ON DELETE CASCADE; do not leave fixture music.
        await prisma.artist.deleteMany({ where: { id: artistId } });
    });

    it("matches a misspelled artist name while retaining the album-ownership requirement", async () => {
        const artists = await searchService.searchArtists({ query: "Astralria", limit: 20 });
        expect(artists.map((artist) => artist.id)).toContain(artistId);
    });

    it("matches misspelled album and track titles", async () => {
        const albums = await searchService.searchAlbums({ query: "Velvet Curents", limit: 20 });
        expect(albums.map((album) => album.id)).toContain(albumId);
        const tracks = await searchService.searchTracks({ query: "Goldn Halos", limit: 20 });
        expect(tracks.map((track) => track.id)).toContain(trackId);
    });

    it("excludes missing local tracks from indexed typo results", async () => {
        const tracks = await searchService.searchTracks({ query: "Neon Silnces", limit: 100 });
        expect(tracks.map((track) => track.id)).not.toContain(missingId);
    });

    it("has the expected index-backed search extension after migration", async () => {
        const installed = await prisma.$queryRaw<Array<{ extname: string }>>`
            SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'
        `;
        expect(installed).toEqual([{ extname: "pg_trgm" }]);
    });
});
