/**
 * D7 — bounded, fully read, owner-scoped staging audio verification.
 *
 * Strictly user-initiated and OFF by default. Repeats the D3-D5 ownership,
 * path and root checks before opening one inode O_RDONLY | O_NOFOLLOW.
 * The file is hashed while its complete bytes are piped to a sandboxed
 * FFmpeg decode-to-null process. Nothing is written to the media filesystem.
 *
 * A successful decode + SHA-256 calculation does NOT authenticate the
 * Spotify recording, establish a checksum baseline, prove mount durability
 * or indicate that anything was imported into Kima.
 */
import { spawn } from "child_process";
import { createHash } from "crypto";
import { constants as flags, promises as fs } from "fs";
import * as path from "path";
import { config } from "../config";
import {
    audioHeaderMatchesExtension, detectAudioContainer, getAudioHeaderCapability,
    type AudioContainer,
} from "./downtifyAudioHeaderEvidence";
import {
    inspectDowntifySourceFile, type ObserveValidatedStagingCandidate,
    type SourceFileEvidence,
} from "./downtifySourceFileEvidence";

export type FullAudioState =
    | "disabled" | "unbound" | "misconfigured" | "not_found"
    | "busy" | "source_unverified" | "file_changed" | "file_unreadable"
    | "file_too_large" | "header_unverified" | "read_incomplete"
    | "decode_failed" | "stream_decoded_unmatched";

export interface FullAudioEvidence {
    state: FullAudioState;
    container: AudioContainer;
    fullFileSha256Calculated: boolean;
    audioDecoded: boolean;
    /** No reference digest exists to compare against. */
    wholeFileIntegrityVerified: false;
    recordingVerified: false;
    stableMountVerified: false;
    libraryImportVerified: false;
    filesChanged: false;
    retryAllowed: false;
}

type FileIdentity = {
    dev: number;
    ino: number;
    size: number;
    mtimeMs: number;
    ctimeMs: number;
    isFile: () => boolean;
};
type ReadOnlyFile = {
    stat: () => Promise<FileIdentity>;
    read: (buffer: Buffer, offset: number, length: number, position: number) =>
        Promise<{ bytesRead: number }>;
    close: () => Promise<void>;
};

type DecodeBytes = (chunks: AsyncIterable<Buffer>) => Promise<boolean>;
type Dependencies = {
    inspectSource: (
        userId: string, intentId: string, env: NodeJS.ProcessEnv,
        musicRoot: string, observe: ObserveValidatedStagingCandidate,
    ) => Promise<SourceFileEvidence>;
    open: (absolutePath: string, openFlags: number) => Promise<ReadOnlyFile>;
    decode: DecodeBytes;
};
const MAX_FILE_BYTES = 256 * 1024 * 1024;
const MIN_FILE_BYTES = 64;
const BLOCK_BYTES = 64 * 1024;
const DECODER_TIMEOUT_MS = 90_000;
let inProgress = false; // One expensive, explicit read per Kima backend process.

function outcome(
    state: FullAudioState,
    container: AudioContainer = "unknown",
    hashed = false,
): FullAudioEvidence {
    return {
        state, container, fullFileSha256Calculated: hashed,
        audioDecoded: state === "stream_decoded_unmatched",
        wholeFileIntegrityVerified: false,
        recordingVerified: false, stableMountVerified: false,
        libraryImportVerified: false, filesChanged: false,
        retryAllowed: false,
    };
}

/**
 * FFmpeg only consumes our provided stdin byte stream. It receives NO path,
 * remote URL, environment secrets or network protocol allowance. -xerror
 * fails on decode errors, -map requires an audio stream, and the null muxer
 * discards decoded output. The process has one thread and a wall timeout.
 */
