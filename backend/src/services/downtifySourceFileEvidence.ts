/**
 * v1.18 D5: explicit read-only evidence that one completed, OWNER-verified
 * Downtify job points at a non-empty regular file under the operator's staging
 * root. This is NOT proof of recording, audio decode, stable mount or import.
 *
 * No source path or filename ever leaves this service's private boundary.
 */
import { promises as fs } from "fs";
import * as path from "path";
import { config } from "../config";
import {
    getReconciliationCapability,
    inspectOwnedDowntifyFileCandidate,
    type OwnedDowntifyFileCandidate,
    type RemoteTransferPhase,
} from "./downtifyDispatchReconciliation";
import {
    inspectDowntifyStorage, type StoragePreflight,
} from "./downtifyStoragePreflight";

export type SourceFileState =
    | "disabled" | "unbound" | "misconfigured" | "not_found"
    | "storage_unavailable" | "remote_unverified" | "not_downloaded"
    | "source_path_unavailable" | "external_source_unsupported"
    | "unsafe_source_path" | "source_unavailable" | "candidate_present_unverified";

export interface SourceFileEvidence {
    state: SourceFileState;
    remotePhase: RemoteTransferPhase;
    regularFileObserved: boolean;
    /** A regular file is NOT an independently identified recording. */
    recordingVerified: false;
    audioDecoded: false;
    stableMountVerified: false;
    libraryImportVerified: false;
    filesChanged: false;
    retryAllowed: false;
}

type FileStat = {
    dev: number;
    ino?: number;
    size: number;
    isFile: () => boolean;
    isDirectory: () => boolean;
    isSymbolicLink: () => boolean;
};
type Reader = {
    lstat: (file: string) => Promise<FileStat>;
    realpath: (file: string) => Promise<string>;
};

/**
 * Internal-only handoff. An opaque file identity is given to the D6 reader
 * after D3 account proof and D4/D5 path checks. It MUST NOT reach an API.
 */
export interface ValidatedStagingCandidate {
    absolutePath: string;
    dev: number;
    ino: number;
    size: number;
}
export type ObserveValidatedStagingCandidate =
    (candidate: ValidatedStagingCandidate) => Promise<void>;
type Deps = {
    inspectStorage: (env: NodeJS.ProcessEnv, musicRoot: string) => Promise<StoragePreflight>;
    inspectRemote: (
        userId: string, intentId: string, env: NodeJS.ProcessEnv,
    ) => Promise<OwnedDowntifyFileCandidate>;
    reader: Reader;
};
const defaultDeps: Deps = {
    inspectStorage: (env, musicRoot) => inspectDowntifyStorage(env, musicRoot),
    inspectRemote: (userId, intentId, env) => inspectOwnedDowntifyFileCandidate(userId, intentId, env),
    reader: fs,
};
const MAX_COMPONENTS = 30;
const MAX_FILENAME_LENGTH = 1024;
const ALLOWED_EXTENSIONS = new Set([".flac", ".mp3", ".m4a", ".ogg", ".opus", ".wav"]);
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function outcome(
    state: SourceFileState,
    phase: RemoteTransferPhase = "not_checked",
): SourceFileEvidence {
    return {
        state, remotePhase: phase,
        regularFileObserved: state === "candidate_present_unverified",
        recordingVerified: false, audioDecoded: false, stableMountVerified: false,
        libraryImportVerified: false, filesChanged: false, retryAllowed: false,
    };
}

/** Capability may be checked without any filesystem or remote API request. */
export function getSourceFileCapability(
    userId: string, env: NodeJS.ProcessEnv = process.env,
) {
    if (env.KIMA_DOWNTIFY_SOURCE_EVIDENCE_ENABLED !== "true" ||
        env.KIMA_DOWNTIFY_STORAGE_PREFLIGHT_ENABLED !== "true") {
        return { state: "disabled" as const, canCheck: false, singleTrackOnly: true as const };
    }
    const state = getReconciliationCapability(userId, env).state;
    return {
        state,
        canCheck: state === "available",
        singleTrackOnly: true as const,
    };
}

/** Unsafe or secondary slskd paths never become paths inside the staging tree. */
function validateFilename(filename: unknown): {
    state: "ok" | "unavailable" | "external" | "unsafe";
    parts?: string[];
} {
    if (filename === null || filename === undefined || filename === "") {
        return { state: "unavailable" };
    }
    if (typeof filename !== "string" || filename.length > MAX_FILENAME_LENGTH ||
        CONTROL_CHARS.test(filename) || filename.includes("\\") ||
        path.posix.isAbsolute(filename) || path.win32.isAbsolute(filename)) {
        return { state: "unsafe" };
    }
    const parts = filename.split("/");
    if (parts.length === 0 || parts.length > MAX_COMPONENTS ||
        parts.some(part => !part || part === "." || part === ".." || part.includes(":"))) {
        return { state: "unsafe" };
    }
    if (parts[0] === "slskd" || parts[0] === "ext") return { state: "external" };
    if (!ALLOWED_EXTENSIONS.has(path.posix.extname(filename).toLowerCase())) {
        return { state: "unsafe" };
    }
    return { state: "ok", parts };
}

