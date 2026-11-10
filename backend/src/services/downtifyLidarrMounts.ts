/**
 * Portable, shared-volume Lidarr handoff path policy. Absolute paths are
 * administrator-configured and pinned before import, NEVER supplied by a
 * remote download, arbitrary HTTP request or HTML client state.
 *
 * Kima writes to its isolated completed-download staging filesystem.
 * Lidarr alone is permitted to arrange the final music-root layout.
 */
import * as path from "path";
import { createHash } from "crypto";
import { constants, promises as fs } from "fs";
import { safeNativeImportTarget } from "./downtifyAtomicPublisher";
/**
 * Lidarr owns its final tree and may have a writable owner/group there.
 * Kima never writes to this tree: refuse symlinks and world-writable
 * ancestors while allowing an owner-managed, group-writable album folder.
 */
export function trustedLidarrReadDirectory(st: {
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
    mode: number;
}): boolean {
    return st.isDirectory() && !st.isSymbolicLink() &&
        (st.mode & 0o002) === 0;
}

const SHA = /^[a-f0-9]{64}$/;
const MAX_AUDIO = 256 * 1024 * 1024;
const EXTS = new Set([".mp3", ".flac", ".m4a", ".ogg", ".opus", ".wav"]);

export type LidarrMountMapping = {
    kimaDownloads: string;
    lidarrDownloads: string;
    kimaMusic: string;
    lidarrMusic: string;
};
const isAbsoluteClean = (value: unknown): value is string =>
    typeof value === "string" && value.length > 1 && value.length <= 1024 &&
    path.posix.isAbsolute(value) && !value.includes("\\") &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    path.posix.normalize(value) === value &&
    value !== "/" && !value.endsWith("/") &&
    value.split("/").slice(1).every(p=>!!p && p!=="." && p!=="..");

const nested = (left: string, right: string) =>
    left === right || left.startsWith(right + "/") || right.startsWith(left + "/");

/** Reject overlapping stage/library roots (even when their names differ). */
export function validateLidarrMountMapping(input: LidarrMountMapping): boolean {
    return isAbsoluteClean(input.kimaDownloads) &&
        isAbsoluteClean(input.lidarrDownloads) &&
        isAbsoluteClean(input.kimaMusic) &&
        isAbsoluteClean(input.lidarrMusic) &&
        !nested(input.kimaDownloads,input.kimaMusic) &&
        !nested(input.lidarrDownloads,input.lidarrMusic);
}

function safeRemoteRelative(relative: string): boolean {
    return !!safeNativeImportTarget(relative) &&
        relative.split("/").length === 4 &&
        relative.startsWith("Singles/Downtify/");
}

/** Same exact bytes/path in Kima and Lidarr, under separately pinned roots. */
export function lidarrStageFilePaths(
    roots: LidarrMountMapping, relative: string,
): { local: string; lidarr: string } | null {
    if (!validateLidarrMountMapping(roots) || !safeRemoteRelative(relative)) return null;
    return {
        local: path.posix.join(roots.kimaDownloads, relative),
        lidarr: path.posix.join(roots.lidarrDownloads, relative),
    };
}

/**
 * Map a Lidarr-selected managed file to Kima's existing library root.
 * Lidarr must ALREADY have registered this exact path; Kima cannot choose it.
 * Refuse the old private importer tree and any path outside the pinned root.
 */
export function lidarrFileToKimaMusic(
    roots: LidarrMountMapping, lidarrFinal: unknown,
): string | null {
    if (!validateLidarrMountMapping(roots) ||
        !isAbsoluteClean(lidarrFinal) ||
        !lidarrFinal.startsWith(roots.lidarrMusic + "/")) return null;
    const relative = lidarrFinal.slice(roots.lidarrMusic.length+1);
    const parts = relative.split("/");
    if (parts.length < 3 || parts.length > 8 ||
        parts[0] === "Singles" || parts.some(p=>!p ||
            p==="." || p===".." || p.startsWith(".") || p.length>180 ||
            /[<>:"\\|?*\u0000-\u001f\u007f]/.test(p)) ||
        !EXTS.has(path.posix.extname(relative).toLowerCase())) return null;
    return relative;
}

/**
 * Hash one pre-existing regular inode without following symbolic links
 * anywhere in its ancestry. This is read-only and checks inode/mtime/
 * ctime/size again after reading the entire file.
 */
export async function verifyPinnedLidarrBytes(
    absolute: string, root: string, bytes: number, sha256: string,
): Promise<boolean> {
    if (!isAbsoluteClean(root) || !isAbsoluteClean(absolute) ||
        !absolute.startsWith(root + "/") ||
        !Number.isSafeInteger(bytes) || bytes<64 || bytes>MAX_AUDIO ||
        !SHA.test(sha256)) return false;
    const relative=absolute.slice(root.length+1);
    const parts=relative.split("/");
    if(parts.length<2 || parts.length>12 ||
        parts.some(p=>!p || p==="." || p===".." || p.length>180))return false;
    let file:Awaited<ReturnType<typeof fs.open>>|undefined;
    try {
        const rootStat=await fs.lstat(root);
        if (!trustedLidarrReadDirectory(rootStat) ||
            await fs.realpath(root)!==root) return false;
        let cursor=root;
        const ancestry: {dir:string; dev:number; ino:number}[] = [
            {dir:root, dev:rootStat.dev, ino:rootStat.ino},
        ];
        for(const dir of parts.slice(0,-1)){
            cursor=path.join(cursor,dir);
            const st=await fs.lstat(cursor);
            if(!trustedLidarrReadDirectory(st) ||
                st.dev!==rootStat.dev ||
                await fs.realpath(cursor)!==cursor) return false;
            ancestry.push({dir:cursor,dev:st.dev,ino:st.ino});
        }
        file=await fs.open(absolute,constants.O_RDONLY|constants.O_NOFOLLOW);
        const before=await file.stat();
        if(!before.isFile() || before.dev!==rootStat.dev ||
            before.size!==bytes) return false;
        const digest=createHash("sha256");
        let offset=0;
        while(offset<bytes){
            const block=Buffer.allocUnsafe(Math.min(128*1024,bytes-offset));
            const read=await file.read(block,0,block.length,offset);
            if(read.bytesRead<1) return false;
            digest.update(block.subarray(0,read.bytesRead));
            offset+=read.bytesRead;
        }
        const after=await file.stat();
        if (before.dev!==after.dev || before.ino!==after.ino ||
            before.size!==after.size || before.mtimeMs!==after.mtimeMs ||
            before.ctimeMs!==after.ctimeMs || digest.digest("hex")!==sha256) {
            return false;
        }
        // Check for substituted parent directories after the hash.
        for(const ancestor of ancestry){
            const st=await fs.lstat(ancestor.dir);
            if(!trustedLidarrReadDirectory(st) ||
                st.dev!==ancestor.dev || st.ino!==ancestor.ino ||
                await fs.realpath(ancestor.dir)!==ancestor.dir) return false;
        }
        return true;
    } catch {return false;}
    finally{if(file) await file.close().catch(()=>undefined);}
}
