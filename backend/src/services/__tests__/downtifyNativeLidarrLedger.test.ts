import { prisma } from "../../utils/db";
import {
 recordLidarrStaged,beginLidarrSubmission,acknowledgeLidarrCommand,
 holdUncertainLidarrSubmission,noteLidarrMatchNeeded,recordLidarrFinalFile,
} from "../downtifyNativeLidarrLedger";
jest.mock("../../utils/db",()=>({
 prisma:{downtifyNativeImport:{updateMany:jest.fn()}},
}));
const update=prisma.downtifyNativeImport.updateMany as jest.Mock;
const owner={kimaUserId:"owner-a",remoteServerId:"server-1",remoteUserId:1};
const id="clvimport001";
const token="11111111-1111-4111-8111-111111111111";
const hash="a".repeat(64);
const stage="Singles/Downtify/Tina Turner/Song - 0123456789ABCDEFGHIJKL.flac";
const match={path:"/downloads/"+stage,artistId:1,albumId:2,
 albumReleaseId:3,trackId:4,quality:{quality:{id:7}}};
beforeEach(()=>{jest.clearAllMocks();update.mockResolvedValue({count:1});});
describe("Durable owner-bound Lidarr handoff",()=>{
 it("records staged owner media without claiming an indexed import",async()=>{
  expect(await recordLidarrStaged(owner,id,token,{
   relative:stage,bytes:1024,sha256:hash,artist:"Tina Turner",
   album:"Private Dancer",title:"Song",durationMs:242480,
   remoteTrackId:"t0123456789abcdef",
  })).toBe(true);
  const data=update.mock.calls[0][0];
  expect(data.where).toMatchObject({
   ownerKimaUserId:"owner-a",remoteServerId:"server-1",remoteUserId:1,
   importTarget:"lidarr",status:"claimed",claimToken:token,
   stagedRelativePath:null,outputRelativePath:null,
  });
  expect(data.data).toMatchObject({status:"staged_pending_lidarr",stagedSha256:hash});
 });
 it("persists single-use intent, then acknowledges exactly one command",async()=>{
  expect(await beginLidarrSubmission(owner,id,token,match,stage,hash)).toBe(true);
  expect(update.mock.calls[0][0]).toMatchObject({
   where:{status:"staged_pending_lidarr",lidarrSubmittedAt:null,
    lidarrCommandId:null,stagedSha256:hash},
   data:{status:"lidarr_submitting",lidarrArtistId:1,lidarrAlbumId:2,lidarrTrackId:4},
  });
  expect(await acknowledgeLidarrCommand(owner,id,token,55)).toBe(true);
  expect(update.mock.calls[1][0]).toMatchObject({
   where:{status:"lidarr_submitting",lidarrCommandId:null},
   data:{status:"lidarr_waiting",lidarrCommandId:55},
  });
 });
 it("never requeues a remote submission with unknown outcome",async()=>{
  expect(await holdUncertainLidarrSubmission(owner,id,token)).toBe(true);
  expect(update.mock.calls[0][0].data).toEqual({
   status:"uncertain",reviewReason:"lidarr_submission_uncertain",
  });
  expect(await noteLidarrMatchNeeded(owner,id,token)).toBe(true);
  expect(update.mock.calls[1][0].data).toEqual({
   reviewReason:"lidarr_match_required",
  });
 });
 it("accepts final receipt only for matching immutable staged hash and size",async()=>{
  expect(await recordLidarrFinalFile(owner,id,token,
   "Tina Turner/Private Dancer/02 - Song.flac",15,hash,1024)).toBe(true);
  expect(update.mock.calls[0][0]).toMatchObject({
   where:{status:"lidarr_waiting",stagedSha256:hash,stagedBytes:1024,
    outputRelativePath:null,fullSha256:null},
   data:{status:"published_pending_scan",lidarrTrackFileId:15,
    expectedBytes:1024,fullSha256:hash},
  });
 });
 it("accepts Lidarr's configured Artist/Track layout without an album directory",async()=>{
  expect(await recordLidarrFinalFile(owner,id,token,
   "Tina Turner/02 - Song.flac",15,hash,1024)).toBe(true);
  expect(update.mock.calls[0][0].data.outputRelativePath)
   .toBe("Tina Turner/02 - Song.flac");
 });
 it("rejects unsafe paths, different owner/id, invalid ids and hash",async()=>{
  expect(await recordLidarrFinalFile(owner,id,token,
   "Singles/Downtify/Tina Turner/Song.flac",15,hash,1024)).toBe(false);
  expect(await recordLidarrFinalFile(owner,id,token,
   "Tina Turner/../Song.flac",15,hash,1024)).toBe(false);
  expect(await recordLidarrFinalFile(owner,id,token,
   "Unowned.flac",15,hash,1024)).toBe(false);
  expect(await recordLidarrFinalFile(owner,id,token,
   "Tina Turner/Album/Track.flac",-1,hash,1024)).toBe(false);
  expect(await beginLidarrSubmission(owner,id,token,match,stage,"bad")).toBe(false);
  expect(update).not.toHaveBeenCalled();
 });
 it("fails closed if the CAS acknowledged zero rows",async()=>{
  update.mockResolvedValue({count:0});
  expect(await acknowledgeLidarrCommand(owner,id,token,42)).toBe(false);
 });
});
