/**
 * Owner-only selection between existing Kima library importer and the
 * Lidarr-managed backend. Existing RC6 instances remain in Kima mode.
 *
 * Selecting Lidarr is explicit, OFF while changing, and requires an
 * independently mounted staging volume plus a real Lidarr root folder.
 * The source music volume marker and historic import receipts are retained.
 */
import { prisma } from "../utils/db";
import { config } from "../config";
import { getSystemSettings } from "../utils/systemSettings";
import { createLidarrClient } from "./lidarrClient";
import { initializeNativeMusicVolume, verifyNativeMusicVolume } from "./downtifyNativeMountProof";
import { validateLidarrMountMapping } from "./downtifyLidarrMounts";

export type Target = "kima"|"lidarr";
export type LidarrTargetStatus = {
    target: Target;
    stageReady:boolean;
    lidarrConnected:boolean;
    // Non-secret paths are visible only to the paired Kima administrator.
    kimaDownloads:string|null;
    lidarrDownloads:string|null;
    lidarrMusic:string|null;
};
export class TargetSetupError extends Error {
    constructor(public readonly state:
        "not_paired"|"unauthorized"|"pause_first"|
        "outstanding_work"|"acknowledgment_required"|
        "invalid_staging"|"lidarr_unavailable"|"changed_during_setup"){
        super(state);
    }
}
const owner=async(id:string)=>{
    const row=await prisma.downtifyIntegration.findUnique({
        where:{id:"default"},
        select:{
            ownerKimaUserId:true,expectedServerId:true,
            expectedUserId:true,nativeImportEnabled:true,
            nativeImportTarget:true,nativeLidarrLocalDownloads:true,
            nativeLidarrRemoteDownloads:true,nativeLidarrRemoteMusic:true,
            nativeLidarrStageMountProof:true,
        },
    });
    if(!row)throw new TargetSetupError("not_paired");
    if(row.ownerKimaUserId!==id)throw new TargetSetupError("unauthorized");
    return row;
};
export async function getNativeLidarrTargetStatus(adminId:string):Promise<LidarrTargetStatus>{
    const row=await owner(adminId);
    const target=row.nativeImportTarget==="lidarr"?"lidarr":"kima";
    const stageReady=target==="lidarr" &&
        !!row.nativeLidarrLocalDownloads &&
        await verifyNativeMusicVolume(
            row.nativeLidarrLocalDownloads, row.nativeLidarrStageMountProof,
        );
    return {
        target,stageReady:!!stageReady,
        lidarrConnected:target==="lidarr"&&!!row.nativeLidarrRemoteMusic,
        kimaDownloads:row.nativeLidarrLocalDownloads,
        lidarrDownloads:row.nativeLidarrRemoteDownloads,
        lidarrMusic:row.nativeLidarrRemoteMusic,
    };
}

export async function setNativeLidarrTarget(
    adminId:string,target:Target,
    remoteDownloads:string|null,remoteMusic:string|null,ack:boolean,
):Promise<LidarrTargetStatus>{
    if(!ack)throw new TargetSetupError("acknowledgment_required");
    const row=await owner(adminId);
    if(row.nativeImportEnabled)throw new TargetSetupError("pause_first");
    // This check applies to Kima and Lidarr; do not change destination while
    // either pipeline has an outstanding unverifiable remote write.
    const outstanding=await prisma.downtifyNativeImport.count({where:{
        ownerKimaUserId:adminId,remoteServerId:row.expectedServerId,
        remoteUserId:row.expectedUserId,status:{in:[
            "ready","claimed","published_pending_scan",
            "staged_pending_lidarr","lidarr_submitting","lidarr_waiting",
        ]},
    }});
    if(outstanding>0)throw new TargetSetupError("outstanding_work");
    if(target==="kima"){
        const changed=await prisma.downtifyIntegration.updateMany({
            where:{id:"default",ownerKimaUserId:adminId,
                expectedServerId:row.expectedServerId,
                expectedUserId:row.expectedUserId,nativeImportEnabled:false,
            },
            data:{
                nativeImportTarget:"kima",
                nativeLidarrLocalDownloads:null,
                nativeLidarrRemoteDownloads:null,
                nativeLidarrRemoteMusic:null,
                nativeLidarrStageMountProof:null,
            },
        });
        if(changed.count!==1)throw new TargetSetupError("changed_during_setup");
        return getNativeLidarrTargetStatus(adminId);
    }
    if(target!=="lidarr")throw new TargetSetupError("invalid_staging");
    const settings=await getSystemSettings(true);
    if(!settings?.lidarrEnabled || !settings.lidarrUrl ||
        !settings.lidarrApiKey || !settings.downloadPath){
        throw new TargetSetupError("lidarr_unavailable");
    }
    const localDownloads=settings.downloadPath;
    const roots={kimaDownloads:localDownloads,lidarrDownloads:remoteDownloads||"",
        kimaMusic:config.music.musicPath,lidarrMusic:remoteMusic||""};
    if(!validateLidarrMountMapping(roots)){
        throw new TargetSetupError("invalid_staging");
    }
    const lidarr=createLidarrClient(settings.lidarrUrl,settings.lidarrApiKey,12000);
    let rootFolders:unknown;
    try{
        const response=await lidarr.get("/api/v1/rootfolder",{
            maxRedirects:0,proxy:false,maxContentLength:512*1024,
        });
        rootFolders=response.data;
    }catch{throw new TargetSetupError("lidarr_unavailable");}
    if(!Array.isArray(rootFolders) || !rootFolders.some(x=>
        x && typeof x==="object" && x.path===remoteMusic)){
        throw new TargetSetupError("invalid_staging");
    }
    // Explicit action after checking that Lidarr sees its real music root.
    // An empty/missing host download mount must never become a writable
    // Docker fallback or be silently treated as a proven shared mount.
    const stageProof=await initializeNativeMusicVolume(localDownloads);
    if(!stageProof)throw new TargetSetupError("invalid_staging");
    const changed=await prisma.downtifyIntegration.updateMany({
        where:{
            id:"default",ownerKimaUserId:adminId,
            expectedServerId:row.expectedServerId,
            expectedUserId:row.expectedUserId,nativeImportEnabled:false,
        },
        data:{
            nativeImportTarget:"lidarr",
            nativeLidarrLocalDownloads:localDownloads,
            nativeLidarrRemoteDownloads:remoteDownloads,
            nativeLidarrRemoteMusic:remoteMusic,
            nativeLidarrStageMountProof:stageProof,
        },
    });
    if(changed.count!==1)throw new TargetSetupError("changed_during_setup");
    return getNativeLidarrTargetStatus(adminId);
}
