import { promises as fs } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import {
    initializeNativeMusicVolume,
} from "../downtifyNativeMountProof";
import { verifySharedLidarrStaging } from "../downtifyLidarrStageVisibility";
import type { LidarrMountMapping } from "../downtifyLidarrMounts";

describe("Lidarr's actual visibility of Kima's pinned shared staging mount",()=>{
    let root="";
    let mapping:LidarrMountMapping;
    let proof:string|null=null;
    let stageDir="";
    beforeEach(async()=>{
        root=await fs.mkdtemp(path.join(tmpdir(),"kima-lidarr-visibility-"));
        const downloadRoot=path.join(root,"downloads");
        const musicRoot=path.join(root,"music");
        await fs.mkdir(downloadRoot,{mode:0o755});
        await fs.mkdir(musicRoot,{mode:0o755});
        stageDir=path.join(downloadRoot,"Singles","Downtify");
        proof=await initializeNativeMusicVolume(downloadRoot);
        expect(proof).not.toBeNull();
        mapping={
            kimaDownloads:downloadRoot,lidarrDownloads:"/lidarr-downloads",
            kimaMusic:musicRoot,lidarrMusic:"/lidarr-music",
        };
    });
    afterEach(async()=>{await fs.rm(root,{recursive:true,force:true});});
    it("proves both sides resolve the same unpredictable staging file and cleans up",async()=>{
        const get=jest.fn(async (endpoint:string,opts:{params:{path:string}})=>{
            expect(endpoint).toBe("/api/v1/filesystem/type");
            const remote=opts.params.path;
            expect(remote).toMatch(/^\/lidarr-downloads\/Singles\/Downtify\/\.kima-lidarr-visibility-[a-f0-9]{32}\.probe$/);
            const local=path.join(mapping.kimaDownloads,
                remote.slice("/lidarr-downloads/".length));
            const stat=await fs.stat(local);
            expect(stat.isFile()).toBe(true);
            return {data:{type:"file"}};
        });
        expect(await verifySharedLidarrStaging({get} as never,mapping,proof)).toBe(true);
        expect(get).toHaveBeenCalledTimes(1);
        expect((await fs.readdir(stageDir)).filter(x=>x.includes("visibility")))
            .toEqual([]);
    });
    it("refuses wrong Lidarr-side mapping even with a real local stage marker",async()=>{
        const get=jest.fn().mockResolvedValue({data:{type:"folder"}});
        expect(await verifySharedLidarrStaging({get} as never,mapping,proof))
            .toBe(false);
        expect((await fs.readdir(stageDir)).filter(x=>x.includes("visibility")))
            .toEqual([]);
    });
    it("refuses remote errors without leaving a probe behind",async()=>{
        const get=jest.fn().mockRejectedValue(Error("not mounted"));
        expect(await verifySharedLidarrStaging({get} as never,mapping,proof))
            .toBe(false);
        expect((await fs.readdir(stageDir)).filter(x=>x.includes("visibility")))
            .toEqual([]);
    });
    it("never opens a probe if music and downloads are the same local mount",async()=>{
        const get=jest.fn();
        const alias=path.join(root,"music-alias");
        await fs.symlink(mapping.kimaDownloads,alias,"dir");
        expect(await verifySharedLidarrStaging({get} as never,{
            ...mapping,kimaMusic:alias,
        },proof)).toBe(false);
        expect(get).not.toHaveBeenCalled();
        expect((await fs.readdir(stageDir)).filter(x=>x.includes("visibility")))
            .toEqual([]);
    });
    it("never creates a probe if the stage proof or path is invalid",async()=>{
        const get=jest.fn();
        expect(await verifySharedLidarrStaging({get} as never,mapping,"bad")).toBe(false);
        expect(await verifySharedLidarrStaging({get} as never,{
            ...mapping,lidarrDownloads:"/lidarr-music/inside",
        },proof)).toBe(false);
        expect(get).not.toHaveBeenCalled();
    });
});
