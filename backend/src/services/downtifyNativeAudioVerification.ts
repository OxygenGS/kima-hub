/**
 * Private, complete-recording prepublication verification.
 *
 * Called ONLY on a unique 0600 temporary file made by the native publisher.
 * The file must not be exposed to the Kima music scanner before success.
 * A matching tag is not cryptographic proof of a recording edition;
 * missing/conflicting tags require review rather than an automatic import.
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

type AudioMetadata = { isrc: unknown; durationSeconds: unknown };
export interface ExpectedNativeRecording {
    /** Immutable Spotify ID from an owner-verified remote queue job. */
    spotifyId: string;
    expectedSpotifyId: string;
    isrc: string | null;
    durationMs: number;
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
        if (metadata.state !== "metadata_consistent_untrusted") {
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
