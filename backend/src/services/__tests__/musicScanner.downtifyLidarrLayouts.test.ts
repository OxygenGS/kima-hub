/**
 * Real Kima scanner + disposable Postgres regression for optional Lidarr
 * ownership. Lidarr controls final naming, including Artist/Track or
 * Artist/Album/Track. Kima must index either path under the tagged
 * MusicBrainz artist/album instead of inventing an album from folders.
 *
 * Synthetic test files and Jest metadata only. No production mount,
 * Downtify connection, or live Lidarr import is used here.
 */
jest.mock("../../utils/logger",()=>({
    logger:{warn:jest.fn(),debug:jest.fn(),error:jest.fn(),info:jest.fn()},
}));
jest.mock("../../services/featureDetection",()=>({
    featureDetection:{getFeatures:jest.fn().mockResolvedValue({
        musicCNN:false,vibeEmbeddings:false,audiobookshelfEnabled:false,
        fpcalc:false,
    })},
}));
jest.mock("../../services/acoustidService",()=>({
    acoustidService:{lookup:jest.fn().mockResolvedValue(null)},
}));
jest.mock("../../services/fpcalc",()=>({
    fpcalcService:{isAvailable:jest.fn().mockResolvedValue(false),
        fingerprintFile:jest.fn().mockResolvedValue(null)},
}));
jest.mock("../../services/coverArtExtractor",()=>({
    CoverArtExtractor:jest.fn().mockImplementation(()=>({})),
}));
jest.mock("../../services/artwork",()=>({
    findAlbumArtwork:jest.fn().mockResolvedValue(null),
}));
jest.mock("../../services/artistCountsService",()=>({
    backfillAllArtistCounts:jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../../services/imageStorage",()=>({
    findLocalArtistImage:jest.fn().mockResolvedValue(null),
}));

import * as fs from "fs";
import * as path from "path";
import {tmpdir} from "os";
import {parseFile} from "music-metadata";
import {prisma} from "../../utils/db";
import {MusicScannerService} from "../musicScanner";

jest.setTimeout(60_000);
const ARTIST="Downtify Layout Canary Artist";
const ALBUM="Downtify Layout Canary Album";
const TITLE="Verified Test Recording";
const REL_PREFIX="Downtify Layout Canary Artist/";
let musicRoot="";

async function cleanSyntheticRows(){
    await prisma.$executeRawUnsafe(
        `DELETE FROM "Track" WHERE "filePath" LIKE $1`,
        REL_PREFIX+"%",
    );
    await prisma.album.deleteMany({where:{title:ALBUM}});
    await prisma.artist.deleteMany({where:{name:ARTIST}});
}

beforeEach(async()=>{
    await cleanSyntheticRows();
    musicRoot=fs.mkdtempSync(path.join(tmpdir(),"kima-lidarr-scanner-"));
});
afterEach(()=>{
    fs.rmSync(musicRoot,{recursive:true,force:true});
});
afterAll(async()=>{
    await cleanSyntheticRows();
    await prisma.$disconnect();
});

describe("Kima indexes Lidarr-owned Artist/Track and Artist/Album/Track",()=>{
    it.each([
        ["Artist/Track","02 - Song.flac"],
        ["Artist/Album/Track","Album/02 - Song.flac"],
    ])("registers %s under the correct library artist and album",async(_label,suffix)=>{
        const relative=path.posix.join(ARTIST,suffix);
        const full=path.join(musicRoot,relative);
        fs.mkdirSync(path.dirname(full),{recursive:true});
        fs.writeFileSync(full,"synthetic audio fixture");
        (parseFile as jest.Mock).mockReset();
        (parseFile as jest.Mock).mockResolvedValue({
            common:{
                title:TITLE,artist:ARTIST,albumartist:ARTIST,album:ALBUM,
                track:{no:2},disk:{no:1},year:2026,
            },
            format:{duration:200,codec:"flac"},
            native:{},
        });
        const result=await new MusicScannerService().scanLibrary(musicRoot);
        expect(result.tracksAdded).toBe(1);
        const track=await prisma.track.findUnique({
            where:{filePath:relative},
            include:{album:{include:{artist:true}}},
        });
        expect(track).not.toBeNull();
        expect(track?.title).toBe(TITLE);
        expect(track?.album.title).toBe(ALBUM);
        expect(track?.album.location).toBe("LIBRARY");
        expect(track?.album.artist.name).toBe(ARTIST);
        expect(track?.missingSince).toBeNull();
        expect(track?.corrupt).toBe(false);
    });
});
