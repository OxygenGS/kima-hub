import { inspectDowntifyLidarrStagedTrack } from "../downtifyLidarrReadOnly";
const valid = {
    path:"/completed/downtify/song.flac",bytes:4096,
    sha256:"a".repeat(64),artist:"Tina Turner",
    album:"Private Dancer",title:"What's Love Got to Do with It",
};
const matched = {
    path:valid.path,size:valid.bytes,
    artist:{id:1,artistName:valid.artist},
    album:{id:2,artistId:1,title:valid.album},
    albumReleaseId:3,
    tracks:[{id:4,artistId:1,albumId:2,title:valid.title}],
    rejections:[],replaceExistingFiles:false,additionalFile:false,
};
describe("Lidarr read-only handoff inspection", () => {
    it("queries only the official manual-import candidate endpoint without triggering a command", async () => {
        const get=jest.fn().mockResolvedValue({status:200,data:[matched]});
        expect(await inspectDowntifyLidarrStagedTrack({get} as never,valid))
            .toEqual({state:"matched",match:{
                path:valid.path,artistId:1,albumId:2,albumReleaseId:3,
                trackIds:[4],
            }});
        expect(get).toHaveBeenCalledTimes(1);
        expect(get.mock.calls[0][0]).toBe("/api/v1/manualimport");
        expect(get.mock.calls[0][1]).toMatchObject({
            params:{
                folder:valid.path,
                filterExistingFiles:true,
                replaceExistingFiles:false,
            },
            timeout:15000,maxRedirects:0,maxContentLength:2*1024*1024,
        });
    });
    it("does not contact Lidarr for invalid staging evidence or incomplete album tags", async () => {
        const get=jest.fn();
        for(const source of [
            {...valid,path:"../secret"},
            {...valid,album:""},
            {...valid,sha256:"invalid"},
        ]) {
            expect((await inspectDowntifyLidarrStagedTrack({get} as never,source)).state)
                .not.toBe("matched");
        }
        expect(get).not.toHaveBeenCalled();
    });
    it("fails closed on an incompatible or oversized response", async () => {
        const get=jest.fn()
            .mockResolvedValueOnce({status:202,data:[matched]})
            .mockResolvedValueOnce({status:200,data:{track:matched}})
            .mockResolvedValueOnce({status:200,data:Array(1001).fill(matched)});
        for(let i=0;i<3;i++)
            expect(await inspectDowntifyLidarrStagedTrack({get} as never,valid))
                .toEqual({state:"lidarr_incompatible"});
    });
    it("returns sanitized unreachable result, not a remote token, path or exception", async () => {
        const get=jest.fn().mockRejectedValue(new Error("X-Api-Key SECRET /private/data"));
        expect(await inspectDowntifyLidarrStagedTrack({get} as never,valid))
            .toEqual({state:"lidarr_unavailable"});
    });
    it("never guesses a rejected Lidarr pressing despite valid staging bytes", async () => {
        const get=jest.fn().mockResolvedValue({
            status:200,data:[{...matched,rejections:[{reason:"unknown release"}]}],
        });
        expect(await inspectDowntifyLidarrStagedTrack({get} as never,valid))
            .toEqual({state:"rejected"});
    });
});
