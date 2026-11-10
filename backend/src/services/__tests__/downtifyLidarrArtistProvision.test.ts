import {
 preflightMissingLidarrArtist,submitMissingLidarrArtist,
} from "../downtifyLidarrArtistProvision";
const mbid="01234567-89ab-4cde-8fab-0123456789ab";
const artist={foreignArtistId:mbid,artistName:"Tina Turner"};
const folder={path:"/music",defaultQualityProfileId:3,defaultMetadataProfileId:2};
const params={qualityProfileId:null,metadataProfileId:null};
const client=(artists:unknown[]=[],lookup:unknown[]=[artist],folders:unknown[]=[folder])=>({
 get:jest.fn(async(url:string)=>{
  if(url==="/api/v1/artist")return {data:artists};
  if(url==="/api/v1/artist/lookup")return {data:lookup};
  if(url==="/api/v1/rootfolder")return {data:folders};
  throw Error("unknown");
 }),
 post:jest.fn().mockResolvedValue({data:{id:4,...artist}}),
});
describe("consented exact MusicBrainz artist creation",()=>{
 it("only proposes one exact, unique artist with searches and monitoring off",async()=>{
  const transport=client();
  const result=await preflightMissingLidarrArtist(transport as never,
   "Tina Turner","/music",params);
  expect(result.state).toBe("missing_unique");
  if(result.state!=="missing_unique")throw Error("fixture");
  expect(result.payload).toEqual({
   ...artist,rootFolderPath:"/music",qualityProfileId:3,
   metadataProfileId:2,monitored:false,monitorNewItems:"none",
   addOptions:{monitor:"none",searchForMissingAlbums:false},
  });
  expect(await submitMissingLidarrArtist(transport as never,result.payload))
   .toEqual({state:"accepted",artistId:4});
  expect(transport.post).toHaveBeenCalledWith("/api/v1/artist",
   result.payload,expect.objectContaining({proxy:false,maxRedirects:0}));
 });
 it("does not add an artist already in Lidarr or guess from duplicate names",async()=>{
  expect((await preflightMissingLidarrArtist(client([artist]) as never,
   "Tina Turner","/music",params)).state).toBe("already_present");
  expect((await preflightMissingLidarrArtist(client([],[
    artist,{...artist,foreignArtistId:"11111111-2222-4333-8444-555555555555"},
  ]) as never,"Tina Turner","/music",params)).state).toBe("needs_review");
 });
 it("refuses wrong music root, missing profiles and fuzzy artist spelling",async()=>{
  expect((await preflightMissingLidarrArtist(client() as never,
   "Tina Turner","/elsewhere",params)).state).toBe("needs_review");
  expect((await preflightMissingLidarrArtist(client([],[
   {...artist,artistName:"Tina Turner Tribute"},
  ]) as never,"Tina Turner","/music",params)).state).toBe("needs_review");
  expect(await preflightMissingLidarrArtist(client() as never, "Tina Turner",
   "/music",{qualityProfileId:0,metadataProfileId:0})).toMatchObject({
    state:"missing_unique",
  });
 });
 it("treats a timeout or mismatched receipt as unknown, NEVER auto-retry",async()=>{
  const found=await preflightMissingLidarrArtist(client() as never,
   "Tina Turner","/music",params);
  if(found.state!=="missing_unique")throw Error("fixture");
  const timeout={post:jest.fn().mockRejectedValue(Error("timeout"))};
  expect(await submitMissingLidarrArtist(timeout as never,found.payload))
   .toEqual({state:"unknown_outcome"});
  expect(timeout.post).toHaveBeenCalledTimes(1);
 });
});
