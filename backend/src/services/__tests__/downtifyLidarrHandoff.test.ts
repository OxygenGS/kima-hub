import {
    previewVerifiedLidarrImport, submitVerifiedLidarrImport,
    validateLidarrPreview, type VerifiedLidarrSource,
} from "../downtifyLidarrHandoff";

const expected: VerifiedLidarrSource = {
    path: "/downloads/KimaDowntify/Artist/Test Song.flac",
    bytes: 123456, artist: "Tina Turner", album: "Private Dancer",
    title: "What's Love Got to Do with It", durationMs: 242480,
};
const candidate = {
    path: expected.path, size: expected.bytes,
    artist: {id:8,artistName:"Tina Turner"},
    album: {id:10,artistId:8,title:"Private Dancer"},
    albumReleaseId: 12,
    tracks: [{id:33,artistId:8,albumId:10,title:expected.title,duration:242480}],
    quality: {quality:{id:7,name:"FLAC"}},
    rejections: [], additionalFile: false, replaceExistingFiles: false,
};

describe("Downtify native Lidarr-managed handoff", () => {
    it("requires a single exact artist, album, release, track, file size and duration", () => {
        expect(validateLidarrPreview([candidate],expected)).toEqual({
            state:"matched",match:{
                path:expected.path,artistId:8,albumId:10,albumReleaseId:12,
                trackId:33,quality:candidate.quality,
            },
        });
    });
    it("holds ambiguous or unsafe candidates rather than guessing a MusicBrainz match", () => {
        const bad = [
            [], [candidate,candidate], [{...candidate,path:"/tmp/attacker.flac"}],
            [{...candidate,size:123457}], [{...candidate,albumReleaseId:0}],
            [{...candidate,rejections:[{reason:"unrecognized"}]}],
            [{...candidate,artist:{...candidate.artist,artistName:"Other"}}],
            [{...candidate,album:{...candidate.album,title:"Other Album"}}],
            [{...candidate,tracks:[{...candidate.tracks[0],title:"Other"}]}],
            [{...candidate,tracks:[{...candidate.tracks[0],duration:230000}]}],
            [{...candidate,tracks:[...candidate.tracks,...candidate.tracks]}],
            [{...candidate,quality:null}],
            [{...candidate,additionalFile:true}],
            [{...candidate,replaceExistingFiles:true}],
        ];
        for(const result of bad) expect(validateLidarrPreview(result,expected).state)
            .toBe("needs_review");
    });
    it("rejects dangerous paths or missing album identity before making a remote request", async () => {
        for(const path of ["/music/../private/song.flac","/downloads/x/../../etc/secret.flac",
            "/downloads/private/key.txt","relative/artist/file.mp3"]) {
            expect(validateLidarrPreview([candidate],{...expected,path}).state)
                .toBe("invalid_source");
        }
        const get=jest.fn();
        expect(await previewVerifiedLidarrImport({get} as never,{
            ...expected,path:"/etc/passwd",
        })).toEqual({state:"invalid_source"});
        expect(get).not.toHaveBeenCalled();
        expect(validateLidarrPreview([candidate],{...expected,album:""}).state)
            .toBe("invalid_source");
    });
    it("uses only read-only manualimport preview, disables file replacements", async () => {
        const get=jest.fn().mockResolvedValue({data:[candidate]});
        expect((await previewVerifiedLidarrImport({get} as never,expected)).state)
            .toBe("matched");
        expect(get).toHaveBeenCalledTimes(1);
        expect(get).toHaveBeenCalledWith("/api/v1/manualimport",expect.objectContaining({
            params:{folder:expected.path,filterExistingFiles:false,replaceExistingFiles:false},
            maxRedirects:0,proxy:false,
        }));
    });
    it("issues precisely one Lidarr manual-import copy with no overwrite", async () => {
        const post=jest.fn().mockResolvedValue({data:{id:199}});
        const preview=validateLidarrPreview([candidate],expected);
        expect(preview.state).toBe("matched");
        if (preview.state !== "matched") throw Error("unexpected fixture");
        expect(await submitVerifiedLidarrImport({post} as never,preview.match))
            .toEqual({state:"accepted",commandId:199});
        expect(post).toHaveBeenCalledWith("/api/v1/command",{
            name:"ManualImport",importMode:"copy",replaceExistingFiles:false,
            files:[{
                path:expected.path,artistId:8,albumId:10,
                albumReleaseId:12,trackIds:[33],quality:candidate.quality,
                disableReleaseSwitching:true,
            }],
        },expect.objectContaining({maxRedirects:0,proxy:false}));
    });
    it("treats an API failure or missing command id as an unknown commit, not retryable", async () => {
        for(const response of [Promise.reject(Error("timeout")),Promise.resolve({data:{}})]) {
            const post=jest.fn().mockReturnValue(response);
            const preview=validateLidarrPreview([candidate],expected);
            if(preview.state !== "matched") throw Error("fixture");
            expect(await submitVerifiedLidarrImport({post} as never,preview.match))
                .toEqual({state:"unknown_outcome"});
            expect(post).toHaveBeenCalledTimes(1);
        }
    });
});
