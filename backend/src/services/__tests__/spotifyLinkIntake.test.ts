import { parseSpotifyDownloadLink } from "../spotifyLinkIntake";

const TRACK = "0123456789ABCDEFGHIJKL";
const ALBUM = "ABCDEFGHIJKLMNOPQRSTUV";
const PLAYLIST = "1234567890123456789012";

describe("Spotify link intake — pure, non-downloading preview", () => {
    it.each([
        ["https://open.spotify.com/track/" + TRACK, "track", TRACK],
        ["https://open.spotify.com/album/" + ALBUM, "album", ALBUM],
        ["https://open.spotify.com/playlist/" + PLAYLIST, "playlist", PLAYLIST],
        ["https://open.spotify.com/intl-nl/album/" + ALBUM + "/", "album", ALBUM],
        ["https://open.spotify.com/intl-en-us/track/" + TRACK, "track", TRACK],
        ["spotify:track:" + TRACK, "track", TRACK],
        ["spotify:album:" + ALBUM, "album", ALBUM],
        ["spotify:playlist:" + PLAYLIST, "playlist", PLAYLIST],
        ["  https://open.spotify.com/track/" + TRACK + "?si=share-token&utm_source=copy  ", "track", TRACK],
    ])("normalizes a supported Spotify link: %s", (input, kind, id) => {
        const result = parseSpotifyDownloadLink(input);
        expect(result).toEqual({
            provider: "spotify",
            kind,
            canonicalUrl: "https://open.spotify.com/" + kind + "/" + id,
            intentKey: "spotify:" + kind + ":" + id,
            duplicateCheck: "not_checked",
            downloadStarted: false,
            libraryVerification: "not_checked",
            submissionEnabled: false,
        });
        expect(JSON.stringify(result)).not.toContain("share-token");
        expect(JSON.stringify(result)).not.toContain("utm_source");
    });

    it.each([
        "",
        "   ",
        "http://open.spotify.com/track/" + TRACK,
        "https://open.spotify.com.evil.example/track/" + TRACK,
        "https://open.spotify.com./track/" + TRACK,
        "https://www.open.spotify.com/track/" + TRACK,
        "https://user:password@open.spotify.com/track/" + TRACK,
        "https://open.spotify.com:444/track/" + TRACK,
        "https://open.spotify.com/artist/" + TRACK,
        "https://open.spotify.com/episode/" + TRACK,
        "https://open.spotify.com/track/too-short",
        "https://open.spotify.com/track/" + TRACK + "/other",
        "https://open.spotify.com/track/%2F" + TRACK,
        "https://open.spotify.com/track/" + TRACK + "#fragment",
        "https://open.spotify.com/intl-nl/track/" + TRACK + "/unexpected",
        "https://open.spotify.com/intl-xx/album/" + ALBUM + "?x=1#fragment",
        "https://spotify.link/any-short-link",
        "https://example.com/track/" + TRACK,
        "spotify:artist:" + TRACK,
        "spotify:track:too-short",
        "spotify:track:" + TRACK + "?si=bad",
        "spotify:playlist:" + PLAYLIST + "\nextra",
        "https://open.spotify.com/track/" + TRACK + "?si=" + "X".repeat(2100),
        "https://open.spotify.com\\track\\" + TRACK,
        null,
        42,
        {},
        ["https://open.spotify.com/track/" + TRACK],
    ])("rejects malformed/ambiguous/untrusted input without side effects: %p", (input) => {
        expect(parseSpotifyDownloadLink(input)).toBeNull();
    });

    it("does not turn an artist, podcast or episode into a track", () => {
        for (const kind of ["artist", "show", "episode"]) {
            expect(parseSpotifyDownloadLink("spotify:" + kind + ":" + TRACK)).toBeNull();
        }
    });

    it("preserves the case-sensitive Spotify ID and strips all share-tracking parameters", () => {
        const result = parseSpotifyDownloadLink(
            "https://open.spotify.com/track/" + TRACK + "?si=abc&context=xyz&utm_campaign=private"
        );
        expect(result?.intentKey).toBe("spotify:track:" + TRACK);
        expect(result?.canonicalUrl).toBe("https://open.spotify.com/track/" + TRACK);
    });
});
