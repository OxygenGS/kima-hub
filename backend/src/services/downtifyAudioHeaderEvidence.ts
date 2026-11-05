/**
 * D6 — strictly read-only, owner-scoped audio-container header probe.
 *
 * A file's magic bytes do not prove that it decodes, matches the Spotify
 * recording, has intact content, lives on a durable mount, or was imported.
 * Never return candidate paths, file descriptors, filenames or audio bytes.
 */
import { constants as fsConstants, promises as fs } from "fs";
import * as path from "path";
import { config } from "../config";
import {
    getSourceFileCapability, inspectDowntifySourceFile,
    type SourceFileEvidence, type ObserveValidatedStagingCandidate,
} from "./downtifySourceFileEvidence";

export type AudioHeaderState =
    | "disabled" | "unbound" | "misconfigured" | "not_found"
    | "source_unverified" | "file_changed" | "file_unreadable"
    | "unrecognized_header" | "container_mismatch"
    | "header_observed_unverified";
export type AudioContainer = "flac" | "mp3" | "mp4" | "ogg" | "wav" | "unknown";

export interface AudioHeaderEvidence {
    state: AudioHeaderState;
    container: AudioContainer;
    headerMatchedExtension: boolean;
    audioDecoded: false;
    recordingVerified: false;
    wholeFileIntegrityVerified: false;
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
type AudioHeaderDeps = {
    inspectSource: (
        userId: string, intentId: string, env: NodeJS.ProcessEnv, musicRoot: string,
        observer: ObserveValidatedStagingCandidate,
    ) => Promise<SourceFileEvidence>;
    open: (absolutePath: string, flags: number) => Promise<ReadOnlyFile>;
};
const defaults: AudioHeaderDeps = {
    inspectSource: (userId, intentId, env, musicRoot, observer) =>
        inspectDowntifySourceFile(userId, intentId, env, musicRoot, undefined, observer),
    open: (absolutePath, flags) => fs.open(absolutePath, flags),
};
const HEADER_BYTES = 64;
const MIN_PLAUSIBLE_BYTES = 32;

function outcome(
    state: AudioHeaderState,
    container: AudioContainer = "unknown",
): AudioHeaderEvidence {
    return {
        state,
        container,
        headerMatchedExtension: state === "header_observed_unverified",
        audioDecoded: false, recordingVerified: false,
        wholeFileIntegrityVerified: false, stableMountVerified: false,
        libraryImportVerified: false, filesChanged: false, retryAllowed: false,
    };
}

/**
 * This is a signature-only observation, not a codec parser. In particular an
 * ID3 tag may exist even if there is no valid MPEG audio frame later on.
 */
export function detectAudioContainer(bytes: Buffer): AudioContainer {
    if (bytes.length < MIN_PLAUSIBLE_BYTES) return "unknown";
    if (bytes.toString("ascii", 0, 4) === "fLaC") return "flac";
    if (bytes.toString("ascii", 0, 4) === "OggS") return "ogg";
    if (bytes.toString("ascii", 0, 4) === "RIFF" &&
        bytes.toString("ascii", 8, 12) === "WAVE") return "wav";
    if (bytes.toString("ascii", 4, 8) === "ftyp") return "mp4";
    if (bytes.toString("ascii", 0, 3) === "ID3") return "mp3";
    if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0 &&
        (bytes[1] & 0x06) !== 0 && (bytes[2] & 0xf0) !== 0xf0) return "mp3";
    return "unknown";
}

export function audioHeaderMatchesExtension(extension: string, container: AudioContainer, header: Buffer): boolean {
    switch (extension) {
        case ".flac": return container === "flac";
        case ".mp3": return container === "mp3";
        case ".m4a": return container === "mp4";
        case ".ogg": return container === "ogg";
        // Opus in Ogg has its identifying ID packet in the first page.
        case ".opus": return container === "ogg" && header.includes(Buffer.from("OpusHead"));
        case ".wav": return container === "wav";
        default: return false;
    }
}

/** No filesystem operations, network requests or tokens leave this capability. */
export function getAudioHeaderCapability(
    userId: string, env: NodeJS.ProcessEnv = process.env,
) {
    if (env.KIMA_DOWNTIFY_AUDIO_HEADER_ENABLED !== "true") {
        return { state: "disabled" as const, canCheck: false, singleTrackOnly: true as const };
    }
    const source = getSourceFileCapability(userId, env);
    return { state: source.state, canCheck: source.canCheck, singleTrackOnly: true as const };
}

/**
 * Reuses the exact D3 owner, D4 root, D5 relative path checks. Only after
 * those succeed do we open O_NOFOLLOW/O_NONBLOCK/O_RDONLY, compare the opened
 * inode with the D5 observation, and read at most 64 bytes.
 */
export async function inspectDowntifyAudioHeader(
    userId: string,
    intentId: string,
    env: NodeJS.ProcessEnv = process.env,
    musicRoot: string = config.music.musicPath,
    deps: AudioHeaderDeps = defaults,
): Promise<AudioHeaderEvidence> {
    const capability = getAudioHeaderCapability(userId, env);
    if (!capability.canCheck) {
        if (capability.state === "unbound" || capability.state === "misconfigured") {
            return outcome(capability.state);
        }
        return outcome("disabled");
    }

    let state: AudioHeaderState = "file_unreadable";
    let container: AudioContainer = "unknown";
    const observer: ObserveValidatedStagingCandidate = async candidate => {
        let handle: ReadOnlyFile | undefined;
        try {
            handle = await deps.open(
                candidate.absolutePath,
                fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK,
            );
            const before = await handle.stat();
            const sameFile = before.isFile() &&
                Number.isSafeInteger(before.dev) && before.dev === candidate.dev &&
                Number.isSafeInteger(before.ino) && before.ino === candidate.ino &&
                Number.isSafeInteger(before.size) && before.size === candidate.size;
            if (!sameFile) {
                state = "file_changed";
                return;
            }

            const bytes = Buffer.alloc(HEADER_BYTES);
            const read = await handle.read(bytes, 0, bytes.length, 0);
            const after = await handle.stat();
            if (!after.isFile() || after.dev !== before.dev || after.ino !== before.ino ||
                after.size !== before.size || after.mtimeMs !== before.mtimeMs ||
                after.ctimeMs !== before.ctimeMs) {
                state = "file_changed";
                return;
            }
            const sample = bytes.subarray(0, read.bytesRead);
            container = detectAudioContainer(sample);
            state = container === "unknown"
                ? "unrecognized_header"
                : audioHeaderMatchesExtension(path.extname(candidate.absolutePath).toLowerCase(), container, sample)
                    ? "header_observed_unverified"
                    : "container_mismatch";
        } catch {
            state = "file_unreadable";
        } finally {
            // Do not leave an open FD or permit another request to inherit it.
            if (handle) await handle.close().catch(() => undefined);
        }
    };
    try {
        const source = await deps.inspectSource(userId, intentId, env, musicRoot, observer);
        if (source.state === "not_found") return outcome("not_found");
        if (source.state !== "candidate_present_unverified") return outcome("source_unverified");
        return outcome(state, container);
    } catch {
        return outcome("source_unverified");
    }
}
