/**
 * Non-replaying, fully owner-scoped Kima -> Lidarr importer coordinator.
 * Kima copies verified music into its separate shared staging root; Lidarr
 * alone imports/moves/renames within its own managed music library.
 *
 * A crash between persisting "submitting" and receiving the remote command
 * ID is ambiguous. We DO NOT retry that POST. Existing RC6/Kima files are
 * never moved or modified here.
 */
import { prisma } from "../utils/db";
import { getSystemSettings } from "../utils/systemSettings";
import { createLidarrClient } from "./lidarrClient";
import { requestScan } from "../workers/scanRequest";
import type { PinnedImportOwner } from "./downtifyNativeImportLedger";
import {
    type LidarrMountMapping,lidarrStageFilePaths,
    validateLidarrMountMapping,verifyPinnedLidarrBytes,
} from "./downtifyLidarrMounts";
import {
    previewVerifiedLidarrImport,submitVerifiedLidarrImport,
} from "./downtifyLidarrHandoff";
import { inspectLidarrFinalReceipt } from "./downtifyLidarrFinalReceipt";
import {
    beginLidarrSubmission,acknowledgeLidarrCommand,
    holdUncertainLidarrSubmission,noteLidarrMatchNeeded,
    recordLidarrFinalFile,
} from "./downtifyNativeLidarrLedger";

export type HandoffSummary={staged:number;submitted:number;finalized:number;held:number};
const empty=():HandoffSummary=>({staged:0,submitted:0,finalized:0,held:0});
const ownerFilter=(o:PinnedImportOwner)=>({
    ownerKimaUserId:o.kimaUserId,
    remoteServerId:o.remoteServerId,remoteUserId:o.remoteUserId,
    importTarget:"lidarr",
});

export async function reconcileLidarrManagedImports(
    owner:PinnedImportOwner,roots:LidarrMountMapping,
):Promise<HandoffSummary>{
    const summary=empty();
    if(!validateLidarrMountMapping(roots))return summary;
    const settings=await getSystemSettings(true).catch(()=>null);
    if(!settings?.lidarrEnabled || !settings.lidarrUrl ||
        !settings.lidarrApiKey)return summary;
    const lidarr=createLidarrClient(settings.lidarrUrl,settings.lidarrApiKey,15000);
    const staged=await prisma.downtifyNativeImport.findMany({
        where:{...ownerFilter(owner),status:"staged_pending_lidarr"},
        select:{
            id:true,claimToken:true,stagedRelativePath:true,
            stagedSha256:true,stagedBytes:true,stagedArtist:true,
            stagedAlbum:true,stagedTitle:true,stagedDurationMs:true,
        },orderBy:{discoveredAt:"asc"},take:2,
    });
    for(const row of staged){
        if(!row.claimToken || !row.stagedRelativePath ||
            !row.stagedSha256 || !row.stagedBytes ||
            !row.stagedArtist || !row.stagedAlbum || !row.stagedTitle ||
            !row.stagedDurationMs)continue;
        const paths=lidarrStageFilePaths(roots,row.stagedRelativePath);
        if(!paths)continue;
        const verified=await verifyPinnedLidarrBytes(
            paths.local,roots.kimaDownloads,row.stagedBytes,row.stagedSha256,
        );
        if(!verified){
            await prisma.downtifyNativeImport.updateMany({
                where:{...ownerFilter(owner),id:row.id,
                    claimToken:row.claimToken,status:"staged_pending_lidarr"},
                data:{status:"uncertain",reviewReason:"lidarr_stage_changed"},
            }).catch(()=>undefined);
            summary.held++;continue;
        }
        summary.staged++;
        const preview=await previewVerifiedLidarrImport(lidarr,{
            path:paths.lidarr,bytes:row.stagedBytes,artist:row.stagedArtist,
            album:row.stagedAlbum,title:row.stagedTitle,
            durationMs:row.stagedDurationMs,
        });
        if(preview.state==="unavailable")continue;
        if(preview.state!=="matched"){
            await noteLidarrMatchNeeded(owner,row.id,row.claimToken);
            summary.held++;continue;
        }
        const acquired=await beginLidarrSubmission(
            owner,row.id,row.claimToken,preview.match,
            row.stagedRelativePath,row.stagedSha256,
        );
        if(!acquired)continue; // Another worker or settings change won.
        // The single-use remote operation is possible ONLY after the durable
        // CAS succeeded. Unknown/timeout is never automatically retried.
        const result=await submitVerifiedLidarrImport(lidarr,preview.match);
        if(result.state==="accepted"){
            if(await acknowledgeLidarrCommand(
                owner,row.id,row.claimToken,result.commandId,
            ))summary.submitted++;
            else summary.held++; // Already sent, but local receipt unclear.
        }else{
            await holdUncertainLidarrSubmission(owner,row.id,row.claimToken);
            summary.held++;
        }
    }
    const waiting=await prisma.downtifyNativeImport.findMany({
        where:{...ownerFilter(owner),status:"lidarr_waiting"},
        select:{
            id:true,claimToken:true,lidarrCommandId:true,
            lidarrArtistId:true,lidarrAlbumId:true,lidarrTrackId:true,
            stagedSha256:true,stagedBytes:true,stagedDurationMs:true,
        },orderBy:{updatedAt:"asc"},take:20,
    });
    for(const row of waiting){
        if(!row.claimToken||!row.lidarrCommandId||
            !row.lidarrArtistId||!row.lidarrAlbumId||!row.lidarrTrackId||
            !row.stagedSha256||!row.stagedBytes||!row.stagedDurationMs)continue;
        const result=await inspectLidarrFinalReceipt(lidarr,roots,{
            commandId:row.lidarrCommandId,
            artistId:row.lidarrArtistId,albumId:row.lidarrAlbumId,
            trackId:row.lidarrTrackId,bytes:row.stagedBytes,
            sha256:row.stagedSha256,durationMs:row.stagedDurationMs,
        });
        if(result.state==="needs_review"){
            await prisma.downtifyNativeImport.updateMany({
                where:{...ownerFilter(owner),id:row.id,
                    status:"lidarr_waiting",claimToken:row.claimToken},
                data:{reviewReason:"lidarr_receipt_needs_review"},
            }).catch(()=>undefined);
            summary.held++;continue;
        }
        if(result.state!=="verified")continue;
        const recorded=await recordLidarrFinalFile(
            owner,row.id,row.claimToken,
            result.relativePath,result.lidarrTrackFileId,
            row.stagedSha256,row.stagedBytes,
        );
        if(!recorded)continue;
        summary.finalized++;
        // The scanner is requested ONLY after Lidarr completed import and
        // both hashes matched. Redis failure is recovered by existing
        // published_pending_scan scan-only reconciliation.
        try{
            await requestScan({
                source:"downtify-native-lidarr",
                userId:owner.kimaUserId,
                downtifyNativeImportId:"lidarr-"+row.id,
            });
        }catch{/* Durable receipt is retained; no media re-copy. */}
    }
    return summary;
}
