jest.mock("../../utils/db", () => ({
    prisma: {
        downloadJob: { findFirst: jest.fn() },
        track: { findUnique: jest.fn(), findMany: jest.fn() },
        artist: { findFirst: jest.fn() },
        album: { findMany: jest.fn() },
    },
}));
jest.mock("../../utils/logger", () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
import { prisma } from "../../utils/db";
import { getSmartImportSuggestion } from "../smartImportSuggestion";

const job = prisma.downloadJob.findFirst as jest.Mock;
const file = prisma.track.findUnique as jest.Mock;
const artist = prisma.artist.findFirst as jest.Mock;
const albums = prisma.album.findMany as jest.Mock;
const peers = prisma.track.findMany as jest.Mock;

const root = "Singles/Kima Downloads/";
const target = root + "Tones and I/Unknown Album/02 - Tones and I - Dance Monkey.flac";
const own = {
    id: "import-track", title: "02 - Tones and I - Dance Monkey",
    duration: 209, missingSince: null, corrupt: false,
    album: { title: "Unknown Album", location: "LIBRARY",
        artist: { id: "unknown", name: "Unknown Artist" } },
};
const libraryArtist = { id: "tones", name: "Tones and I" };

beforeEach(() => {
    jest.resetAllMocks();
    job.mockResolvedValue({ status: "completed", metadata: { importRelativePath: target } });
    file.mockResolvedValue(own);
    artist.mockResolvedValue(libraryArtist);
    albums.mockResolvedValue([]);
    peers.mockResolvedValue([{
        title: "Dance Monkey", displayTitle: null, duration: 210,
        album: { id: "kids", title: "The Kids Are Coming" },
    }]);
});

describe("Smart Inbox safe import suggestions", () => {
    it("uses a scoped job lookup and never writes or touches the filesystem", async () => {
        const result = await getSmartImportSuggestion("owner", "job-1");
        expect(job).toHaveBeenCalledWith({
            where: { id: "job-1", userId: "owner", type: "soulseek-search", cleared: false },
            select: { status: true, metadata: true },
        });
        expect(file).toHaveBeenCalledWith(expect.objectContaining({ where: { filePath: target } }));
        expect(result).toMatchObject({
            status: "suggested", readOnly: true,
            proposedArtist: libraryArtist,
            proposedAlbum: { id: "kids", title: "The Kids Are Coming" },
            evidence: ["folder-artist", "existing-library-artist", "same-title-duration"],
        });
        expect(artist.mock.calls[0][0].where).toMatchObject({
            albums: { some: { location: "LIBRARY", tracks: { some: { missingSince: null, corrupt: false } } } },
        });
        expect(peers.mock.calls[0][0].where.album).toEqual({ artistId: "tones", location: "LIBRARY" });
        expect(peers.mock.calls[0][0].take).toBe(12);
    });

    it("never reveals another user's download or looks up their track", async () => {
        job.mockResolvedValue(null);
        expect(await getSmartImportSuggestion("other", "job-1")).toBeNull();
        expect(file).not.toHaveBeenCalled();
        expect(artist).not.toHaveBeenCalled();
    });

    it("does not guess for a legacy, active, missing or corrupt download", async () => {
        job.mockResolvedValue({ status: "completed", metadata: null });
        expect((await getSmartImportSuggestion("owner", "legacy"))?.status).toBe("unavailable");
        job.mockResolvedValue({ status: "processing", metadata: { importRelativePath: target } });
        expect((await getSmartImportSuggestion("owner", "active"))?.status).toBe("unavailable");
        job.mockResolvedValue({ status: "completed", metadata: { importRelativePath: target } });
        file.mockResolvedValue(null);
        expect((await getSmartImportSuggestion("owner", "not-indexed"))?.status).toBe("unavailable");
        file.mockResolvedValue({ ...own, corrupt: true });
        expect((await getSmartImportSuggestion("owner", "corrupt"))?.status).toBe("unavailable");
        expect(artist).not.toHaveBeenCalled();
    });

    it("rejects conflicting explicit artist tags", async () => {
        file.mockResolvedValue({ ...own, album: { ...own.album,
            location: "DISCOVER", artist: { id: "another", name: "Another Singer" } } });
        const result = await getSmartImportSuggestion("owner", "conflict");
        expect(result).toMatchObject({ status: "conflict", proposedArtist: null, proposedAlbum: null });
        expect(artist).not.toHaveBeenCalled();
    });

    it("requires a real artist with playable library tracks", async () => {
        artist.mockResolvedValue(null);
        expect((await getSmartImportSuggestion("owner", "no-match"))?.status).toBe("no-match");
        expect(albums).not.toHaveBeenCalled();
        expect(peers).not.toHaveBeenCalled();
    });

    it("can suggest an exact named album from the same indexed artist", async () => {
        const folder = root + "Tones and I/The Kids Are Coming/Dance Monkey.flac";
        job.mockResolvedValue({ status: "completed", metadata: { importRelativePath: folder } });
        albums.mockResolvedValue([{ id: "kids", title: "The Kids Are Coming" }]);
        const result = await getSmartImportSuggestion("owner", "album");
        expect(result).toMatchObject({ proposedAlbum: { id: "kids" }, evidence: [
            "folder-artist", "existing-library-artist", "folder-album",
        ] });
        expect(peers).not.toHaveBeenCalled();
        expect(albums.mock.calls[0][0].where).toMatchObject({
            artistId: "tones", location: "LIBRARY",
            title: { equals: "The Kids Are Coming", mode: "insensitive" },
        });
    });

    it("never chooses among two albums with the same title or overlapping songs", async () => {
        const folder = root + "Tones and I/The Kids Are Coming/Dance Monkey.flac";
        job.mockResolvedValue({ status: "completed", metadata: { importRelativePath: folder } });
        albums.mockResolvedValue([{ id: "one", title: "The Kids Are Coming" }, { id: "two", title: "The Kids Are Coming" }]);
        expect((await getSmartImportSuggestion("owner", "two-albums"))?.proposedAlbum).toBeNull();
        job.mockResolvedValue({ status: "completed", metadata: { importRelativePath: target } });
        peers.mockResolvedValue([
            { title: "Dance Monkey", displayTitle: null, duration: 209, album: { id: "one", title: "Release One" } },
            { title: "Dance Monkey", displayTitle: null, duration: 209, album: { id: "two", title: "Release Two" } },
        ]);
        expect((await getSmartImportSuggestion("owner", "two-tracks"))?.proposedAlbum).toBeNull();
    });

    it("does not use title-only matching when duration disagrees or is unknown", async () => {
        peers.mockResolvedValue([{ title: "Dance Monkey", displayTitle: null, duration: 280,
            album: { id: "other", title: "Other album" } }]);
        expect((await getSmartImportSuggestion("owner", "remix"))?.proposedAlbum).toBeNull();
        file.mockResolvedValue({ ...own, duration: 0 });
        expect((await getSmartImportSuggestion("owner", "no-duration"))?.proposedAlbum).toBeNull();
    });

    it("never promotes a conflicting performer credited in the filename", async () => {
        job.mockResolvedValue({
            status: "completed",
            metadata: { importRelativePath: root + "Tones and I/Unknown Album/01 - Another Singer - Dance Monkey.flac" },
        });
        expect((await getSmartImportSuggestion("owner", "singer-conflict"))?.proposedAlbum).toBeNull();
    });

    it("propagates DB outages instead of inventing a valid suggestion", async () => {
        artist.mockRejectedValue(new Error("db offline"));
        await expect(getSmartImportSuggestion("owner", "offline")).rejects.toThrow("db offline");
    });
});
