/**
 * Explicitly consented, uniquely resolved missing-artist provisioning.
 *
 * Never monitor/search entire discographies. Never choose a MusicBrainz
 * artist from a fuzzy or ambiguous search. Callers MUST durably record a
 * single-use "lidarr_artist_creating" intent before the non-replayable POST.
 */
import type { AxiosInstance } from "axios";
const isObject=(x:unknown):x is Record<string,unknown>=>
    !!x && typeof x==="object" && !Array.isArray(x);
const normalize=(x:unknown):string|null=>
    typeof x==="string" && !!x.trim() && x.length<=300 &&
    !/[\u0000-\u001f\u007f]/.test(x)
        ? x.trim().normalize("NFKC").toLocaleLowerCase("en") : null;
const positive=(x:unknown):x is number=>Number.isSafeInteger(x)&&Number(x)>0;
const MBID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type ArtistPayload={
    foreignArtistId:string;artistName:string;rootFolderPath:string;
    qualityProfileId:number;metadataProfileId:number;
    monitored:false;monitorNewItems:"none";
    addOptions:{monitor:"none";searchForMissingAlbums:false};
};
export type ArtistPreflight=
    | {state:"missing_unique";payload:ArtistPayload}
    | {state:"already_present"|"needs_review"|"unavailable"};

export async function preflightMissingLidarrArtist(
    client:Pick<AxiosInstance,"get">,
    name:string, lidarrMusicRoot:string,
    preferred:{qualityProfileId?:number|null;metadataProfileId?:number|null},
):Promise<ArtistPreflight>{
    const actualName=normalize(name);
    if(!actualName || !lidarrMusicRoot.startsWith("/") ||
        lidarrMusicRoot==="/" || lidarrMusicRoot.includes("..") ||
        lidarrMusicRoot.includes("\\"))return {state:"needs_review"};
    const opts={timeout:15000,maxRedirects:0,proxy:false as const,
        maxContentLength:3*1024*1024};
    try{
        const existing=(await client.get("/api/v1/artist",opts)).data;
        if(!Array.isArray(existing)||existing.length>10000)return {state:"unavailable"};
        if(existing.some((artist:unknown)=>isObject(artist) &&
            normalize(artist.artistName)===actualName)){
            return {state:"already_present"};
        }
        const [lookup,folders]=await Promise.all([
            client.get("/api/v1/artist/lookup",{...opts,params:{term:name}}),
            client.get("/api/v1/rootfolder",opts),
        ]);
        if(!Array.isArray(lookup.data) || lookup.data.length>100 ||
            !Array.isArray(folders.data) || folders.data.length>100)return {state:"unavailable"};
        const artists=lookup.data.filter((artist:unknown)=>isObject(artist) &&
            normalize(artist.artistName)===actualName &&
            typeof artist.foreignArtistId==="string" &&
            MBID.test(artist.foreignArtistId));
        const folder=folders.data.find((item:unknown)=>isObject(item) &&
            item.path===lidarrMusicRoot);
        if(artists.length!==1 || !isObject(folder))return {state:"needs_review"};
        const item=artists[0] as Record<string,unknown>;
        const quality=preferred.qualityProfileId || folder.defaultQualityProfileId;
        const metadata=preferred.metadataProfileId || folder.defaultMetadataProfileId;
        if(!positive(quality)||!positive(metadata))return {state:"needs_review"};
        return {
            state:"missing_unique",
            payload:{
                foreignArtistId:item.foreignArtistId as string,
                artistName:item.artistName as string,
                rootFolderPath:lidarrMusicRoot,
                qualityProfileId:quality,metadataProfileId:metadata,
                monitored:false,monitorNewItems:"none",
                addOptions:{monitor:"none",searchForMissingAlbums:false},
            },
        };
    }catch{return {state:"unavailable"};}
}
export type ArtistSubmission=
    | {state:"accepted";artistId:number}
    | {state:"unknown_outcome"};
export async function submitMissingLidarrArtist(
    client:Pick<AxiosInstance,"post">,
    payload:ArtistPayload,
):Promise<ArtistSubmission>{
    try{
        const result=await client.post("/api/v1/artist",payload,{
            timeout:30000,maxRedirects:0,proxy:false,
        });
        if(!positive(result.data?.id) ||
            result.data.foreignArtistId!==payload.foreignArtistId ||
            normalize(result.data.artistName)!==normalize(payload.artistName)) {
            return {state:"unknown_outcome"};
        }
        return {state:"accepted",artistId:result.data.id};
    }catch{return {state:"unknown_outcome"};}
}
