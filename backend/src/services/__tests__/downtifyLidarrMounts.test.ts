import { createHash } from "crypto";
import { promises as fs } from "fs";
import * as path from "path";
import { tmpdir } from "os";
import {
    validateLidarrMountMapping, lidarrStageFilePaths,
    lidarrFileToKimaMusic, verifyPinnedLidarrBytes,
    verifySeparateLidarrLocalRoots,
} from "../downtifyLidarrMounts";
const roots={
    kimaDownloads:"/downloads",lidarrDownloads:"/data/complete",
    kimaMusic:"/music",lidarrMusic:"/library/music",
};
const rel="Singles/Downtify/Tina Turner/Song - 0123456789ABCDEFGHIJKL.flac";
describe("portable Kima-Lidarr path mapping",()=>{
    it("pins two disjoint filesystem roots, no hardcoded host layout",()=>{
        expect(validateLidarrMountMapping(roots)).toBe(true);
        expect(lidarrStageFilePaths(roots,rel)).toEqual({
            local:"/downloads/"+rel,lidarr:"/data/complete/"+rel,
        });
        expect(lidarrFileToKimaMusic(roots,
            "/library/music/Tina Turner/Private Dancer/02 - Song.flac"))
            .toBe("Tina Turner/Private Dancer/02 - Song.flac");
        expect(lidarrFileToKimaMusic(roots,
            "/library/music/Tina Turner/02 - Song.flac"))
            .toBe("Tina Turner/02 - Song.flac");
    });
    it("forbids overlap, traversal, hidden paths or direct Singles publication",()=>{
        for (const modified of [
            {...roots,kimaDownloads:"/music/downloads"},
            {...roots,lidarrDownloads:"/library/music/inbox"},
            {...roots,kimaMusic:"/"},
            {...roots,lidarrMusic:"/library/music/../other"},
            {...roots,kimaDownloads:"/downloads/"},
        ])expect(validateLidarrMountMapping(modified)).toBe(false);
        for(const r of ["../../etc/passwd","Singles/Other/Artist/Track.flac",
            "Singles/Downtify/../Track.flac","/absolute/file.flac"])
            expect(lidarrStageFilePaths(roots,r)).toBeNull();
        for(const f of [
            "/library/music/../../etc/passwd",
            "/library/music/Orphan.flac",
            "/library/music/Singles/Downtify/Tina/Track.flac",
            "/library/music/Tina Turner/.hidden/file.flac",
            "/library/music/Tina Turner/Private Dancer/../../file.flac",
            "/downloads/Tina Turner/Private Dancer/Track.flac",
        ])expect(lidarrFileToKimaMusic(roots,f)).toBeNull();
    });
});
describe("actual Kima staging/music root identity",()=>{
    let root:string;
    beforeEach(async()=>{
        root=await fs.mkdtemp(path.join(tmpdir(),"kima-lidarr-roots-"));
        await fs.mkdir(path.join(root,"music"));
        await fs.mkdir(path.join(root,"downloads"));
    });
    afterEach(async()=>await fs.rm(root,{recursive:true,force:true}));
    const mapping=(music:string,downloads:string)=>({
        kimaDownloads:downloads,lidarrDownloads:"/lidarr-downloads",
        kimaMusic:music,lidarrMusic:"/lidarr-music",
    });
    it("permits separate folders on the same real filesystem",async()=>{
        expect(await verifySeparateLidarrLocalRoots(mapping(
            path.join(root,"music"),path.join(root,"downloads"),
        ))).toBe(true);
    });
    it("rejects two Docker paths that resolve to the same directory",async()=>{
        const downloads=path.join(root,"downloads");
        const alias=path.join(root,"aliased-music");
        await fs.symlink(downloads,alias,"dir");
        // Lexical paths look disjoint, but the alias is unsafe.
        expect(validateLidarrMountMapping(mapping(alias,downloads))).toBe(true);
        expect(await verifySeparateLidarrLocalRoots(mapping(alias,downloads))).toBe(false);
        expect(await verifySeparateLidarrLocalRoots(mapping(
            path.join(root,"missing"),downloads,
        ))).toBe(false);
    });
});

describe("immutable read-only staged/final bytes",()=>{
    let root:string,inner:string,file:string;
    beforeEach(async()=>{
        root=await fs.mkdtemp(path.join(tmpdir(),"kima-lidarr-hash-"));
        inner=path.join(root,"Tina Turner","Private Dancer");
        await fs.mkdir(inner,{recursive:true});
        file=path.join(inner,"02 - Song.flac");
        await fs.writeFile(file,Buffer.alloc(1024,42));
        // Lidarr's own group can write its album directory, but Kima only
        // opens already-registered tracks read-only.
        await fs.chmod(inner,0o775);
    });
    afterEach(async()=>await fs.rm(root,{recursive:true,force:true}));
    it("reads every byte under a stable non-symlink inode and matches SHA-256",async()=>{
        const digest=createHash("sha256").update(Buffer.alloc(1024,42)).digest("hex");
        expect(await verifyPinnedLidarrBytes(file,root,1024,digest)).toBe(true);
        expect(await verifyPinnedLidarrBytes(file,root,1025,digest)).toBe(false);
        expect(await verifyPinnedLidarrBytes(file,root,1024,"a".repeat(64))).toBe(false);
    });
    it("refuses a substituted symlink, mismatched root or invalid hash",async()=>{
        const digest=createHash("sha256").update(Buffer.alloc(1024,42)).digest("hex");
        const symlink=path.join(inner,"linked.flac");
        await fs.symlink(file,symlink);
        expect(await verifyPinnedLidarrBytes(symlink,root,1024,digest)).toBe(false);
        expect(await verifyPinnedLidarrBytes(file,"/elsewhere",1024,digest)).toBe(false);
        expect(await verifyPinnedLidarrBytes(file,root,1024,"wrong")).toBe(false);
    });
});
