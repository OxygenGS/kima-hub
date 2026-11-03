import { matchCatalogTracks, withLocalTrackAvailability, type LocalCandidate } from "../catalogTrackAvailability";
import { prisma } from "../../utils/db";

jest.mock("../../utils/db", () => ({
    prisma: {
        artist: { findMany: jest.fn() },
        track: { findMany: jest.fn() },
    },
}));

const ARTIST = "Tones and I";
const RELEASE = "11111111-1111-1111-1111-111111111111";
const ARTIST_MBID = "22222222-2222-2222-2222-222222222222";
const available = (
    id: string, title: string, length = 209, artist = ARTIST, recordingMbid: string | null = null,
): LocalCandidate => ({
    id, title, displayTitle: null, duration: length, recordingMbid,
    album: {
        id: "single-" + id, title: "Unknown Album", coverUrl: null,
        rgMbid: "temp-" + id,
        artist: { id: "local-artist", name: artist },
    },
});
const catalog = () => ({
    id: RELEASE, rgMbid: RELEASE, title: "The Kids Are Coming",
    artist: { name: ARTIST, mbid: ARTIST_MBID },
    owned: false, source: "discovery",
    tracks: [
        { id: "mb-one", title: "The Kids Are Coming", duration: 204, trackNo: 1 },
        { id: "mb-two", title: "Dance Monkey", duration: 209, trackNo: 2 },
        { id: "mb-three", title: "Colourblind", duration: 206, trackNo: 3 },
    ],
});

beforeEach(() => {
    jest.clearAllMocks();
    (prisma.artist.findMany as jest.Mock).mockResolvedValue([{ id: "local-artist", mbid: ARTIST_MBID }]);
    (prisma.track.findMany as jest.Mock).mockResolvedValue([]);
});

