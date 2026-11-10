import { selectVerifiedLidarrImport } from "../downtifyLidarrHandoff";
const source = {
    path: "/completed/downtify/example.flac",
    bytes: 1000,
    sha256: "a".repeat(64),
    artist: "Tina Turner",
    album: "Private Dancer",
    title: "What's Love Got to Do with It",
};
const candidate = {
    path: source.path,
    size: source.bytes,
    artist: {id: 11, artistName: source.artist},
    album: {id: 22, artistId: 11, title: source.album},
    albumReleaseId: 33,
    tracks: [{id: 44, artistId: 11, albumId: 22, title: source.title}],
    rejections: [],
    replaceExistingFiles: false,
    additionalFile: false,
};

describe("Strict read-only Lidarr manual-import candidate decision", () => {
    it("matches exactly one uniquely resolved artist/release/track", () => {
        expect(selectVerifiedLidarrImport(source,[candidate])).toEqual({
            state:"matched",match:{
                path:source.path,artistId:11,albumId:22,
                albumReleaseId:33,trackIds:[44],
            },
        });
    });
    it("never guesses a release from a Spotify title or artist", () => {
        expect(selectVerifiedLidarrImport({...source,album:""},[candidate]))
            .toEqual({state:"metadata_missing"});
    });
    it("rejects missing, duplicate, or ambiguous source candidates", () => {
        expect(selectVerifiedLidarrImport(source,[])).toEqual({state:"not_found"});
        expect(selectVerifiedLidarrImport(source,[candidate,candidate]))
            .toEqual({state:"ambiguous"});
        expect(selectVerifiedLidarrImport(source,[{...candidate,path:"/other/song.flac"}]))
            .toEqual({state:"not_found"});
    });
    it("never authorizes a candidate that Lidarr rejected or may replace files", () => {
        for(const changed of [
            {rejections:[{reason:"wrong release"}]},
            {replaceExistingFiles:true},
            {replaceExistingFiles:undefined},
            {additionalFile:true},
            {rejections:undefined},
        ]) {
            expect(selectVerifiedLidarrImport(source,[{...candidate,...changed}]))
                .toEqual({state:"rejected"});
        }
    });
    it("rejects ambiguous albums, track lists and invalid identifiers", () => {
        for(const changed of [
            {albumReleaseId:null},
            {albumReleaseId:0},
            {tracks:[]},
            {tracks:[candidate.tracks[0],candidate.tracks[0]]},
            {artist:{id:0,artistName:source.artist}},
            {album:{id:22,artistId:12,title:source.album}},
            {size:source.bytes-1},
        ]) {
            expect(selectVerifiedLidarrImport(source,[{...candidate,...changed}]))
                .toEqual({state:"metadata_mismatch"});
        }
    });
    it("rejects wrong recording identity despite matching names or size", () => {
        for(const changed of [
            {artist:{id:11,artistName:"Other"}},
            {album:{id:22,title:"Other"}},
            {tracks:[{id:44,title:"Different"}]},
        ]) {
            expect(selectVerifiedLidarrImport(source,[{...candidate,...changed}]))
                .toEqual({state:"metadata_mismatch"});
        }
    });
    it("checks supplied MusicBrainz IDs without treating Spotify IDs as release IDs", () => {
        const mb="12345678-1234-1234-1234-123456789abc";
        const enriched={
            ...candidate,
            artist:{...candidate.artist,foreignArtistId:mb},
            album:{...candidate.album,foreignAlbumId:mb},
        };
        expect(selectVerifiedLidarrImport({
            ...source,musicbrainzArtistId:mb,musicbrainzReleaseId:mb,
        },[enriched]).state).toBe("matched");
        expect(selectVerifiedLidarrImport({
            ...source,musicbrainzReleaseId:"not-a-mbid",
        },[enriched]).state).toBe("metadata_missing");
        expect(selectVerifiedLidarrImport({
            ...source,musicbrainzArtistId:mb,
        },[candidate]).state).toBe("metadata_mismatch");
    });
    it("refuses unsafe path and hash evidence", () => {
        for (const altered of [
            {path:"/completed/../etc/passwd"},
            {path:"../../etc/passwd"},
            {path:"/"},
            {path:"/completed\\secret"},
            {sha256:"abc"},
            {bytes:0},
        ]) {
            expect(selectVerifiedLidarrImport({...source,...altered},[candidate]))
                .toEqual({state:"unsafe_source"});
        }
        expect(selectVerifiedLidarrImport(source,"not an array"))
            .toEqual({state:"unsafe_source"});
    });
});
