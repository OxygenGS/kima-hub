import * as fs from "fs";
import { logger } from "../utils/logger";
import * as path from "path";
import crypto from "crypto";
import { parseFile } from "music-metadata";

const ALBUM_IMAGE_BASENAMES = ["cover", "folder", "front", "album"] as const;
const ALBUM_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"] as const;
const MAX_LOCAL_IMAGE_BYTES = 20 * 1024 * 1024;

/** Try a nearby album image only after embedded art is absent. */
async function recoverAlbumFolderCover(
    audioFilePath: string,
    cachePath: string,
): Promise<boolean> {
    let entries: fs.Dirent[];
    try {
        entries = await fs.promises.readdir(path.dirname(audioFilePath), { withFileTypes: true });
    } catch {
        return false;
    }

    const candidates = entries
        .filter((entry) => {
            if (!entry.isFile()) return false; // Reject symlinks, including file symlinks.
            const parsed = path.parse(entry.name);
            return ALBUM_IMAGE_BASENAMES.some((name) => name === parsed.name.toLowerCase())
                && ALBUM_IMAGE_EXTENSIONS.some((ext) => ext === parsed.ext.toLowerCase());
        })
        .sort((a, b) => {
            const rank = (name: string) => {
                const parsed = path.parse(name);
                const stem = ALBUM_IMAGE_BASENAMES.indexOf(parsed.name.toLowerCase() as typeof ALBUM_IMAGE_BASENAMES[number]);
                const ext = ALBUM_IMAGE_EXTENSIONS.indexOf(parsed.ext.toLowerCase() as typeof ALBUM_IMAGE_EXTENSIONS[number]);
                return stem * ALBUM_IMAGE_EXTENSIONS.length + ext;
            };
            return rank(a.name) - rank(b.name);
        });

    for (const entry of candidates) {
        const candidate = path.join(path.dirname(audioFilePath), entry.name);
        let temp: string | null = null;
        try {
            const stat = await fs.promises.lstat(candidate);
            if (!stat.isFile() || stat.isSymbolicLink()) continue;
            if (stat.size < 1000 || stat.size > MAX_LOCAL_IMAGE_BYTES) continue;

            // Normalize PNG/WebP/JPEG into real JPEG bytes: /cover-art serves
            // native files as image/jpeg. No relabelling of non-JPEG data.
            const sharp = (await import("sharp")).default;
            temp = `${cachePath}.part-${crypto.randomUUID()}.jpg`;
            await sharp(candidate, { limitInputPixels: 40_000_000 })
                .rotate()
                .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
                .jpeg({ quality: 88, progressive: true })
                .toFile(temp);
            await fs.promises.rename(temp, cachePath);
            logger.debug(`[COVER-ART] Recovered adjacent album cover: ${entry.name}`);
            return true;
        } catch (error) {
            logger.debug(
                `[COVER-ART] Skipping invalid adjacent cover ${entry.name}: ${error instanceof Error ? error.message : String(error)}`,
            );
        } finally {
            if (temp) {
                await fs.promises.unlink(temp).catch(() => undefined);
            }
        }
    }
    return false;
}

export class CoverArtExtractor {
    private coverCachePath: string;

    constructor(coverCachePath: string) {
        this.coverCachePath = coverCachePath;
        if (!fs.existsSync(this.coverCachePath)) {
            fs.mkdirSync(this.coverCachePath, { recursive: true });
        }
    }

    /**
     * Embedded cover -> sibling cover/folder/front/album.{jpg,jpeg,png,webp}.
     * Caches actual JPEG bytes under the existing native URL path.
     * Returns null when no trustworthy local cover exists; the scanner then
     * continues through Deezer, Cover Art Archive and Fanart.tv.
     */
    async extractCoverArt(
        audioFilePath: string,
        albumId: string,
    ): Promise<string | null> {
        // Album ids come from the database, but never let an unexpected id
        // become a write path outside the album artwork cache.
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(albumId)) return null;
        const cacheFileName = `${albumId}.jpg`;
        const cachePath = path.join(this.coverCachePath, cacheFileName);

        if (fs.existsSync(cachePath)) return cacheFileName;

        try {
            const metadata = await parseFile(audioFilePath);
            const picture = metadata.common.picture?.[0];
            if (picture) {
                await fs.promises.writeFile(cachePath, picture.data);
                logger.debug(`[COVER-ART] Extracted embedded album art for ${albumId}`);
                return cacheFileName;
            }
        } catch (error) {
            // A corrupt/unsupported audio tag must not hide a valid cover.jpg
            // beside the audio file.
            logger.debug(
                `[COVER-ART] Cannot read embedded art for ${albumId}: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        return (await recoverAlbumFolderCover(audioFilePath, cachePath))
            ? cacheFileName
            : null;
    }
}
