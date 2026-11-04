import { checkSpotifyLibraryEvidence, verifyIndexedMusicFile } from "../spotifyLibraryEvidence";

jest.mock("../../config", () => ({ config: { music: { musicPath: "/music" } } }));
jest.mock("../../utils/db", () => ({ prisma: { track: { findMany: jest.fn() } } }));
jest.mock("../spotify", () => ({ spotifyService: { getTrackBySpotifyId: jest.fn() } }));

const ID = "0123456789ABCDEFGHIJKL";
const trackLink = "https://open.spotify.com/track/" + ID;
const source: { spotifyId: string; isrc: string | null; durationMs: number } = {
    spotifyId: ID, isrc: "USRC17607839", durationMs: 183000,
};
const candidate = {
    id: "library-track-A",
    filePath: "Artist/Album/01 Track.flac",
    duration: 183,
    fileSize: 3072048,
};
const check = (options: {
    metadata?: typeof source | null;
    candidates?: typeof candidate[];
    verify?: (p: string) => Promise<boolean>;
} = {}) => {
    const retrieve = jest.fn().mockResolvedValue(options.metadata === undefined ? source : options.metadata);
    const find = jest.fn().mockResolvedValue(options.candidates === undefined ? [candidate] : options.candidates);
    const verify = jest.fn(options.verify || (async () => true));
    return { retrieve, find, verify };
};

describe("Spotify library evidence is read-only and proof based", () => {
    it("confirms an ISRC, compatible duration and physical file, not album edition or decode", async () => {
        const deps = check();
        const value = await checkSpotifyLibraryEvidence(trackLink + "?si=private", deps);
        expect(deps.retrieve).toHaveBeenCalledWith(ID);
        expect(deps.find).toHaveBeenCalledWith("USRC17607839");
        expect(deps.verify).toHaveBeenCalledWith(candidate.filePath);
        expect(value).toEqual({
            provider: "spotify", kind: "track",
            status: "recording_match_on_disk",
            evidence: "isrc_duration_and_file",
            recordingMatch: true, audioDecoded: false,
            albumEditionVerified: false,
            matchedTrackId: "library-track-A",
            downloadStarted: false,
        });
        expect(JSON.stringify(value)).not.toContain("Artist/Album");
        expect(JSON.stringify(value)).not.toContain("private");
    });

    it("does not equate a catalog entry with a physical file", async () => {
        const deps = check({ verify: async () => false });
        const value = await checkSpotifyLibraryEvidence(trackLink, deps);
        expect(value).toMatchObject({
            status: "catalog_recording_unverified", evidence: "not_proven",
            recordingMatch: false, matchedTrackId: null, audioDecoded: false,
        });
    });

    it("never treats missing provider metadata or ISRC as absence of audio", async () => {
        const none = check({ metadata: null });
        expect((await checkSpotifyLibraryEvidence(trackLink, none))?.status).toBe("metadata_unavailable");
        expect(none.find).not.toHaveBeenCalled();

        const missingIsrc = check({ metadata: { ...source, isrc: null } });
        expect((await checkSpotifyLibraryEvidence(trackLink, missingIsrc))?.status).toBe("identity_unavailable");
        expect(missingIsrc.find).not.toHaveBeenCalled();

        const spoofedId = check({ metadata: { ...source, spotifyId: "9999999999999999999999" } });
        expect((await checkSpotifyLibraryEvidence(trackLink, spoofedId))?.status).toBe("identity_unavailable");
        expect(spoofedId.find).not.toHaveBeenCalled();
    });

    it("does not assume absence when no ISRC match is indexed", async () => {
        const deps = check({ candidates: [] });
        expect(await checkSpotifyLibraryEvidence(trackLink, deps)).toMatchObject({
            status: "no_verified_match", evidence: "not_proven", matchedTrackId: null,
        });
    });

    it("rejects a same-ISRC different-length recording as a verified match", async () => {
        const deps = check({ candidates: [{ ...candidate, duration: 196 }] });
        const result = await checkSpotifyLibraryEvidence(trackLink, deps);
        expect(result?.status).toBe("catalog_recording_unverified");
        expect(deps.verify).not.toHaveBeenCalled();
    });

    it("requires a non-empty indexed file candidate", async () => {
        const deps = check({ candidates: [{ ...candidate, fileSize: 0 }] });
        expect((await checkSpotifyLibraryEvidence(trackLink, deps))?.recordingMatch).toBe(false);
        expect(deps.verify).not.toHaveBeenCalled();
    });

    it("handles recording metadata with lower-case ISRC", async () => {
        const deps = check({ metadata: { ...source, isrc: "usrc17607839" } });
        const value = await checkSpotifyLibraryEvidence("spotify:track:" + ID, deps);
        expect(value?.recordingMatch).toBe(true);
        expect(deps.find).toHaveBeenCalledWith("USRC17607839");
    });

    it("never checks entire albums/playlists as a complete recording match", async () => {
        const deps = check();
        const a = await checkSpotifyLibraryEvidence("spotify:album:" + ID, deps);
        const p = await checkSpotifyLibraryEvidence("spotify:playlist:" + ID, deps);
        expect(a).toMatchObject({ kind: "album", status: "not_supported", recordingMatch: false });
        expect(p).toMatchObject({ kind: "playlist", status: "not_supported", recordingMatch: false });
        expect(deps.retrieve).not.toHaveBeenCalled();
        expect(deps.find).not.toHaveBeenCalled();
    });

    it("rejects URLs not passing the canonical Spotify parser", async () => {
        const deps = check();
        expect(await checkSpotifyLibraryEvidence("https://open.spotify.com.evil.com/track/" + ID, deps)).toBeNull();
        expect(deps.retrieve).not.toHaveBeenCalled();
    });
});

