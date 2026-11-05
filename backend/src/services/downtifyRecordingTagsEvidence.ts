/**
 * D8: default-OFF read-only comparison of untrusted embedded audio tags
 * against Kima's existing Spotify ISRC + duration provider. A matching tag
 * is NOT recording authentication, verified bytes, or an import receipt.
 *
 * The source path is seen only inside the D5 trusted observer. It is opened
 * O_RDONLY|O_NOFOLLOW and the inode is compared before and after bounded
 * metadata parsing. Neither paths, ISRCs nor provider raw errors reach HTTP.
 */
import { constants as flags, promises as fs } from "fs";
import { Readable } from "stream";
import { config } from "../config";
import { prisma } from "../utils/db";
import { spotifyService } from "./spotify";
import { parseSpotifyDownloadLink } from "./spotifyLinkIntake";
import { getFullAudioCapability } from "./downtifyFullAudioEvidence";
import {
    inspectDowntifySourceFile,
    type SourceFileEvidence,
    type ObserveValidatedStagingCandidate,
} from "./downtifySourceFileEvidence";

export type RecordingTagState =
    | "disabled" | "unbound" | "misconfigured" | "busy" | "not_found"
    | "source_unverified" | "identity_unavailable" | "metadata_unavailable"
    | "file_changed" | "file_unreadable" | "file_too_large"
    | "tag_missing" | "tag_conflict" | "duration_missing"
    | "isrc_mismatch" | "duration_mismatch"
    | "metadata_consistent_untrusted";

export interface RecordingTagEvidence {
    state: RecordingTagState;
    isrcMatches: boolean;
    durationMatches: boolean;
    /** The Spotify metadata and the file tag do not authenticate the bytes. */
    recordingVerified: false;
    /** D8 does not replay the independent D7 decoding check. */
    audioDecoded: false;
    wholeFileIntegrityVerified: false;
    stableMountVerified: false;
    libraryImportVerified: false;
    filesChanged: false;
    retryAllowed: false;
}

export type EmbeddedRecordingTags = {
    isrc: unknown;
    durationSeconds: unknown;
};

type FileStat = {
    dev: number; ino: number; size: number;
    mtimeMs: number; ctimeMs: number;
    isFile: () => boolean;
};
type OpenFile = {
    stat: () => Promise<FileStat>;
    read: (buffer: Buffer, offset: number, length: number, position: number) =>
        Promise<{ bytesRead: number }>;
    close: () => Promise<void>;
};
type SpotifyIdentity = { spotifyId: string; isrc: string | null; durationMs: number };
type Deps = {
    inspectSource: (
        userId: string, intentId: string, env: NodeJS.ProcessEnv,
        musicRoot: string, observe: ObserveValidatedStagingCandidate,
    ) => Promise<SourceFileEvidence>;
    getOwnedIntent: (userId: string, intentId: string) => Promise<{
        kind: string; spotifyId: string; canonicalUrl: string;
        status: string; remoteSongId: string | null;
    } | null>;
    getSpotify: (spotifyId: string) => Promise<SpotifyIdentity | null>;
    open: (absolutePath: string, openFlags: number) => Promise<OpenFile>;
    parse: (chunks: AsyncIterable<Buffer>, size: number) => Promise<EmbeddedRecordingTags>;
};

const MAX_SOURCE_BYTES = 256 * 1024 * 1024;
const MAX_METADATA_BYTES = 8 * 1024 * 1024;
const CHUNK_BYTES = 64 * 1024;
const MAX_DURATION_DRIFT_MS = 4000;
const ISRC = /^[A-Z]{2}[A-Z0-9]{3}[0-9]{7}$/;
let active = false;

function outcome(
    state: RecordingTagState,
    isrcMatches = false,
    durationMatches = false,
): RecordingTagEvidence {
    return {
        state, isrcMatches, durationMatches,
        recordingVerified: false, audioDecoded: false,
        wholeFileIntegrityVerified: false, stableMountVerified: false,
        libraryImportVerified: false, filesChanged: false, retryAllowed: false,
    };
}

