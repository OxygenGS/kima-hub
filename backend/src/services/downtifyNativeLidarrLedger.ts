/**
 * Durable, non-replayable Lidarr handoff state machine.
 * Independently indexed RC6/Kima imports are NEVER touched or migrated.
 *
 * All writes are owner/server/account/claim-token CAS updates. A remote POST
 * with an uncertain acknowledgment stays quarantined: never replay it.
 */
import { prisma } from "../utils/db";
import type { PinnedImportOwner } from "./downtifyNativeImportLedger";
import type { LidarrMatch } from "./downtifyLidarrHandoff";

const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9-]{36}$/;
const STAGE = /^Singles\/Downtify\/[^/]{1,180}\/[^/]{1,180}\.(flac|mp3|m4a|ogg|opus|wav)$/i;
const VALID_ID = /^[a-z0-9]{10,40}$/;
const valid = (o: PinnedImportOwner,id:string,token:string) =>
    !!o.kimaUserId && !!o.remoteServerId &&
    Number.isSafeInteger(o.remoteUserId) && o.remoteUserId>0 &&
    VALID_ID.test(id) && UUID.test(token);
const scoped=(o:PinnedImportOwner,id:string,token:string) => ({
    id, ownerKimaUserId:o.kimaUserId,
    remoteServerId:o.remoteServerId,remoteUserId:o.remoteUserId,
    claimToken:token,importTarget:"lidarr",
});
const cleanName=(x:unknown): x is string =>
    typeof x==="string" && !!x.trim() && x.length<=300 &&
    !/[\u0000-\u001f\u007f]/.test(x);

/** Record immutable verified *staging* evidence, NOT a Kima library receipt. */
export async function recordLidarrStaged(
    owner:PinnedImportOwner,id:string,token:string,
    evidence:{
        relative:string;bytes:number;sha256:string;
        artist:string;album:string;title:string;durationMs:number;
        remoteTrackId:string;
    },
): Promise<boolean> {
    if(!valid(owner,id,token) || !STAGE.test(evidence.relative) ||
        !SHA.test(evidence.sha256) ||
        !Number.isSafeInteger(evidence.bytes) ||
        evidence.bytes<64 || evidence.bytes>256*1024*1024 ||
        !cleanName(evidence.artist) || !cleanName(evidence.album) ||
        !cleanName(evidence.title) ||
        !Number.isSafeInteger(evidence.durationMs) ||
        evidence.durationMs<1000 || evidence.durationMs>8*60*60*1000 ||
        !/^t[a-f0-9]{16}$/.test(evidence.remoteTrackId)) return false;
    try {
        const changed=await prisma.downtifyNativeImport.updateMany({
            where:{
                ...scoped(owner,id,token),status:"claimed",
                outputRelativePath:null,fullSha256:null,
                stagedRelativePath:null,stagedSha256:null,
            },
            data:{
                status:"staged_pending_lidarr",
                remoteLibraryTrackId:evidence.remoteTrackId,
                stagedRelativePath:evidence.relative,
                stagedBytes:evidence.bytes,
                stagedSha256:evidence.sha256,
                stagedArtist:evidence.artist,
                stagedAlbum:evidence.album,
                stagedTitle:evidence.title,
                stagedDurationMs:evidence.durationMs,
                reviewReason:null,
            },
        });
        return changed.count===1;
    } catch{return false;}
}

/** Durable single-use intent MUST be written BEFORE HTTP POST. */
export async function beginLidarrSubmission(
    owner:PinnedImportOwner,id:string,token:string,
    match:LidarrMatch, stageRelative:string,stageSha:string,
):Promise<boolean>{
    if(!valid(owner,id,token) || !STAGE.test(stageRelative) ||
        !SHA.test(stageSha) ||
        ![match.artistId,match.albumId,match.albumReleaseId,match.trackId]
            .every(v=>Number.isSafeInteger(v)&&v>0)) return false;
    try {
        const updated=await prisma.downtifyNativeImport.updateMany({
            where:{
                ...scoped(owner,id,token),status:"staged_pending_lidarr",
                stagedRelativePath:stageRelative,stagedSha256:stageSha,
                lidarrCommandId:null,lidarrSubmittedAt:null,
            },
            data:{
                status:"lidarr_submitting",
                lidarrArtistId:match.artistId,
                lidarrAlbumId:match.albumId,
                lidarrReleaseId:match.albumReleaseId,
                lidarrTrackId:match.trackId,
                lidarrSubmittedAt:new Date(),
                reviewReason:null,
            },
        });
        return updated.count===1;
    } catch{return false;}
}