export async function decodeWithFfmpeg(chunks: AsyncIterable<Buffer>): Promise<boolean> {
    const args = [
        "-hide_banner", "-loglevel", "error", "-nostats", "-nostdin",
        "-threads", "1", "-filter_threads", "1", "-xerror",
        "-protocol_whitelist", "pipe", "-i", "pipe:0",
        "-map", "0:a:0", "-vn", "-sn", "-dn",
        "-f", "null", "-",
    ];
    const child = spawn("/usr/bin/ffmpeg", args, {
        stdio: ["pipe", "ignore", "ignore"],
        env: { LANG: "C", PATH: "/usr/bin:/bin" },
        timeout: DECODER_TIMEOUT_MS,
        killSignal: "SIGKILL",
    });
    let finished = false;
    const status = new Promise<boolean>(resolve => {
        let resolved = false;
        const finish = (value: boolean) => {
            if (resolved) return;
            resolved = true;
            finished = true;
            resolve(value);
        };
        child.once("error", () => finish(false));
        child.once("close", (code, signal) => finish(code === 0 && !signal));
    });
    const stdin = child.stdin;
    if (!stdin) {
        child.kill("SIGKILL");
        await status;
        return false;
    }
    // A decoder rejecting corrupt audio can close stdin while we are writing.
    // Treat EPIPE as a failed check; never crash the backend process.
    stdin.on("error", () => undefined);
    try {
        for await (const chunk of chunks) {
            if (stdin.destroyed || finished) return false;
            if (!stdin.write(chunk)) {
                const drained = await new Promise<boolean>(resolve => {
                    let settled = false;
                    const complete = (value: boolean) => {
                        if (settled) return;
                        settled = true;
                        stdin.off("drain", onDrain);
                        stdin.off("close", onStop);
                        child.off("close", onStop);
                        child.off("error", onStop);
                        resolve(value);
                    };
                    const onDrain = () => complete(true);
                    const onStop = () => complete(false);
                    stdin.once("drain", onDrain);
                    stdin.once("close", onStop);
                    child.once("close", onStop);
                    child.once("error", onStop);
                    if (stdin.destroyed || finished) complete(false);
                });
                if (!drained) return false;
            }
        }
        if (!stdin.destroyed) stdin.end();
        return await status;
    } catch {
        return false;
    } finally {
        if (!finished) child.kill("SIGKILL");
        await status;
    }
}

/** Compute a full SHA-256 digest while passing the same bytes to the decoder.
 * The digest remains internal; returning it could fingerprint private media.
 */
export async function hashAndDecode(
    file: Pick<ReadOnlyFile, "read">,
    size: number,
    decode: DecodeBytes,
): Promise<{ bytesComplete: boolean; sha256Calculated: boolean; decoded: boolean }> {
    const hash = createHash("sha256");
    let position = 0;
    let bytesComplete = false;
    async function* chunks(): AsyncGenerator<Buffer> {
        while (position < size) {
            const chunk = Buffer.allocUnsafe(Math.min(BLOCK_BYTES, size - position));
            const { bytesRead } = await file.read(chunk, 0, chunk.length, position);
            if (!Number.isInteger(bytesRead) || bytesRead <= 0 ||
                bytesRead > chunk.length) throw new Error("File changed during read");
            const data = chunk.subarray(0, bytesRead);
            hash.update(data);
            position += bytesRead;
            yield data;
        }
        bytesComplete = true;
    }
    let decoded = false;
    try {
        decoded = await decode(chunks());
    } catch {
        decoded = false;
    }
    if (!bytesComplete || position !== size) {
        return { bytesComplete: false, sha256Calculated: false, decoded: false };
    }
    // Digest is calculated but not exposed, persisted or treated as a
    // reference checksum until a future verified copy compares both sides.
    hash.digest();
    return { bytesComplete: true, sha256Calculated: true, decoded };
}

const defaults: Dependencies = {
    inspectSource: (userId, intentId, env, root, observer) =>
        inspectDowntifySourceFile(userId, intentId, env, root, undefined, observer),
    open: (absolutePath, openFlags) => fs.open(absolutePath, openFlags),
    decode: decodeWithFfmpeg,
};

