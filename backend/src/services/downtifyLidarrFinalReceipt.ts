/**
 * Reconcile an acknowledged Lidarr ManualImport command, never re-submit it.
 * Confirm the exact MusicBrainz-matched Lidarr track owns the final TrackFile
 * and independently hash its bytes on Kima's mapped music filesystem.
 */
import type { AxiosInstance } from "axios";
import {
    type LidarrMountMapping, lidarrFileToKimaMusic, verifyPinnedLidarrBytes,
} from "./downtifyLidarrMounts";
import * as path from "path";

const object=(x:unknown): x is Record<string,unknown> =>
    !!x && typeof x==="object" && !Array.isArray(x);
const id=(x:unknown): x is number => Number.isSafeInteger(x)&&Number(x)>0;
export type LidarrReceiptExpectation={
    commandId:number;artistId:number;albumId:number;trackId:number;
    bytes:number;sha256:string;durationMs:number;
};
export type LidarrReceipt=
    | {state:"verified";lidarrTrackFileId:number;relativePath:string}
    | {state:"waiting"|"needs_review"|"unavailable"};

export async function inspectLidarrFinalReceipt(
    client:Pick<AxiosInstance,"get">,
    roots:LidarrMountMapping,
    expected:LidarrReceiptExpectation,
):Promise<LidarrReceipt>{
    if(![expected.commandId,expected.artistId,expected.albumId,expected.trackId]
        .every(id) || !Number.isSafeInteger(expected.bytes) ||
        expected.bytes<64 || expected.bytes>256*1024*1024 ||
        !/^[a-f0-9]{64}$/.test(expected.sha256) ||
        !Number.isSafeInteger(expected.durationMs) ||
        expected.durationMs<1000)return {state:"needs_review"};
    const opts={timeout:15000,maxRedirects:0,proxy:false as const,
        maxContentLength:1024*1024};
    try{
        const command=(await client.get(
            "/api/v1/command/"+expected.commandId,opts)).data;
        if(!object(command) || command.id!==expected.commandId ||
            command.name!=="ManualImport")return {state:"needs_review"};
        if(command.status==="failed"||command.status==="cancelled"||
            command.status==="aborted"||command.status==="orphaned"||
            command.result==="unsuccessful")return {state:"needs_review"};
        if(command.status!=="completed")return {state:"waiting"};
        // Lidarr can report result="unknown" for an already completed
        // ManualImport command (observed after a prior "successful" result).
        // Never treat that value alone as success: verify the pinned track
        // identity, TrackFile and physical SHA-256 below before recording it.
        if(command.result!=="successful" &&
            command.result!=="unknown")return {state:"needs_review"};
        const [t,f]=await Promise.all([
            client.get("/api/v1/track",{...opts,params:{albumId:expected.albumId}}),
            client.get("/api/v1/trackfile",{...opts,params:{albumId:expected.albumId}}),
        ]);
        if(!Array.isArray(t.data)||t.data.length>2000||
            !Array.isArray(f.data)||f.data.length>2000)return {state:"unavailable"};
        const tracks=t.data.filter((x:unknown)=>object(x) &&
            x.id===expected.trackId &&
            x.albumId===expected.albumId &&
            x.artistId===expected.artistId &&
            x.hasFile===true && id(x.trackFileId) &&
            typeof x.duration==="number" &&
            Math.abs(x.duration-expected.durationMs)<=4000);
        if(tracks.length!==1)return {state:"waiting"};
        const fileId=tracks[0].trackFileId;
        const files=f.data.filter((x:unknown)=>object(x) &&
            x.id===fileId && x.albumId===expected.albumId &&
            x.artistId===expected.artistId &&
            x.size===expected.bytes);
        if(files.length!==1 || !object(files[0]))return {state:"waiting"};
        const relative=lidarrFileToKimaMusic(roots,files[0].path);
        if(!relative)return {state:"needs_review"};
        const verified=await verifyPinnedLidarrBytes(
            path.posix.join(roots.kimaMusic,relative),
            roots.kimaMusic,expected.bytes,expected.sha256,
        );
        return verified
            ? {state:"verified",lidarrTrackFileId:fileId,relativePath:relative}
            : {state:"waiting"};
    }catch{return {state:"unavailable"};}
}
