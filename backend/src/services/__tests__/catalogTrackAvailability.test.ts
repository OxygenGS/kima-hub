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
        expect(prisma.track.findMany).not.toHaveBeenCalled();
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
