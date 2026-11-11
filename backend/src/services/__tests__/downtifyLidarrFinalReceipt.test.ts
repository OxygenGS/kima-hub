import { createHash } from "crypto";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import { inspectLidarrFinalReceipt } from "../downtifyLidarrFinalReceipt";
const hash=createHash("sha256").update(Buffer.alloc(1024,42)).digest("hex");
let root="",file="";
const mapping=()=>({kimaDownloads:"/downloads",lidarrDownloads:"/downloads",
    kimaMusic:root,lidarrMusic:"/music"});
const expected={commandId:10,artistId:5,albumId:7,
    trackId:12,bytes:1024,sha256:hash,durationMs:242480};
const response=(data:unknown)=>({data});
const valid=(path:string,result:"successful"|"unknown"="successful")=>jest.fn(async (url:string)=>{
    if(url==="/api/v1/command/10")return response({
        name:"ManualImport",id:10,status:"completed",result,
    });
    if(url==="/api/v1/track")return response([{
        id:12,artistId:5,albumId:7,trackFileId:30,duration:242480,hasFile:true,
    }]);
    if(url==="/api/v1/trackfile")return response([{
        id:30,artistId:5,albumId:7,size:1024,path,
    }]);
    throw Error("unexpected endpoint");
});
beforeEach(async()=>{
    root=await fs.mkdtemp(path.join(tmpdir(),"lidarr-final-"));
    const dir=path.join(root,"Tina Turner","Private Dancer");
    await fs.mkdir(dir,{recursive:true});
    file=path.join(dir,"02 - Song.flac");
    await fs.writeFile(file,Buffer.alloc(1024,42));
});
afterEach(async()=>await fs.rm(root,{recursive:true,force:true}));
describe("Lidarr's actual TrackFile and immutable Kima index evidence",()=>{
 it("only accepts final path with exact registered track id and physical SHA-256",async()=>{
    const get=valid("/music/Tina Turner/Private Dancer/02 - Song.flac");
    expect(await inspectLidarrFinalReceipt({get} as never,mapping(),expected))
        .toEqual({state:"verified",lidarrTrackFileId:30,
            relativePath:"Tina Turner/Private Dancer/02 - Song.flac"});
    expect(get).toHaveBeenCalledWith("/api/v1/track",
        expect.objectContaining({params:{albumId:7},proxy:false,maxRedirects:0}));
 });
 it("verifies Lidarr's flat Artist/Track layout and exact physical SHA-256",async()=>{
    const flat=path.join(root,"Tina Turner","02 - Song.flac");
    await fs.writeFile(flat,Buffer.alloc(1024,42));
    const get=valid("/music/Tina Turner/02 - Song.flac");
    expect(await inspectLidarrFinalReceipt({get} as never,mapping(),expected))
        .toEqual({state:"verified",lidarrTrackFileId:30,
            relativePath:"Tina Turner/02 - Song.flac"});
 });
 it("reconciles a completed Lidarr command whose result became unknown only with exact final evidence",async()=>{
    const get=valid("/music/Tina Turner/Private Dancer/02 - Song.flac","unknown");
    expect(await inspectLidarrFinalReceipt({get} as never,mapping(),expected))
        .toEqual({state:"verified",lidarrTrackFileId:30,
            relativePath:"Tina Turner/Private Dancer/02 - Song.flac"});
    expect(get).toHaveBeenCalledWith("/api/v1/trackfile",
        expect.objectContaining({params:{albumId:7}}));
 });
 it("does not trust unknown command results without the physical hash and pinned track identity",async()=>{
    await fs.writeFile(file,Buffer.alloc(1024,43));
    const get=valid("/music/Tina Turner/Private Dancer/02 - Song.flac","unknown");
    expect((await inspectLidarrFinalReceipt({get} as never,mapping(),expected)).state)
        .toBe("waiting");
    const wrong=valid("/music/Tina Turner/Private Dancer/02 - Song.flac","unknown");
    expect((await inspectLidarrFinalReceipt({get:wrong} as never,mapping(),
        {...expected,trackId:99})).state).toBe("waiting");
 });
 it("does not accept a completed unsuccessful Lidarr command even if the file exists",async()=>{
    const get=jest.fn().mockResolvedValue(response({
        name:"ManualImport",id:10,status:"completed",result:"unsuccessful",
    }));
    expect((await inspectLidarrFinalReceipt({get} as never,mapping(),expected)).state)
        .toBe("needs_review");
    expect(get).toHaveBeenCalledTimes(1);
 });
 it("never trusts the import command alone without the final local hash",async()=>{
    await fs.writeFile(file,Buffer.alloc(1024,43));
    const get=valid("/music/Tina Turner/Private Dancer/02 - Song.flac");
    expect((await inspectLidarrFinalReceipt({get} as never,mapping(),expected)).state)
        .toBe("waiting");
 });
 it("rejects a path outside the owner-pinned Lidarr music root",async()=>{
    const get=valid("/elsewhere/Tina Turner/Private Dancer/02 - Song.flac");
    expect((await inspectLidarrFinalReceipt({get} as never,mapping(),expected)).state)
        .toBe("needs_review");
 });
 it("does not declare a pending, failed or ambiguous command imported",async()=>{
    for(const status of ["queued","started","failed","orphaned"]){
        const get=jest.fn().mockResolvedValue(response({
            name:"ManualImport",id:10,status,result:"unknown",
        }));
        const state=(await inspectLidarrFinalReceipt(
            {get} as never,mapping(),expected)).state;
        expect(state).toBe(status==="failed"||status==="orphaned"
            ?"needs_review":"waiting");
        expect(get).toHaveBeenCalledTimes(1);
    }
 });
 it("refuses a track registered to the wrong album and file",async()=>{
    const get=valid("/music/Tina Turner/Private Dancer/02 - Song.flac");
    get.mockImplementation(async (url:string)=>{
        if(url==="/api/v1/command/10")return response({
            name:"ManualImport",id:10,status:"completed",result:"successful",
        });
        if(url==="/api/v1/track")return response([{
            id:12,artistId:5,albumId:99,trackFileId:30,duration:242480,hasFile:true,
        }]);
        if(url==="/api/v1/trackfile")return response([]);
        throw Error("unexpected");
    });
    expect((await inspectLidarrFinalReceipt({get} as never,mapping(),expected)).state)
        .toBe("waiting");
 });
});