/**
 * Pure conservative comparison. Contradictory or missing embedded ISRCs
 * never count as a successful match, even when artist/title are identical.
 */
export function compareRecordingTags(
    spotify: SpotifyIdentity, embedded: EmbeddedRecordingTags,
): RecordingTagEvidence {
    const expected = typeof spotify.isrc === "string" ? spotify.isrc.trim().toUpperCase() : "";
    if (!ISRC.test(expected) || !Number.isSafeInteger(spotify.durationMs) ||
        spotify.durationMs < 1000) return outcome("identity_unavailable");

    const values = Array.isArray(embedded.isrc) ? embedded.isrc : [embedded.isrc];
    const cleaned = values.map(v => typeof v === "string" ? v.trim().toUpperCase() : "");
    if (cleaned.every(x => !x)) return outcome("tag_missing");
    if (cleaned.some(x => !ISRC.test(x)) ||
        new Set(cleaned).size !== 1 || cleaned.length > 16) {
        return outcome("tag_conflict");
    }
    const isrcMatches = cleaned[0] === expected;
    if (!isrcMatches) return outcome("isrc_mismatch");

    const seconds = embedded.durationSeconds;
    if (typeof seconds !== "number" || !Number.isFinite(seconds) ||
        seconds <= 0 || seconds > 24 * 60 * 60) {
        return outcome("duration_missing", true);
    }
    const durationMatches = Math.abs(seconds * 1000 - spotify.durationMs) <= MAX_DURATION_DRIFT_MS;
    return outcome(
        durationMatches ? "metadata_consistent_untrusted" : "duration_mismatch",
        true, durationMatches,
    );
}

/**
 * Reads only a bounded prefix. Streaming metadata may omit tags at EOF;
 * missing evidence is UNKNOWN, not a negative file identity verdict.
 */
export async function parseBoundedRecordingTags(
    chunks: AsyncIterable<Buffer>,
    size: number,
): Promise<EmbeddedRecordingTags> {
    const stream = Readable.from(chunks);
    try {
        const { parseStream } = await import("music-metadata");
        const metadata = await parseStream(stream, { size }, {
            duration: false, skipCovers: true, skipPostHeaders: true,
        });
        return {
            isrc: metadata.common.isrc ?? null,
            durationSeconds: metadata.format.duration ?? null,
        };
    } finally {
        stream.destroy();
    }
}

const defaults: Deps = {
    inspectSource: (user, id, env, root, observe) =>
        inspectDowntifySourceFile(user, id, env, root, undefined, observe),
    getOwnedIntent: (userId, id) => prisma.spotifyDownloadIntent.findFirst({
        where: { id, userId },
        select: {
            kind: true, spotifyId: true, canonicalUrl: true,
            status: true, remoteSongId: true,
        },
    }),
    getSpotify: id => spotifyService.getTrackBySpotifyId(id),
    open: (file, openFlags) => fs.open(file, openFlags),
    parse: parseBoundedRecordingTags,
};

export function getRecordingTagCapability(
    userId: string, env: NodeJS.ProcessEnv = process.env,
) {
    if (env.KIMA_DOWNTIFY_RECORDING_TAG_CHECK_ENABLED !== "true") {
        return { state: "disabled" as const, canCheck: false, singleTrackOnly: true as const };
    }
    const fullAudio = getFullAudioCapability(userId, env);
    return {
        state: fullAudio.state,
        canCheck: fullAudio.canCheck,
        singleTrackOnly: true as const,
    };
}

/**
 * An independent manual request; no client may pass a path or ISRC. D5
 * rechecks exact account, song, remote server and staging file every time.
 * We then re-read the same owner-scoped saved request before fetching the
 * provider's ISRC, and compare it against the opened staging file's tags.
 */
