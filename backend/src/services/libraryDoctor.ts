/**
 * Library Doctor v1: read-only diagnostics derived from the last music scan.
 * Never touches audio files, triggers rescans or changes database records.
 * Results are calculated only when an administrator requests a report.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../utils/db";

const IMPORT_ROOT = "Singles/Kima Downloads/";
const SAMPLE_LIMIT = 8;

export interface LibraryDoctorSample {
    id: string;
    title: string;
    album: string;
    artist: string;
    filePath: string;
}

export interface LibraryDoctorReport {
    generatedAt: string;
    basis: "indexed-metadata";
    sampleLimit: number;
    counts: {
        libraryTracks: number;
        missingTracks: number;
        corruptTracks: number;
        albumsWithoutCover: number;
        artistsWithoutImage: number;
        importsToReview: number;
    };
    samples: {
        missingTracks: LibraryDoctorSample[];
        importsToReview: LibraryDoctorSample[];
    };
}

const libraryTracksWhere: Prisma.TrackWhereInput = {
    album: { location: "LIBRARY" },
};
const missingTracksWhere: Prisma.TrackWhereInput = {
    ...libraryTracksWhere,
    missingSince: { not: null },
};
const corruptTracksWhere: Prisma.TrackWhereInput = {
    ...libraryTracksWhere,
    corrupt: true,
};

const albumsWithoutCoverWhere: Prisma.AlbumWhereInput = {
    location: "LIBRARY",
    userCoverUrl: null,
    OR: [{ coverUrl: null }, { coverUrl: "" }],
    tracks: { some: { missingSince: null, corrupt: false } },
};
const artistsWithoutImageWhere: Prisma.ArtistWhereInput = {
    userHeroUrl: null,
    OR: [{ heroUrl: null }, { heroUrl: "" }],
    albums: {
        some: {
            location: "LIBRARY",
            tracks: { some: { missingSince: null, corrupt: false } },
        },
    },
};

/**
 * Candidates, NOT confirmed metadata errors: an indexed Soulseek import may
 * still need review if it is in DISCOVER or has a placeholder artist name.
 * Exclude missing/corrupt tracks so the categories remain actionable.
 */
const importsToReviewWhere: Prisma.TrackWhereInput = {
    filePath: { startsWith: IMPORT_ROOT },
    missingSince: null,
    corrupt: false,
    OR: [
        { album: { location: "DISCOVER" } },
        { album: { artist: { name: { in: ["Unknown Artist", "Unknown"], mode: "insensitive" } } } },
    ],
};

const sampleSelect = {
    id: true,
    title: true,
    filePath: true,
    album: { select: { title: true, artist: { select: { name: true } } } },
} as const;

export async function getLibraryDoctorReport(): Promise<LibraryDoctorReport> {
    // On-demand DB-only queries. No filesystem walk, no unbounded row lists,
    // no N+1 operations and no Prisma writes.
    const [
        libraryTracks, missingTracks, corruptTracks, albumsWithoutCover,
        artistsWithoutImage, importsToReview, missingRows, importRows,
    ] = await Promise.all([
        prisma.track.count({ where: libraryTracksWhere }),
        prisma.track.count({ where: missingTracksWhere }),
        prisma.track.count({ where: corruptTracksWhere }),
        prisma.album.count({ where: albumsWithoutCoverWhere }),
        prisma.artist.count({ where: artistsWithoutImageWhere }),
        prisma.track.count({ where: importsToReviewWhere }),
        prisma.track.findMany({
            where: missingTracksWhere,
            orderBy: { missingSince: "asc" },
            take: SAMPLE_LIMIT,
            select: sampleSelect,
        }),
        prisma.track.findMany({
            where: importsToReviewWhere,
            orderBy: { filePath: "asc" },
            take: SAMPLE_LIMIT,
            select: sampleSelect,
        }),
    ]);

    const asSamples = (rows: typeof missingRows): LibraryDoctorSample[] => rows.map((row) => ({
        id: row.id,
        title: row.title,
        album: row.album.title,
        artist: row.album.artist.name,
        filePath: row.filePath,
    }));

    return {
        generatedAt: new Date().toISOString(),
        basis: "indexed-metadata",
        sampleLimit: SAMPLE_LIMIT,
        counts: {
            libraryTracks, missingTracks, corruptTracks, albumsWithoutCover,
            artistsWithoutImage, importsToReview,
        },
        samples: {
            missingTracks: asSamples(missingRows),
            importsToReview: asSamples(importRows),
        },
    };
}
