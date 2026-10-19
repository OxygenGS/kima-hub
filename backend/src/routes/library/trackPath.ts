// Shared helper for resolving a Track's stored filePath against the music
// root, guarding against path traversal (e.g. filePath containing "../../").
import path from "path";
import fs from "fs";
import { config } from "../../config";

/**
 * Join path segments under the music directory, or null if the result escapes
 * it or is the root itself. Use it for every path built from database values,
 * above all before deleting: artist and album names come from file tags, and a
 * tag like "../../tmp/x" would otherwise reach `fs.rmSync`.
 */
export function resolveWithinMusicRoot(...segments: string[]): string | null {
  // Backslashes are normalised because a Windows-scanned library stores them,
  // and `path.resolve` on posix would treat "..\\.." as one odd filename
  // rather than as traversal.
  const normalized = segments.map((s) => s.replace(/\\/g, "/"));
  const resolvedMusicPath = path.resolve(config.music.musicPath);
  const absolutePath = path.resolve(resolvedMusicPath, ...normalized);

  if (!absolutePath.startsWith(resolvedMusicPath + path.sep)) {
    return null;
  }

  return absolutePath;
}


/**
 * Resolve a stored track path to an existing, readable *physical* file inside
 * the configured music root. Lexical containment alone does not stop a
 * symlink placed under the root from pointing at a private host file.
 *
 * This is a read/stream guard; destructive file operations need their own
 * write-safe validation. A legitimate symlink for the configured root or
 * for a track pointing back into the root is allowed.
 */
export async function resolveExistingMusicFile(filePath: string): Promise<string | null> {
  const candidate = resolveWithinMusicRoot(filePath);
  if (!candidate) return null;
  try {
    const [root, actual] = await Promise.all([
      fs.promises.realpath(config.music.musicPath),
      fs.promises.realpath(candidate),
    ]);
    if (!actual.startsWith(root + path.sep)) return null;
    const stats = await fs.promises.stat(actual);
    return stats.isFile() ? actual : null;
  } catch {
    // Missing file, broken symlink, unreadable directory or music root.
    return null;
  }
}