describe("MusicBrainz album availability from Soulseek singles", () => {
    it("links a verified single without falsely owning the whole album", async () => {
        (prisma.track.findMany as jest.Mock).mockResolvedValue([available("local-dance-monkey", "Dance Monkey")]);
        const merged = await withLocalTrackAvailability(catalog());
        expect(merged.owned).toBe(false);
        expect(merged.availableTrackCount).toBe(1);
        expect(merged.tracks.map(t => t.id)).toEqual(["mb-one", "local-dance-monkey", "mb-three"]);
        expect(merged.tracks[1]).toMatchObject({
            isAvailable: true,
            trackNo: 2,
            album: { id: "single-local-dance-monkey", title: "Unknown Album" },
        });
        expect(merged.tracks[0].isAvailable).toBe(false);
        const query = (prisma.track.findMany as jest.Mock).mock.calls[0][0];
        expect(query.where).toMatchObject({ missingSince: null, corrupt: false });
        expect(query.where.AND[0].OR).toEqual(expect.arrayContaining([
            { filePath: { startsWith: "Singles/Kima Downloads/" } },
        ]));
    });

    it("rechecks the local database on every call rather than caching an absent result", async () => {
        const base = catalog();
        expect((await withLocalTrackAvailability(base)).availableTrackCount).toBe(0);
        (prisma.track.findMany as jest.Mock).mockResolvedValue([available("new-file", "Dance Monkey")]);
        const fresh = await withLocalTrackAvailability(base);
        expect(fresh.availableTrackCount).toBe(1);
        expect(base.tracks[1].id).toBe("mb-two");
        expect(prisma.track.findMany).toHaveBeenCalledTimes(2);
    });

    it("excludes a different identified artist even when the name matches", async () => {
        (prisma.artist.findMany as jest.Mock).mockResolvedValue([
            { id: "impostor", mbid: "33333333-3333-3333-3333-333333333333" },
        ]);
        expect((await withLocalTrackAvailability(catalog())).availableTrackCount).toBe(0);
        // The tagless-import fallback is still allowed for the real artist's
        // private download directory, but never queries the impostor's rows.
        const query = (prisma.track.findMany as jest.Mock).mock.calls[0][0];
        expect(query.where.AND[1].OR).toEqual(expect.arrayContaining([
            { filePath: { startsWith: "Singles/Kima Downloads/Tones and I/", mode: "insensitive" } },
        ]));
        expect(JSON.stringify(query.where.AND[1])).not.toContain("impostor");
    });

    it("rejects live/remix variants and significantly different durations", () => {
        const singles = [
            available("live", "Dance Monkey (Live)", 209),
            available("other-length", "Dance Monkey", 260),
        ];
        expect(matchCatalogTracks(catalog().tracks, singles, ARTIST)[1].id).toBe("mb-two");
    });

    it("never assigns the same local file to two release rows", () => {
        const twice = [
            { id: "mb-first", title: "Dance Monkey", duration: 209 },
            { id: "mb-second", title: "Dance Monkey", duration: 209 },
        ];
        const result = matchCatalogTracks(twice, [available("only-file", "Dance Monkey")], ARTIST);
        expect(result.filter(track => track.isAvailable)).toHaveLength(1);
    });

    it("prioritizes a verified recording MBID and rejects another verified recording", () => {
        const id = "44444444-4444-4444-4444-444444444444";
        const otherId = "55555555-5555-5555-5555-555555555555";
        const tracks = [{ id: "catalog", title: "Dance Monkey", duration: 209, recordingMbid: id }];
        const result = matchCatalogTracks(
            tracks,
            [available("wrong-id", "Dance Monkey", 209, ARTIST, otherId),
             available("right-id", "Dance Monkey", 209, ARTIST, id)],
            ARTIST,
        );
        expect(result[0].id).toBe("right-id");
    });

    it("recognizes tagless numbered filenames from the dedicated Soulseek import", () => {
        const file = available("tagless", "02 - Dance Monkey", 209);
        file.filePath = "Singles/Kima Downloads/Tones and I/Unknown Album/02 - Dance Monkey.flac";
        expect(matchCatalogTracks(catalog().tracks, [file], ARTIST)[1].id).toBe("tagless");
        file.title = "Tones and I - Dance Monkey";
        expect(matchCatalogTracks(catalog().tracks, [file], ARTIST)[1].id).toBe("tagless");
    });

    it("does not strip numbered prefixes from unrelated existing library tracks", () => {
        const file = available("regular", "02 - Dance Monkey", 209);
        file.filePath = "Tones and I/An Album/02 - Dance Monkey.flac";
        expect(matchCatalogTracks(catalog().tracks, [file], ARTIST)[1].id).toBe("mb-two");
    });

    it("does not treat a different singer's cover as the same recording", () => {
        const result = matchCatalogTracks(
            [{ id: "mb", title: "Dance Monkey", duration: 209 }],
            [available("cover", "Dance Monkey", 209, "Other performer")],
            ARTIST,
        );
        expect(result[0].id).toBe("mb");
    });
});