describe("safe physical file evidence", () => {
    const root = "/mnt/media";
    const file = "Artist/Album/01 Track.flac";
    const access = (
        rootReal: string,
        fileReal: string,
        fileSize = 14000,
        regular = true
    ) => ({
        realpath: jest.fn(async (p: string) => p === root ? rootReal : fileReal),
        stat: jest.fn(async (_p: string) => ({ size: fileSize, isFile: () => regular })),
    });

    it("confirms a regular non-empty file under the canonical mount", async () => {
        const io = access("/storage/music", "/storage/music/Artist/Album/01 Track.flac");
        expect(await verifyIndexedMusicFile(file, root, io)).toBe(true);
        expect(io.stat).toHaveBeenCalledWith("/storage/music/Artist/Album/01 Track.flac");
    });

    it.each([
        "/etc/passwd", "../escape.mp3", "./track.flac", "Artist/../escape.flac",
        "Artist\\track.flac", "Artist//broken.flac", "Artist/./track.flac",
        "Artist/\u0000track.mp3", "",
    ])("rejects unsafe scanner path %p before touching the filesystem", async (value) => {
        const io = access(root, "/mnt/media/Artist/track.flac");
        expect(await verifyIndexedMusicFile(value, root, io)).toBe(false);
        expect(io.realpath).not.toHaveBeenCalled();
    });

    it("rejects a symlink escaping the trusted music volume", async () => {
        const io = access(root, "/etc/hidden/music.flac");
        expect(await verifyIndexedMusicFile(file, root, io)).toBe(false);
        expect(io.stat).not.toHaveBeenCalled();
    });

    it("rejects a similar path prefix outside the root", async () => {
        const io = access(root, "/mnt/media-private/file.flac");
        expect(await verifyIndexedMusicFile(file, root, io)).toBe(false);
        expect(io.stat).not.toHaveBeenCalled();
    });

    it("rejects non-regular, zero-byte and inaccessible files", async () => {
        expect(await verifyIndexedMusicFile(file, root, access(root, root + "/song.flac", 0))).toBe(false);
        expect(await verifyIndexedMusicFile(file, root, access(root, root + "/folder", 100, false))).toBe(false);
        const io = access(root, root + "/song.flac");
        io.realpath.mockRejectedValue(new Error("missing NAS mount /secret"));
        expect(await verifyIndexedMusicFile(file, root, io)).toBe(false);
    });
});