/** No filesystem I/O or remote fetches until ALL operator flags are enabled. */
export function getFullAudioCapability(
    userId: string, env: NodeJS.ProcessEnv = process.env,
) {
    if (env.KIMA_DOWNTIFY_FULL_AUDIO_CHECK_ENABLED !== "true") {
        return { state: "disabled" as const, canCheck: false, singleTrackOnly: true as const };
    }
    const header = getAudioHeaderCapability(userId, env);
    return { state: header.state, canCheck: header.canCheck, singleTrackOnly: true as const };
}

/**
 * A manually requested, process-serialized decode+hash. A source-file
 * observer sees a local path only AFTER D3/D4/D5 revalidation. No HTTP
 * response ever includes that path, the track bytes or the SHA-256 digest.
 */
export async function inspectDowntifyFullAudio(
    userId: string,
    intentId: string,
    env: NodeJS.ProcessEnv = process.env,
    musicRoot: string = config.music.musicPath,
    deps: Dependencies = defaults,
): Promise<FullAudioEvidence> {
    const cap = getFullAudioCapability(userId, env);
    if (!cap.canCheck) {
        if (cap.state === "unbound" || cap.state === "misconfigured") return outcome(cap.state);
        return outcome("disabled");
    }
    if (inProgress) return outcome("busy");
    inProgress = true;
    try {
        let state: FullAudioState = "file_unreadable";
        let container: AudioContainer = "unknown";
        let hashed = false;
        const observe: ObserveValidatedStagingCandidate = async candidate => {
            let handle: ReadOnlyFile | undefined;
            try {
                if (!Number.isSafeInteger(candidate.size) || candidate.size > MAX_FILE_BYTES) {
                    state = "file_too_large";
                    return;
                }
                if (candidate.size < MIN_FILE_BYTES) {
                    state = "header_unverified";
                    return;
                }
                handle = await deps.open(
                    candidate.absolutePath,
                    flags.O_RDONLY | flags.O_NOFOLLOW | flags.O_NONBLOCK,
                );
                const first = await handle.stat();
                const matchesCandidate = first.isFile() &&
                    first.dev === candidate.dev && first.ino === candidate.ino &&
                    first.size === candidate.size;
                if (!matchesCandidate) {
                    state = "file_changed";
                    return;
                }

                const header = Buffer.alloc(64);
                const headRead = await handle.read(header, 0, 64, 0);
                const bytes = header.subarray(0, headRead.bytesRead);
                container = detectAudioContainer(bytes);
                if (container === "unknown" ||
                    !audioHeaderMatchesExtension(
                        path.extname(candidate.absolutePath).toLowerCase(), container, bytes,
                    )) {
                    state = "header_unverified";
                    return;
                }

                const check = await hashAndDecode(handle, candidate.size, deps.decode);
                const last = await handle.stat();
                if (!last.isFile() || last.dev !== first.dev || last.ino !== first.ino ||
                    last.size !== first.size || last.mtimeMs !== first.mtimeMs ||
                    last.ctimeMs !== first.ctimeMs) {
                    state = "file_changed";
                    return;
                }
                if (!check.bytesComplete) {
                    state = "read_incomplete";
                    return;
                }
                hashed = check.sha256Calculated;
                state = check.decoded ? "stream_decoded_unmatched" : "decode_failed";
            } catch {
                state = "file_unreadable";
            } finally {
                if (handle) await handle.close().catch(() => undefined);
            }
        };
        const source = await deps.inspectSource(userId, intentId, env, musicRoot, observe);
        if (source.state === "not_found") return outcome("not_found");
        if (source.state !== "candidate_present_unverified") return outcome("source_unverified");
        return outcome(state, container, hashed);
    } catch {
        return outcome("source_unverified");
    } finally {
        inProgress = false;
    }
}
