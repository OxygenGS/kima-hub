/**
 * Private, complete-recording prepublication verification.
 *
 * Called ONLY on a unique 0600 temporary file made by the native publisher.
 * The file must not be exposed to the Kima music scanner before success.
 * A matching tag is not cryptographic proof of a recording edition;
 * conflicting tags require review rather than an automatic import.
 * Standard Downtify files may lack ISRC: an absent tag can only be
 * accepted with exact independently fetched Spotify title/artist/duration
 * corroboration and the caller's verified remote owner/song/file mapping.
 *
 * The optional native worker invokes this on a private temporary file
 * before publication. No HTTP route exposes verification or lets users
 * supply filesystem paths. Existing music is not re-tagged or modified.
 */
import { createHash } from "crypto";
import { constants as flags, promises as fs } from "fs";
import * as path from "path";
import { decodeWithFfmpeg } from "./downtifyFullAudioEvidence";
import {
    audioHeaderMatchesExtension,
    detectAudioContainer,
} from "./downtifyAudioHeaderEvidence";
import { compareRecordingTags } from "./downtifyRecordingTagsEvidence";

export type NativeAudioVerificationState =
    | "verified" | "invalid_expected" | "unavailable"
    | "file_changed" | "hash_mismatch" | "header_mismatch"
    | "metadata_unavailable" | "recording_needs_review"
    | "decode_failed";

export interface NativeAudioVerification {
    state: NativeAudioVerificationState;
    verifiedForPublication: boolean;
    /** Playback/index receipt still MUST be checked separately. */
    libraryImportVerified: false;
    filesChanged: false;
}

type AudioMetadata = {
    isrc: unknown; durationSeconds: unknown;
    title?: unknown; artist?: unknown; artists?: unknown;
    album?: unknown;
};
export interface ExpectedNativeRecording {
    /** Immutable Spotify ID from an owner-verified remote queue job. */
    spotifyId: string;
    expectedSpotifyId: string;
    isrc: string | null;
    durationMs: number;
    /** Independent Spotify identity; used only when the audio has NO ISRC. */
    title: string;
    artist: string;
    /**
     * Lidarr-mode only: the owner-bound Downtify album must also exist in
     * the actual audio metadata. Kima-only imports do not require an album.
     * This proves tag agreement, NOT a MusicBrainz release or edition.
     */
    album?: string;
    /** From the known remote filename; do not trust media extension alone. */
    extension: string;
}
interface Dependencies {
    parse: (file: string) => Promise<AudioMetadata>;
    decode: (chunks: AsyncIterable<Buffer>) => Promise<boolean>;
}
const defaults: Dependencies = {
    parse: async (file) => {
        const { parseFile } = await import("music-metadata");
        const meta = await parseFile(file, {
            duration: true, skipCovers: true,
        });
        return {
            isrc: meta.common.isrc ?? null,
            durationSeconds: meta.format.duration ?? null,
            title: meta.common.title ?? null,
            artist: meta.common.artist ?? null,
            artists: meta.common.artists ?? null,
            album: meta.common.album ?? null,
        };
    },
    decode: decodeWithFfmpeg,
};

const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const SHA_256 = /^[0-9a-f]{64}$/;
const ALLOWED = new Set([".flac", ".mp3", ".m4a", ".ogg", ".opus", ".wav"]);
const MAX_BYTES = 256 * 1024 * 1024;
const CHUNK_BYTES = 128 * 1024;

function result(state: NativeAudioVerificationState): NativeAudioVerification {
    return {
        state, verifiedForPublication: state === "verified",
        libraryImportVerified: false, filesChanged: false,
    };
}

/** Only a genuinely ABSENT embedded ISRC may use standard-tag fallback.
 * Any supplied but malformed, contradictory or mismatched ISRC fails closed.
 */
function hasNoEmbeddedIsrc(value: unknown): boolean {
    const tags = Array.isArray(value) ? value : [value];
    return tags.length <= 16 && tags.every(tag =>
        tag === null || tag === undefined ||
        (typeof tag === "string" && tag.trim().length === 0)
    );
}

function comparableText(value: unknown): string | null {
    if (typeof value !== "string" || !value.trim() || value.length > 500) return null;
    return value.normalize("NFKC").toLocaleLowerCase("en")
        .replace(/\s+/gu, " ").trim();
}

/** Exact title and one complete credited artist, plus Spotify duration.
 * This is NOT acoustic recognition or proof of a particular recording edition.
 * Caller must separately pin Downtify owner, job, filename and Spotify ID.
 */