describe("App-owned Soulseek folder fallback for incorrectly tagged singles", () => {
    const tagless = (filePath: string, title = "Tones and I - Dance Monkey"): LocalCandidate => ({
        ...available("tagless-from-unknown-artist", title, 209, "Unknown Artist"),
        filePath,
        album: {
            ...available("tagless-from-unknown-artist", title).album,
            artist: { id: "unknown-artist-row", name: "Unknown Artist", mbid: null },
        },
    });

    it("links Dance Monkey when the file is tagged Unknown Artist but the dedicated import folder identifies Tones and I", async () => {
        (prisma.artist.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.track.findMany as jest.Mock).mockResolvedValue([
            tagless("Singles/Kima Downloads/Tones and I/Unknown Album/02 - Tones and I - Dance Monkey.flac",
                "02 - Tones and I - Dance Monkey"),
        ]);

        const result = await withLocalTrackAvailability(catalog());
        expect(result.availableTrackCount).toBe(1);
        expect(result.tracks[1]).toMatchObject({
            id: "tagless-from-unknown-artist", isAvailable: true,
        });
        expect(result.tracks[0].isAvailable).toBe(false);
        expect(result.owned).toBe(false);

        const query = (prisma.track.findMany as jest.Mock).mock.calls[0][0];
        expect(query.where.AND[1].OR).toEqual(expect.arrayContaining([
            { filePath: { startsWith: "Singles/Kima Downloads/Tones and I/", mode: "insensitive" } },
            { filePath: { startsWith: "Singles/Kima Downloads/Tones & I/", mode: "insensitive" } },
        ]));
        // Fail closed for other directories and artists, even with identical titles.
        expect(query.where.AND[0].OR).toContainEqual(
            { filePath: { startsWith: "Singles/Kima Downloads/" } },
        );
    });

    it("accepts an ampersand alias in the download folder with the same exact artist identity", () => {
        const candidate = tagless(
            "Singles/Kima Downloads/Tones & I/Album/02 - Tones & I - Dance Monkey.flac",
            "02 - Tones & I - Dance Monkey",
        );
        expect(matchCatalogTracks(catalog().tracks, [candidate], ARTIST)[1].id)
            .toBe(candidate.id);
    });

    it("matches a tagless filename using underscores without fetching unrelated library tracks", async () => {
        (prisma.artist.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.track.findMany as jest.Mock).mockResolvedValue([
            tagless("Singles/Kima Downloads/Tones and I/Unknown Album/02_Dance_Monkey.flac",
                "02_Dance_Monkey"),
        ]);

        const result = await withLocalTrackAvailability(catalog());
        expect(result.availableTrackCount).toBe(1);
        expect(result.tracks[1].isAvailable).toBe(true);
        const query = (prisma.track.findMany as jest.Mock).mock.calls[0][0];
        expect(query.where.AND[2].OR).toEqual(expect.arrayContaining([
            expect.objectContaining({
                OR: expect.arrayContaining([
                    { filePath: { contains: "Monkey", mode: "insensitive" } },
                ]),
            }),
        ]));
    });

    it("rejects a different explicitly tagged performer even in a correctly named import folder", () => {
        const candidate = tagless(
            "Singles/Kima Downloads/Tones and I/Album/Dance Monkey.flac",
            "Dance Monkey",
        );
        candidate.album.artist.name = "Another Singer";
        expect(matchCatalogTracks(catalog().tracks, [candidate], ARTIST)[1].isAvailable).toBe(false);
    });

    it("rejects a wrong performer folder for tagless files", () => {
        const candidate = tagless(
            "Singles/Kima Downloads/Other Artist/Album/Dance Monkey.flac",
            "Dance Monkey",
        );
        expect(matchCatalogTracks(catalog().tracks, [candidate], ARTIST)[1].isAvailable).toBe(false);
    });

    it("refuses a conflicting known artist MBID even if the folder and title agree", () => {
        const candidate = tagless(
            "Singles/Kima Downloads/Tones and I/Album/Dance Monkey.flac",
            "Dance Monkey",
        );
        candidate.album.artist.mbid = "33333333-3333-3333-3333-333333333333";
        expect(matchCatalogTracks(catalog().tracks, [candidate], ARTIST, RELEASE, ARTIST_MBID)[1].isAvailable)
            .toBe(false);
    });

    it("rejects different versions even for an untagged download", () => {
        const candidate = tagless(
            "Singles/Kima Downloads/Tones and I/Album/Dance Monkey (Live).flac",
            "Dance Monkey (Live)",
        );
        expect(matchCatalogTracks(catalog().tracks, [candidate], ARTIST)[1].isAvailable).toBe(false);
    });
});


