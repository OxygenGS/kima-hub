import path from "path";

/** Only this leaf is writable by the AIO backend; the rest of /music stays unchanged. */
export const SOULSEEK_IMPORT_SEGMENTS = ["Singles", "Kima Downloads"] as const;

function safePart(value: string, fallback: string): string {
    // Filenames may come from untrusted P2P peers or user-supplied metadata.
    // Replace separators, controls, traversal, Windows-forbidden punctuation,
    // trailing dots/spaces and empty names instead of allowing path escapes.
    const original = String(value || "").normalize("NFKC").trim();
    if (!original || /^\\.+$/.test(original)) return fallback;
    const cleaned = original
        .replace(/[<>:"/\\|?*\x00-\x1F\x7F]/g, "_")
        .replace(/\.\./g, "_")
        .replace(/^\.+/, "")
        .replace(/[.\s]+$/, "")
        .trim()
        .slice(0, 180);
    return cleaned === "" || cleaned === "." || cleaned === ".." ? fallback : cleaned;
}

export function soulseekDownloadDestination(
    musicPath: string,
    artistName: string,
    albumName: string,
    fileName: string,
): string {
    const base = path.resolve(musicPath, ...SOULSEEK_IMPORT_SEGMENTS);
    const dest = path.resolve(
        base,
        safePart(artistName, "Unknown Artist"),
        safePart(albumName, "Unknown Album"),
        safePart(fileName, "track.mp3"),
    );
    if (!dest.startsWith(base + path.sep)) {
        throw new Error("Invalid Soulseek destination");
    }
    return dest;
}