function standardDowntifyTagsMatch(
    expected: ExpectedNativeRecording, embedded: AudioMetadata,
): boolean {
    const title = comparableText(expected.title);
    const artist = comparableText(expected.artist);
    if (!title || !artist || comparableText(embedded.title) !== title) return false;
    const artists: unknown[] = Array.isArray(embedded.artists)
        ? embedded.artists : [];
    const credited: unknown[] = [embedded.artist, ...artists];
    if (credited.length > 32) return false;
    // Stock Downtify MP3 writes TPE1 as "Artist A; Artist B".
    // Accept exactly one complete semicolon-delimited credit, NEVER
    // substring/prefix matches or a comma split (band names contain commas).
    const completeCredits = credited.flatMap(value =>
        typeof value === "string" ? [value, ...value.split(";")] : [],
    );
    if (completeCredits.length > 64 ||
        !completeCredits.some(candidate => comparableText(candidate) === artist)) {
        return false;
    }
    return typeof embedded.durationSeconds === "number" &&
        Number.isFinite(embedded.durationSeconds) &&
        embedded.durationSeconds > 0 &&
        embedded.durationSeconds <= 24 * 60 * 60 &&
        Math.abs(embedded.durationSeconds * 1000 - expected.durationMs) <= 4000;
}

type OpenAudio = Awaited<ReturnType<typeof fs.open>>;
async function* fileChunks(
    handle: OpenAudio, size: number,
): AsyncGenerator<Buffer> {
    let offset = 0;
    while (offset < size) {
        const buffer = Buffer.allocUnsafe(Math.min(CHUNK_BYTES, size - offset));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
        if (bytesRead <= 0 || bytesRead > buffer.length) {
            throw Error("truncated local audio");
        }
        yield buffer.subarray(0, bytesRead);
        offset += bytesRead;
    }
}

/**
 * Validate exact whole-file SHA-256, safe audio container, embedded Spotify
 * ISRC + duration metadata, and complete FFmpeg decode without altering
 * the file or exposing a path in the result. A future importer MUST additionally
 * recheck pairing, publication result and actual scanner/track receipt.
 */
export async function verifyNativeTemporaryRecording(
    tempFile: string,
    expected: ExpectedNativeRecording,
    source: { bytes: number; sha256: string },
    deps: Dependencies = defaults,
): Promise<NativeAudioVerification> {
    if (!tempFile || !path.isAbsolute(tempFile) ||
        !SPOTIFY_ID.test(expected.spotifyId) ||
        expected.spotifyId !== expected.expectedSpotifyId ||
        !Number.isSafeInteger(expected.durationMs) ||
        expected.durationMs < 1000 || expected.durationMs > 24 * 60 * 60 * 1000 ||
        !ALLOWED.has(expected.extension) ||
        !Number.isSafeInteger(source.bytes) ||
        source.bytes < 64 || source.bytes > MAX_BYTES ||
        !SHA_256.test(source.sha256)) {
        return result("invalid_expected");
    }

    let file: OpenAudio | undefined;
    try {
        file = await fs.open(tempFile, flags.O_RDONLY | flags.O_NOFOLLOW);
        const before = await file.stat();
        if (!before.isFile() || before.size !== source.bytes ||
            (before.mode & 0o077) !== 0) return result("file_changed");

        // Header check uses an open O_NOFOLLOW inode; remote filename tags
        // cannot spoof a FLAC/MP3/WAV file without the expected signature.
        const header = Buffer.alloc(64);
        const sample = await file.read(header, 0, header.length, 0);
        const bytes = header.subarray(0, sample.bytesRead);
        const kind = detectAudioContainer(bytes);
        if (kind === "unknown" ||
            !audioHeaderMatchesExtension(expected.extension, kind, bytes)) {
            return result("header_mismatch");
        }

        // The SHA is computed from the local inode and must equal the hash
        // recorded while writing the private temporary file.
        const hash = createHash("sha256");
        for await (const chunk of fileChunks(file, before.size)) hash.update(chunk);
        if (hash.digest("hex") !== source.sha256) return result("hash_mismatch");

        let parsed: AudioMetadata;
        try { parsed = await deps.parse(tempFile); }
        catch { return result("metadata_unavailable"); }
        // In Lidarr mode the album used for MusicBrainz matching must be
        // corroborated by the decoded file's own album tag. Never invent
        // an album or rely solely on the remote library's metadata.
        if (expected.album !== undefined &&
            (!comparableText(expected.album) ||
             comparableText(parsed.album) !== comparableText(expected.album))) {
            return result("recording_needs_review");
        }
        const metadata = compareRecordingTags(
            {
                spotifyId: expected.spotifyId,
                isrc: expected.isrc,
                durationMs: expected.durationMs,
            },
            {
                isrc: parsed.isrc,
                durationSeconds: parsed.durationSeconds,
            },
        );
        if (metadata.state !== "metadata_consistent_untrusted" &&
            !(hasNoEmbeddedIsrc(parsed.isrc) &&
                standardDowntifyTagsMatch(expected, parsed))) {
            // Conflicting ISRC, incorrect Spotify tags or duration, missing
            // title/artist, and untrusted audio are NEVER silently accepted.
            return result("recording_needs_review");
        }

        const decoded = await deps.decode(fileChunks(file, before.size));
        if (!decoded) return result("decode_failed");
        const after = await file.stat();
        if (!after.isFile() || before.dev !== after.dev || before.ino !== after.ino ||
            before.size !== after.size || before.mtimeMs !== after.mtimeMs ||
            before.ctimeMs !== after.ctimeMs) {
            return result("file_changed");
        }
        return result("verified");
    } catch {
        return result("unavailable");
    } finally {
        if (file) await file.close().catch(() => undefined);
    }
}