describe("representative artist-folder and compilation imports", () => {
    const artistFilePath = "Tones and I/Tones and I_Sample EP_02_Dance Monkey.flac";
    const compilationFilePath = "Singles/Kima Downloads/71 [2020]/Disc 2/01. Tones And I - Dance Monkey.flac";
    const artistFile = (): LocalCandidate => ({
        ...available("real-album-file", "Tones and I_The Kids Are Coming_02_Dance Monkey", 209),
        filePath: artistFilePath,
    });
    const compilationFile = (artist = "71 [2020]", title = "01. Tones And I - Dance Monkey"): LocalCandidate => ({
        ...available("real-compilation-file", title, 209, artist),
        filePath: compilationFilePath,
        album: {
            ...available("real-compilation-file", title, 209, artist).album,
            artist: { id: "compilation-artist", name: artist, mbid: null },
        },
    });

    it("recognizes the user's artist-folder filename without requiring a metadata rewrite", () => {
        const result = matchCatalogTracks(catalog().tracks, [artistFile()], ARTIST, RELEASE, ARTIST_MBID);
        expect(result[1]).toMatchObject({ id: "real-album-file", isAvailable: true });
        expect(result[0].isAvailable).toBe(false);
    });

    it("recognizes the actual compilation file despite a numeric folder parsed as artist", () => {
        const result = matchCatalogTracks(catalog().tracks, [compilationFile()], ARTIST, RELEASE, ARTIST_MBID);
        expect(result[1]).toMatchObject({ id: "real-compilation-file", isAvailable: true });
        expect(result[2].isAvailable).toBe(false);
    });

    it("recognizes the compilation file when its album artist is Various Artists", () => {
        expect(matchCatalogTracks(catalog().tracks, [compilationFile("Various Artists")], ARTIST)[1])
            .toMatchObject({ isAvailable: true });
    });

    it("prioritizes the identified artist's physical file when both versions agree", () => {
        const results = matchCatalogTracks(catalog().tracks, [compilationFile(), artistFile()], ARTIST);
        expect(results[1].id).toBe("real-album-file");
        expect(results.filter(t => t.isAvailable)).toHaveLength(1);
    });

    it("queries the actual artist and compilation paths even without an indexed Artist record", async () => {
        (prisma.artist.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.track.findMany as jest.Mock).mockResolvedValue([artistFile(), compilationFile()]);
        const merged = await withLocalTrackAvailability(catalog());
        expect(merged.availableTrackCount).toBe(1);
        expect(merged.tracks[1].id).toBe("real-album-file");
        expect(merged.owned).toBe(false);

        const query = (prisma.track.findMany as jest.Mock).mock.calls[0][0];
        expect(query.where.AND[1].OR).toEqual(expect.arrayContaining([
            { filePath: { startsWith: "Tones and I/", mode: "insensitive" } },
            { AND: [
                { filePath: { startsWith: "Singles/Kima Downloads/", mode: "insensitive" } },
                { OR: expect.arrayContaining([
                    { filePath: { contains: "Tones and I", mode: "insensitive" } },
                ]) },
            ] },
        ]));
        expect(query.where.AND[2].OR).toEqual(expect.arrayContaining([
            expect.objectContaining({ OR: expect.arrayContaining([
                { filePath: { contains: "Monkey", mode: "insensitive" } },
            ]) }),
        ]));
    });

    it("never trusts a different explicitly tagged artist even when the filename credits Tones and I", () => {
        const otherSinger = compilationFile("Another Singer");
        expect(matchCatalogTracks(catalog().tracks, [otherSinger], ARTIST)[1].isAvailable).toBe(false);
    });

    it("never trusts a different performer in the compilation filename", () => {
        const candidate = {
            ...compilationFile("71 [2020]", "01. Other Singer - Dance Monkey"),
            filePath: compilationFilePath.replace("Tones And I", "Other Singer"),
        };
        expect(matchCatalogTracks(catalog().tracks, [candidate], ARTIST)[1].isAvailable).toBe(false);
    });

    it("does not override explicit live titles with the studio title in the filename", () => {
        const taggedLive = compilationFile("Various Artists", "Dance Monkey (Live)");
        expect(matchCatalogTracks(catalog().tracks, [taggedLive], ARTIST)[1].isAvailable).toBe(false);
    });

    it("rejects compilation downloads with mismatched duration", () => {
        const wrongLength = { ...compilationFile("Various Artists"), duration: 243 };
        expect(matchCatalogTracks(catalog().tracks, [wrongLength], ARTIST)[1].isAvailable).toBe(false);
    });

    it("rejects an album artist with a conflicting MusicBrainz ID", () => {
        const mismatch = compilationFile("71 [2020]");
        mismatch.album.artist.mbid = "33333333-3333-3333-3333-333333333333";
        expect(matchCatalogTracks(catalog().tracks, [mismatch], ARTIST, RELEASE, ARTIST_MBID)[1].isAvailable)
            .toBe(false);
    });

    it("does not use a compilation filename from an unrelated directory as artist proof", () => {
        const outsideImport = {
            ...compilationFile("Various Artists"),
            filePath: "Compilations/71 [2020]/Disc 2/01. Tones And I - Dance Monkey.flac",
        };
        expect(matchCatalogTracks(catalog().tracks, [outsideImport], ARTIST)[1].isAvailable).toBe(false);
    });
});
