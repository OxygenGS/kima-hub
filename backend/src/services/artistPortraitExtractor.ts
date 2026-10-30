/**
 * Recover an explicitly named artist portrait from folders surrounding a track.
 * Never mistake an album's folder.jpg for an artist photo. A folder image is
 * accepted only when the directory name matches the artist's name.
 *
 * Files are read using O_NOFOLLOW, checked, normalized to real JPEG data and
 * committed to an isolated cache path using an atomic rename.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";
import { logger } from "../utils/logger";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"] as const;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MIN_IMAGE_BYTES = 1000;

function normalized(value: string): string {
    return value.normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/gi, "")
        .toLowerCase();
}

/**
 * File path must already refer to an existing music track; this helper still
 * enforces physical containment to defend other future callers.
 */
export async function recoverLocalArtistPortrait(
    audioFilePath: string,
    artistName: string,
    artistId: string,
    musicRootPath: string,
    coversBasePath: string,
): Promise<string | null> {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(artistId)) return null;
    const [root, audioPath] = await Promise.all([
        fs.promises.realpath(musicRootPath).catch(() => null),
        fs.promises.realpath(audioFilePath).catch(() => null),
    ]);
    if (!root || !audioPath || !audioPath.startsWith(root + path.sep)) return null;
    const fileStat = await fs.promises.stat(audioPath).catch(() => null);
    if (!fileStat?.isFile()) return null;

    // Walk from the most specific to the most general directory, but inspect
    // named artist.* images in the higher-level artist folder first.
    const directories: string[] = [];
    let currentDir = path.dirname(audioPath);
    while (currentDir.startsWith(root + path.sep)) {
        directories.unshift(currentDir);
        currentDir = path.dirname(currentDir);
    }

    const nativePath = "artists/" + artistId + "-recovered.jpg";
    const targetDir = path.join(coversBasePath, "artists");
    const target = path.join(targetDir, artistId + "-recovered.jpg");
    try {
        const existing = await sharp(target).metadata();
        if (existing.format === "jpeg" && existing.width && existing.height) {
            return "native:" + nativePath;
        }
    } catch {
        // Missing, unreadable or corrupt prior recovery output.
    }

    for (const directory of directories) {
        let entries: fs.Dirent[];
        try {
            entries = await fs.promises.readdir(directory, { withFileTypes: true });
        } catch {
            continue;
        }

        // folder.jpg is often an album cover. Only treat it as an artist
        // portrait in a directory explicitly named after this artist.
        const names = ["artist"];
        if (normalized(path.basename(directory)) === normalized(artistName) && normalized(artistName)) {
            names.push("folder");
        }

        for (const name of names) {
            for (const ext of IMAGE_EXTENSIONS) {
                const entry = entries.find((item) =>
                    item.isFile() && item.name.toLowerCase() === name + ext
                );
                if (!entry) continue;

                const candidate = path.join(directory, entry.name);
                let handle: fs.promises.FileHandle | null = null;
                let temp: string | null = null;
                try {
                    handle = await fs.promises.open(
                        candidate,
                        fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0),
                    );
                    const stat = await handle.stat();
                    if (!stat.isFile() || stat.size < MIN_IMAGE_BYTES || stat.size > MAX_IMAGE_BYTES) continue;
                    const bytes = await handle.readFile();
                    if (bytes.length > MAX_IMAGE_BYTES) continue;
                    await fs.promises.mkdir(targetDir, { recursive: true });
                    temp = target + ".part-" + crypto.randomUUID();
                    await sharp(bytes, { limitInputPixels: 40_000_000 })
                        .rotate()
                        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
                        .jpeg({ quality: 88, progressive: true })
                        .toFile(temp);
                    await fs.promises.rename(temp, target);
                    logger.debug("[ArtistPortrait] Recovered local artist portrait for " + artistId);
                    return "native:" + nativePath;
                } catch (error) {
                    logger.debug(
                        "[ArtistPortrait] Skipped invalid portrait for " + artistId + ": " +
                        (error instanceof Error ? error.message : String(error))
                    );
                } finally {
                    await handle?.close().catch(() => undefined);
                    if (temp) await fs.promises.unlink(temp).catch(() => undefined);
                }
            }
        }
    }
    return null;
}
