jest.mock("../../utils/db", () => ({
    prisma: {
        track: { count: jest.fn(), findMany: jest.fn() },
        album: { count: jest.fn() },
        artist: { count: jest.fn() },
    },
}));

import { prisma } from "../../utils/db";
import { getLibraryDoctorReport } from "../libraryDoctor";

const countTracks = prisma.track.count as jest.Mock;
const findTracks = prisma.track.findMany as jest.Mock;

beforeEach(() => {
    jest.resetAllMocks();
    countTracks
        .mockResolvedValueOnce(120)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(4);
    (prisma.album.count as jest.Mock).mockResolvedValue(7);
    (prisma.artist.count as jest.Mock).mockResolvedValue(5);
    findTracks
        .mockResolvedValueOnce([{
            id: "missing-1", title: "Unplugged", filePath: "Artist/Album/song.flac",
            album: { title: "Album", artist: { name: "Artist" } },
        }])
        .mockResolvedValueOnce([{
            id: "import-1", title: "Dance Monkey",
            filePath: "Singles/Kima Downloads/Tones and I/Unknown Album/song.flac",
            album: { title: "Unknown Album", artist: { name: "Unknown Artist" } },
        }]);
});

describe("Library Doctor read-only diagnostics", () => {
    it("returns accurate counts and bounded, sanitized sample fields", async () => {
        const report = await getLibraryDoctorReport();
        expect(report.basis).toBe("indexed-metadata");
        expect(report.counts).toEqual({
            libraryTracks: 120,
            missingTracks: 3,
            corruptTracks: 2,
            albumsWithoutCover: 7,
            artistsWithoutImage: 5,
            importsToReview: 4,
        });
        expect(report.samples.importsToReview[0]).toEqual({
            id: "import-1", title: "Dance Monkey", album: "Unknown Album",
            artist: "Unknown Artist",
            filePath: "Singles/Kima Downloads/Tones and I/Unknown Album/song.flac",
        });
        expect(report.sampleLimit).toBe(8);
        for (const [call] of findTracks.mock.calls) {
            expect(call.take).toBe(8);
            expect(call.select).toBeDefined();
        }
    });

    it("limits missing files to library tracks and never clears marks", async () => {
        await getLibraryDoctorReport();
        expect(countTracks.mock.calls[1][0].where).toMatchObject({
            album: { location: "LIBRARY" },
            missingSince: { not: null },
        });
        expect(countTracks.mock.calls[2][0].where).toMatchObject({
            album: { location: "LIBRARY" }, corrupt: true,
        });
        expect(prisma.album.count).toHaveBeenCalledWith({
            where: expect.objectContaining({
                location: "LIBRARY", userCoverUrl: null,
                tracks: { some: { missingSince: null, corrupt: false } },
            }),
        });
        expect(prisma.artist.count).toHaveBeenCalledWith({
            where: expect.objectContaining({ userHeroUrl: null }),
        });
        expect((prisma.track as unknown as { updateMany?: jest.Mock }).updateMany).toBeUndefined();
    });

    it("scopes suspicious imports to the app-owned Soulseek folder", async () => {
        await getLibraryDoctorReport();
        const where = countTracks.mock.calls[3][0].where;
        expect(where.filePath).toEqual({ startsWith: "Singles/Kima Downloads/" });
        expect(where.missingSince).toBeNull();
        expect(where.corrupt).toBe(false);
        expect(where.OR).toEqual(expect.arrayContaining([
            { album: { location: "DISCOVER" } },
            { album: { artist: { name: { in: ["Unknown Artist", "Unknown"], mode: "insensitive" } } } },
        ]));
        expect(findTracks.mock.calls[1][0].where).toEqual(where);
    });

    it("propagates database failures instead of presenting an empty healthy report", async () => {
        countTracks.mockReset().mockRejectedValue(new Error("Database unavailable"));
        await expect(getLibraryDoctorReport()).rejects.toThrow("Database unavailable");
    });
});