/**
 * The caller must first prove the remote owner, immutable song identity,
 * and final 'done' status. All file checks use lstat/realpath only; no read,
 * hash, audio decode, download, copy, delete, or Kima DB mutation happens.
 */
export async function inspectDowntifySourceFile(
    userId: string,
    intentId: string,
    env: NodeJS.ProcessEnv = process.env,
    musicRoot: string = config.music.musicPath,
    deps: Deps = defaultDeps,
    observe?: ObserveValidatedStagingCandidate,
): Promise<SourceFileEvidence> {
    const cap = getSourceFileCapability(userId, env);
    if (!cap.canCheck) {
        return outcome(cap.state === "available" ? "disabled" : cap.state);
    }

    let topology: StoragePreflight;
    try {
        topology = await deps.inspectStorage(env, musicRoot);
    } catch {
        return outcome("storage_unavailable");
    }
    if (topology.state !== "inspected") return outcome("storage_unavailable");

    let found: OwnedDowntifyFileCandidate;
    try {
        found = await deps.inspectRemote(userId, intentId, env);
    } catch {
        return outcome("remote_unverified");
    }
    const evidence = found.verification;
    if (evidence.state === "not_found") return outcome("not_found");
    if (evidence.state !== "verified" || !evidence.remoteOwnershipVerified) {
        return outcome("remote_unverified");
    }
    if (evidence.remotePhase !== "downloaded") return outcome("not_downloaded", evidence.remotePhase);

    const relative = validateFilename(found.filename);
    if (relative.state === "unavailable") return outcome("source_path_unavailable", "downloaded");
    if (relative.state === "external") return outcome("external_source_unsupported", "downloaded");
    if (relative.state !== "ok" || !relative.parts) return outcome("unsafe_source_path", "downloaded");

    const rawRoot = env.KIMA_DOWNTIFY_STAGING_ROOT?.trim();
    if (!rawRoot || !path.isAbsolute(rawRoot)) return outcome("storage_unavailable", "downloaded");

    try {
        const root = path.resolve(rawRoot);
        const rootReal = await deps.reader.realpath(root);
        const rootStat = await deps.reader.lstat(root);
        if (rootReal !== root || !rootStat.isDirectory() || rootStat.isSymbolicLink() ||
            !Number.isSafeInteger(rootStat.dev)) {
            return outcome("unsafe_source_path", "downloaded");
        }

        // Inspect every component. A symlinked ancestor, nested mount or
        // non-directory component invalidates this candidate.
        let current = root;
        let finalStat: FileStat | null = null;
        const parts = relative.parts;
        for (let i = 0; i < parts.length; i++) {
            current = path.join(current, parts[i]);
            const stat = await deps.reader.lstat(current);
            if (stat.isSymbolicLink() || !Number.isSafeInteger(stat.dev) ||
                stat.dev !== rootStat.dev) return outcome("unsafe_source_path", "downloaded");
            if (i !== parts.length - 1) {
                if (!stat.isDirectory()) return outcome("unsafe_source_path", "downloaded");
            } else {
                if (!stat.isFile()) return outcome("unsafe_source_path", "downloaded");
                finalStat = stat;
                if (!Number.isSafeInteger(stat.size) || stat.size <= 0) {
                    return outcome("source_unavailable", "downloaded");
                }
            }
        }
        const fullReal = await deps.reader.realpath(current);
        if (fullReal !== current || !fullReal.startsWith(rootReal + path.sep)) {
            return outcome("unsafe_source_path", "downloaded");
        }
        if (observe) {
            // The consumer must re-open O_NOFOLLOW and compare fstat dev/ino/size;
            // this check alone cannot close a path-replacement TOCTOU window.
            if (!finalStat || !Number.isSafeInteger(finalStat.ino) ||
                (finalStat.ino ?? 0) <= 0) {
                return outcome("unsafe_source_path", "downloaded");
            }
            await observe({
                absolutePath: current,
                dev: finalStat.dev,
                ino: finalStat.ino as number,
                size: finalStat.size,
            });
        }
        return outcome("candidate_present_unverified", "downloaded");
    } catch {
        // Downtify or Importer v5 might already have moved a file. The
        // absence of a candidate is NEVER permission to resubmit a track.
        return outcome("source_unavailable", "downloaded");
    }
}
