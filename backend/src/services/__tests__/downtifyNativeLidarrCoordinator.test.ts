import { prisma } from "../../utils/db";
import { getSystemSettings } from "../../utils/systemSettings";
import { createLidarrClient } from "../lidarrClient";
import { verifyPinnedLidarrBytes } from "../downtifyLidarrMounts";
import { previewVerifiedLidarrImport,submitVerifiedLidarrImport } from "../downtifyLidarrHandoff";
import { inspectLidarrFinalReceipt } from "../downtifyLidarrFinalReceipt";
import { beginLidarrSubmission,acknowledgeLidarrCommand,
 holdUncertainLidarrSubmission,recordLidarrFinalFile } from "../downtifyNativeLidarrLedger";
import { requestScan } from "../../workers/scanRequest";
import { reconcileLidarrManagedImports } from "../downtifyNativeLidarrCoordinator";
jest.mock("../../utils/db",()=>({prisma:{downtifyNativeImport:{
 findMany:jest.fn(),updateMany:jest.fn(),
}}}));
jest.mock("../../utils/systemSettings",()=>({getSystemSettings:jest.fn()}));
jest.mock("../lidarrClient",()=>({createLidarrClient:jest.fn()}));
jest.mock("../downtifyLidarrMounts",()=>({
 ...jest.requireActual("../downtifyLidarrMounts"),
 verifyPinnedLidarrBytes:jest.fn(),
}));
jest.mock("../downtifyLidarrHandoff",()=>({
 previewVerifiedLidarrImport:jest.fn(),submitVerifiedLidarrImport:jest.fn(),
}));
jest.mock("../downtifyLidarrFinalReceipt",()=>({inspectLidarrFinalReceipt:jest.fn()}));
jest.mock("../downtifyNativeLidarrLedger",()=>({
 beginLidarrSubmission:jest.fn(),acknowledgeLidarrCommand:jest.fn(),
 holdUncertainLidarrSubmission:jest.fn(),noteLidarrMatchNeeded:jest.fn(),
 recordLidarrFinalFile:jest.fn(),
}));
jest.mock("../../workers/scanRequest",()=>({requestScan:jest.fn()}));
const getRows=prisma.downtifyNativeImport.findMany as jest.Mock;
const update=prisma.downtifyNativeImport.updateMany as jest.Mock;
const getSettings=getSystemSettings as jest.Mock;
const client=createLidarrClient as jest.Mock;
const verify=verifyPinnedLidarrBytes as jest.Mock;
const preview=previewVerifiedLidarrImport as jest.Mock;
const submit=submitVerifiedLidarrImport as jest.Mock;
const begin=beginLidarrSubmission as jest.Mock;
const acknowledge=acknowledgeLidarrCommand as jest.Mock;
const hold=holdUncertainLidarrSubmission as jest.Mock;
const final=inspectLidarrFinalReceipt as jest.Mock;
const record=recordLidarrFinalFile as jest.Mock;
const scan=requestScan as jest.Mock;
const roots={kimaDownloads:"/downloads",lidarrDownloads:"/downloads",
 kimaMusic:"/music",lidarrMusic:"/music"};
const owner={kimaUserId:"admin",remoteServerId:"server",remoteUserId:7};
const staged={
 id:"clvimport001",claimToken:"11111111-1111-4111-8111-111111111111",
 stagedRelativePath:"Singles/Downtify/Tina Turner/Song - 0123456789ABCDEFGHIJKL.flac",
 stagedSha256:"a".repeat(64),stagedBytes:1024,stagedArtist:"Tina Turner",
 stagedAlbum:"Private Dancer",stagedTitle:"Song",stagedDurationMs:242480,
};
const match={path:"/downloads/"+staged.stagedRelativePath,artistId:1,
 albumId:2,albumReleaseId:3,trackId:4,quality:{quality:{id:7}}};