/** Save successful remote command acknowledgment, never use it as a file receipt. */
export async function acknowledgeLidarrCommand(
    owner:PinnedImportOwner,id:string,token:string,commandId:number,
):Promise<boolean>{
    if(!valid(owner,id,token) || !Number.isSafeInteger(commandId) ||
        commandId<1) return false;
    try {
        const changed=await prisma.downtifyNativeImport.updateMany({
            where:{...scoped(owner,id,token),status:"lidarr_submitting",
                lidarrCommandId:null},
            data:{status:"lidarr_waiting",lidarrCommandId:commandId},
        });
        return changed.count===1;
    } catch{return false;}
}

export async function holdUncertainLidarrSubmission(
    owner:PinnedImportOwner,id:string,token:string,
):Promise<boolean>{
    if(!valid(owner,id,token))return false;
    try {
        const changed=await prisma.downtifyNativeImport.updateMany({
            where:{...scoped(owner,id,token),status:"lidarr_submitting"},
            data:{status:"uncertain",reviewReason:"lidarr_submission_uncertain"},
        });
        return changed.count===1;
    }catch{return false;}
}

/** A missing artist/album/track never forces another download or remote POST. */
export async function noteLidarrMatchNeeded(
    owner:PinnedImportOwner,id:string,token:string,
):Promise<boolean>{
    if(!valid(owner,id,token))return false;
    try{
        const changed=await prisma.downtifyNativeImport.updateMany({
            where:{...scoped(owner,id,token),status:"staged_pending_lidarr"},
            data:{reviewReason:"lidarr_match_required"},
        });
        return changed.count===1;
    }catch{return false;}
}

/** Lidarr has registered and Kima independently hashed its final file. */
export async function recordLidarrFinalFile(
    owner:PinnedImportOwner,id:string,token:string,
    finalRelative:string,fileId:number,hash:string,bytes:number,
):Promise<boolean>{
    const parts=finalRelative.split("/");
    if(!valid(owner,id,token) || !SHA.test(hash) ||
        !Number.isSafeInteger(fileId) || fileId<1 ||
        !Number.isSafeInteger(bytes) || bytes<64 ||
        bytes>256*1024*1024 || parts.length<2 || parts.length>8 ||
        parts[0]==="Singles" ||
        parts.some(p=>!p || p.length>180 || p==="." || p===".." ||
            p.startsWith(".") || /[<>:"\\|?*\u0000-\u001f\u007f]/.test(p)) ||
        !/\.(flac|mp3|m4a|ogg|opus|wav)$/i.test(parts.at(-1)||""))return false;
    try{
        const changed=await prisma.downtifyNativeImport.updateMany({
            where:{
                ...scoped(owner,id,token),status:"lidarr_waiting",
                stagedSha256:hash,stagedBytes:bytes,
                outputRelativePath:null,fullSha256:null,lidarrTrackFileId:null,
            },
            data:{
                outputRelativePath:finalRelative,
                fullSha256:hash,expectedBytes:bytes,
                lidarrTrackFileId:fileId,
                status:"published_pending_scan",
                reviewReason:null,
            },
        });
        return changed.count===1;
    }catch{return false;}
}

/**
 * Explicit admin-approved artist creation is ALSO a single-use remote POST.
 * Its durable intent prevents repeated artist creation after a timeout.
 */
export async function beginLidarrArtistCreation(
    owner:PinnedImportOwner,id:string,token:string,
):Promise<boolean>{
    if(!valid(owner,id,token))return false;
    try{
        const changed=await prisma.downtifyNativeImport.updateMany({
            where:{...scoped(owner,id,token),status:"staged_pending_lidarr",
                lidarrArtistId:null},
            data:{status:"lidarr_artist_creating",reviewReason:null},
        });
        return changed.count===1;
    }catch{return false;}
}
export async function acknowledgeLidarrArtistCreation(
    owner:PinnedImportOwner,id:string,token:string,artistId:number,
):Promise<boolean>{
    if(!valid(owner,id,token) || !Number.isSafeInteger(artistId) ||
        artistId<1)return false;
    try{
        const changed=await prisma.downtifyNativeImport.updateMany({
            where:{...scoped(owner,id,token),status:"lidarr_artist_creating",
                lidarrArtistId:null},
            data:{status:"staged_pending_lidarr",lidarrArtistId:artistId,
                reviewReason:null},
        });
        return changed.count===1;
    }catch{return false;}
}
export async function holdUncertainLidarrArtistCreation(
    owner:PinnedImportOwner,id:string,token:string,
):Promise<boolean>{
    if(!valid(owner,id,token))return false;
    try{
        const changed=await prisma.downtifyNativeImport.updateMany({
            where:{...scoped(owner,id,token),status:"lidarr_artist_creating"},
            data:{status:"uncertain",reviewReason:"lidarr_artist_creation_uncertain"},
        });
        return changed.count===1;
    }catch{return false;}
}
