/**
 * Private destination planning for the future first-party Downtify importer.
 *
 * No remote filename or browser-provided path is ever used for a destination.
 * One approved, isolated directory beneath Kima's normal /music root is
 * created on demand; no source media is moved, deleted or renamed.
 */
import { promises as fs } from "fs";
import * as path from "path";
import { safeNativeImportTarget } from "./downtifyAtomicPublisher";

const AUDIO_EXT = new Set([".flac", ".mp3", ".m4a", ".ogg", ".opus", ".wav"]);
const SPOTIFY = /^[A-Za-z0-9]{22}$/;

function cleanComponent(raw: unknown, max = 80): string {
    if (typeof raw !== "string") return "";
    return raw.normalize("NFKC")
        .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "_")
        .replace(/\.{2,}/g, "_")
        .replace(/\s+/g, " ").replace(/^[.\s]+|[.\s]+$/g, "")
        .slice(0, max).replace(/[.\s]+$/g, "");
}
export function nativeImportDestination(
    artist: unknown, title: unknown, spotifyId: unknown, extension: unknown,
): string | null {
    if (typeof spotifyId !== "string" || !SPOTIFY.test(spotifyId) ||
        typeof extension !== "string" || !AUDIO_EXT.has(extension)) return null;
    const safeArtist = cleanComponent(artist) || "Unknown Artist";
    const safeTitle = cleanComponent(title, 100) || "Unknown Track";
    const rel = ["Singles", "Downtify", safeArtist,
        safeTitle + " - " + spotifyId + extension].join("/");
    return safeNativeImportTarget(rel) ? rel : null;
}

export type DestinationReadiness =
    | { state: "ready"; relativeTarget: string }
    | { state: "unsafe_destination" | "storage_unavailable" };

/** Create only the dedicated trusted target tree, never other music folders.
 * Parent ownership and dev are re-validated after each mkdir; symlinked or
 * world/group-writable directories are forbidden to avoid path replacement.
 */
export async function ensureNativeImportDestination(
    musicRoot: string, relativeTarget: string,
): Promise<DestinationReadiness> {
    if (!path.isAbsolute(musicRoot) || musicRoot === "/" ||
        path.resolve(musicRoot) !== musicRoot ||
        !safeNativeImportTarget(relativeTarget)) {
        return { state: "unsafe_destination" };
    }
    const parts = relativeTarget.split("/");
    if (parts.length !== 4 || parts[0] !== "Singles" ||
        parts[1] !== "Downtify") return { state: "unsafe_destination" };

    try {
        const rootStat = await fs.lstat(musicRoot);
        if (!rootStat.isDirectory() || rootStat.isSymbolicLink() ||
            (rootStat.mode & 0o022) !== 0 ||
            await fs.realpath(musicRoot) !== musicRoot) {
            return { state: "unsafe_destination" };
        }
        let current = musicRoot;
        for (const folder of parts.slice(0, -1)) {
            current = path.join(current, folder);
            try {
                await fs.mkdir(current, { mode: 0o755 });
            } catch (err: unknown) {
                if ((err as NodeJS.ErrnoException)?.code !== "EEXIST") {
                    return { state: "storage_unavailable" };
                }
            }
            const stat = await fs.lstat(current);
            if (!stat.isDirectory() || stat.isSymbolicLink() ||
                stat.dev !== rootStat.dev ||
                (stat.mode & 0o022) !== 0 ||
                await fs.realpath(current) !== current) {
                return { state: "unsafe_destination" };
            }
        }
        return { state: "ready", relativeTarget };
    } catch {
        return { state: "storage_unavailable" };
    }
}