beforeEach(()=>{
 jest.clearAllMocks();
 getRows.mockResolvedValueOnce([staged]).mockResolvedValueOnce([]);
 getSettings.mockResolvedValue({lidarrEnabled:true,lidarrUrl:"http://lidarr:8686",
  lidarrApiKey:"secret"});
 client.mockReturnValue({get:jest.fn(),post:jest.fn()});
 verify.mockResolvedValue(true);
 preview.mockResolvedValue({state:"matched",match});
 begin.mockResolvedValue(true);
 submit.mockResolvedValue({state:"accepted",commandId:20});
 acknowledge.mockResolvedValue(true);
 hold.mockResolvedValue(true);
 record.mockResolvedValue(true);
 final.mockResolvedValue({state:"waiting"});
 update.mockResolvedValue({count:1});
 scan.mockResolvedValue({queued:true});
});
describe("owned Lidarr staging -> one command -> final receipt",()=>{
 it("requests exactly one read-only preview and one durable single-use import",async()=>{
  expect(await reconcileLidarrManagedImports(owner,roots)).toMatchObject({
   staged:1,submitted:1,finalized:0,held:0,
  });
  expect(verify).toHaveBeenCalledWith(
   "/downloads/"+staged.stagedRelativePath,"/downloads",1024,"a".repeat(64));
  expect(begin).toHaveBeenCalledWith(owner,staged.id,staged.claimToken,
   match,staged.stagedRelativePath,staged.stagedSha256);
  expect(submit).toHaveBeenCalledTimes(1);
  expect(acknowledge).toHaveBeenCalledWith(owner,staged.id,staged.claimToken,20);
  expect(scan).not.toHaveBeenCalled();
 });
 it("never submits if the staged file is missing or its hash differs",async()=>{
  verify.mockResolvedValue(false);
  expect(await reconcileLidarrManagedImports(owner,roots)).toMatchObject({
   submitted:0,held:1,
  });
  expect(preview).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
  expect(update.mock.calls[0][0]).toMatchObject({
   where:{status:"staged_pending_lidarr",ownerKimaUserId:"admin"},
   data:{status:"uncertain",reviewReason:"lidarr_stage_changed"},
  });
 });
 it("never retries an unknown remote command response",async()=>{
  submit.mockResolvedValue({state:"unknown_outcome"});
  await reconcileLidarrManagedImports(owner,roots);
  expect(hold).toHaveBeenCalledWith(owner,staged.id,staged.claimToken);
  expect(submit).toHaveBeenCalledTimes(1);
  expect(acknowledge).not.toHaveBeenCalled();
 });
 it("does not create a Lidarr import if MusicBrainz album is ambiguous",async()=>{
  preview.mockResolvedValue({state:"needs_review"});
  await reconcileLidarrManagedImports(owner,roots);
  expect(begin).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
 });
 it("confirms exact Lidarr final file before asking Kima to scan",async()=>{
  getRows.mockReset();
  getRows.mockResolvedValueOnce([]).mockResolvedValueOnce([{
   id:staged.id,claimToken:staged.claimToken,
   lidarrCommandId:20,lidarrArtistId:1,lidarrAlbumId:2,
   lidarrTrackId:4,stagedSha256:staged.stagedSha256,
   stagedBytes:1024,stagedDurationMs:242480,
  }]);
  final.mockResolvedValue({state:"verified",lidarrTrackFileId:30,
    relativePath:"Tina Turner/Private Dancer/02 - Song.flac"});
  const result=await reconcileLidarrManagedImports(owner,roots);
  expect(result.finalized).toBe(1);
  expect(record).toHaveBeenCalledWith(owner,staged.id,staged.claimToken,
   "Tina Turner/Private Dancer/02 - Song.flac",30,
   staged.stagedSha256,1024);
  expect(scan).toHaveBeenCalledWith({
   source:"downtify-native-lidarr",userId:"admin",
   downtifyNativeImportId:"lidarr-"+staged.id,
  });
  expect(submit).not.toHaveBeenCalled();
 });
 it("never contacts Lidarr if the system settings disable it",async()=>{
  getSettings.mockResolvedValue({lidarrEnabled:false});
  await reconcileLidarrManagedImports(owner,roots);
  expect(getRows).not.toHaveBeenCalled();
  expect(client).not.toHaveBeenCalled();
 });
});
