import { prisma } from "../../utils/db";
import { getSystemSettings } from "../../utils/systemSettings";
import { initializeNativeMusicVolume,verifyNativeMusicVolume } from "../downtifyNativeMountProof";
import { createLidarrClient } from "../lidarrClient";
import { getNativeLidarrTargetStatus,setNativeLidarrTarget } from "../downtifyLidarrTargetSettings";
jest.mock("../../config",()=>({config:{music:{musicPath:"/music"}}}));
jest.mock("../../utils/db",()=>({
 prisma:{downtifyIntegration:{findUnique:jest.fn(),updateMany:jest.fn()},
 downtifyNativeImport:{count:jest.fn()}},
}));
jest.mock("../../utils/systemSettings",()=>({getSystemSettings:jest.fn()}));
jest.mock("../downtifyNativeMountProof",()=>({
 initializeNativeMusicVolume:jest.fn(),verifyNativeMusicVolume:jest.fn(),
}));
jest.mock("../lidarrClient",()=>({createLidarrClient:jest.fn()}));
const find=prisma.downtifyIntegration.findUnique as jest.Mock;
const update=prisma.downtifyIntegration.updateMany as jest.Mock;
const count=prisma.downtifyNativeImport.count as jest.Mock;
const getSettings=getSystemSettings as jest.Mock;
const init=initializeNativeMusicVolume as jest.Mock;
const verify=verifyNativeMusicVolume as jest.Mock;
const lidarr=createLidarrClient as jest.Mock;
const row={
 ownerKimaUserId:"admin",expectedServerId:"server",expectedUserId:9,
 nativeImportEnabled:false,nativeImportTarget:"kima",
 nativeLidarrLocalDownloads:null,nativeLidarrRemoteDownloads:null,
 nativeLidarrRemoteMusic:null,nativeLidarrStageMountProof:null,
 nativeLidarrAllowArtistCreation:false,
};
beforeEach(()=>{
 jest.clearAllMocks();
 find.mockResolvedValue({...row});
 count.mockResolvedValue(0);
 update.mockResolvedValue({count:1});
 getSettings.mockResolvedValue({lidarrEnabled:true,lidarrUrl:"http://lidarr:8686",
  lidarrApiKey:"secret",downloadPath:"/downloads"});
 init.mockResolvedValue("11111111-1111-4111-8111-111111111111");
 verify.mockResolvedValue(true);
 lidarr.mockReturnValue({get:jest.fn().mockResolvedValue({data:[{path:"/music"}]})});
});
describe("one-switch destination selection (Lidarr optional)",()=>{
 it("preserves existing RC6 Kima target and exposes no Lidarr secret",async()=>{
  const status=await getNativeLidarrTargetStatus("admin");
  expect(status).toEqual({target:"kima",stageReady:false,
   lidarrConnected:false,kimaDownloads:null,lidarrDownloads:null,lidarrMusic:null,
   allowArtistCreation:false});
  expect(JSON.stringify(status)).not.toContain("secret");
  expect(lidarr).not.toHaveBeenCalled();
 });
 it("refuses another owner, changing during import, unconfirmed or pending work",async()=>{
  await expect(setNativeLidarrTarget("other","lidarr","/downloads","/music",true))
   .rejects.toMatchObject({state:"unauthorized"});
  await expect(setNativeLidarrTarget("admin","lidarr","/downloads","/music",false))
   .rejects.toMatchObject({state:"acknowledgment_required"});
  find.mockResolvedValueOnce({...row,nativeImportEnabled:true});
  await expect(setNativeLidarrTarget("admin","lidarr","/downloads","/music",true))
   .rejects.toMatchObject({state:"pause_first"});
  count.mockResolvedValueOnce(1);
  await expect(setNativeLidarrTarget("admin","lidarr","/downloads","/music",true))
   .rejects.toMatchObject({state:"outstanding_work"});
  expect(init).not.toHaveBeenCalled();
 });
 it("requires actual Lidarr root and verified staging; does not write into music",async()=>{
  lidarr.mockReturnValueOnce({get:jest.fn().mockResolvedValue({data:[{path:"/wrong"}]})});
  await expect(setNativeLidarrTarget("admin","lidarr","/downloads","/music",true))
   .rejects.toMatchObject({state:"invalid_staging"});
  expect(init).not.toHaveBeenCalled();
  await expect(setNativeLidarrTarget("admin","lidarr","/music/downloads","/music",true))
   .rejects.toMatchObject({state:"invalid_staging"});
  expect(init).not.toHaveBeenCalled();
 });
 it("stores a pinned stage marker and non-overlapping roots after explicit approval",async()=>{
  await setNativeLidarrTarget("admin","lidarr","/downloads","/music",true);
  expect(init).toHaveBeenCalledWith("/downloads");
  expect(update.mock.calls[0][0]).toMatchObject({
   where:{nativeImportEnabled:false,ownerKimaUserId:"admin"},
   data:{nativeImportTarget:"lidarr",nativeLidarrLocalDownloads:"/downloads",
    nativeLidarrRemoteDownloads:"/downloads",nativeLidarrRemoteMusic:"/music"},
  });
  expect(lidarr).toHaveBeenCalledTimes(1);
 });
 it("switches back to standalone Kima only when paused and no work pending",async()=>{
  find.mockResolvedValue({...row,nativeImportTarget:"lidarr"});
  await setNativeLidarrTarget("admin","kima",null,null,true);
  expect(update.mock.calls[0][0].data).toMatchObject({
   nativeImportTarget:"kima",nativeLidarrStageMountProof:null,
  });
  expect(init).not.toHaveBeenCalled();
 });
});