export async function inspectDowntifyRecordingTags(
    userId: string,
    intentId: string,
    env: NodeJS.ProcessEnv = process.env,
    musicRoot: string = config.music.musicPath,
    deps: Deps = defaults,
): Promise<RecordingTagEvidence> {
    const capability = getRecordingTagCapability(userId, env);
    if (!capability.canCheck) {
        if (capability.state === "unbound" || capability.state === "misconfigured") {
            return outcome(capability.state);
        }
        return outcome("disabled");
    }
    if (active) return outcome("busy");
    active = true;
    try {
        let result = outcome("metadata_unavailable");
        const observe: ObserveValidatedStagingCandidate = async candidate => {
            let file: OpenFile | undefined;
            try {
                const intent = await deps.getOwnedIntent(userId, intentId);
                const parsed = intent && parseSpotifyDownloadLink(intent.canonicalUrl);
                if (!intent || intent.kind !== "track" || !parsed || parsed.kind !== "track" ||
                    parsed.canonicalUrl !== intent.canonicalUrl ||
                    parsed.intentKey !== "spotify:track:" + intent.spotifyId ||
                    intent.remoteSongId !== intent.spotifyId ||
                    !["submitted", "dispatching", "dispatch_unknown"].includes(intent.status)) {
                    result = outcome("identity_unavailable");
                    return;
                }
                const trusted = await deps.getSpotify(intent.spotifyId);
                if (!trusted || trusted.spotifyId !== intent.spotifyId ||
                    typeof trusted.isrc !== "string" || !ISRC.test(trusted.isrc.toUpperCase()) ||
                    !Number.isSafeInteger(trusted.durationMs) || trusted.durationMs < 1000) {
                    result = outcome("identity_unavailable");
                    return;
                }
                if (!Number.isSafeInteger(candidate.size) || candidate.size > MAX_SOURCE_BYTES) {
                    result = outcome("file_too_large");
                    return;
                }
                file = await deps.open(
                    candidate.absolutePath,
                    flags.O_RDONLY | flags.O_NOFOLLOW | flags.O_NONBLOCK,
                );
                const before = await file.stat();
                if (!before.isFile() || before.dev !== candidate.dev ||
                    before.ino !== candidate.ino || before.size !== candidate.size) {
                    result = outcome("file_changed");
                    return;
                }
                const handle = file;
                async function* chunks(): AsyncGenerator<Buffer> {
                    let offset = 0;
                    const maximum = Math.min(candidate.size, MAX_METADATA_BYTES);
                    while (offset < maximum) {
                        const buffer = Buffer.alloc(Math.min(CHUNK_BYTES, maximum - offset));
                        const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
                        if (!Number.isInteger(bytesRead) || bytesRead < 1 ||
                            bytesRead > buffer.length) throw new Error("Incomplete metadata");
                        offset += bytesRead;
                        yield buffer.subarray(0, bytesRead);
                    }
                }
                let embedded: EmbeddedRecordingTags;
                try {
                    embedded = await deps.parse(chunks(), candidate.size);
                } catch {
                    result = outcome("metadata_unavailable");
                    return;
                }
                const after = await file.stat();
                if (!after.isFile() || after.dev !== before.dev || after.ino !== before.ino ||
                    after.size !== before.size || after.mtimeMs !== before.mtimeMs ||
                    after.ctimeMs !== before.ctimeMs) {
                    result = outcome("file_changed");
                    return;
                }
                result = compareRecordingTags(trusted, embedded);
            } catch {
                result = outcome("file_unreadable");
            } finally {
                if (file) await file.close().catch(() => undefined);
            }
        };
        const source = await deps.inspectSource(userId, intentId, env, musicRoot, observe);
        if (source.state === "not_found") return outcome("not_found");
        if (source.state !== "candidate_present_unverified") return outcome("source_unverified");
        return result;
    } catch {
        return outcome("source_unverified");
    } finally {
        active = false;
    }
}
