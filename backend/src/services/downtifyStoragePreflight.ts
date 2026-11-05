/**
 * v1.18 D4: read-only storage topology preflight.
 *
 * This is NOT an importer and can never prove a mount is durable, a source file
 * exists, audio is valid, a Downtify job is owned or an import is safe to run.
 * It deliberately cannot write to the download staging area or music library.
 */
import { promises as fs } from "fs";
import * as path from "path";
import { config } from "../config";

export type StoragePreflightState =
    | "disabled" | "misconfigured" | "source_unavailable"
    | "library_unavailable" | "unsafe_layout" | "inspected";
export type FilesystemRelation = "not_checked" | "different_device" | "same_device_candidate";

export interface StoragePreflight {
    state: StoragePreflightState;
    filesystemRelation: FilesystemRelation;
    copyRequiredByDevice: boolean | null;
    mountIdentityVerified: false;
    sourceAudioVerified: false;
    libraryImportVerified: false;
    importerCutoverAuthorized: false;
    filesChanged: false;
}

type RootStat = {
    dev: number;
    isDirectory: () => boolean;
    isSymbolicLink: () => boolean;
};
type Reader = {
    lstat: (name: string) => Promise<RootStat>;
    realpath: (name: string) => Promise<string>;
};
type Root = { real: string; dev: number };
type RootResult = { state: "ok"; root: Root } |
    { state: "unavailable" | "unsafe" };

const make = (
    state: StoragePreflightState,
    relation: FilesystemRelation = "not_checked",
): StoragePreflight => ({
    state,
    filesystemRelation: relation,
    copyRequiredByDevice: relation === "not_checked" ? null : relation === "different_device",
    mountIdentityVerified: false,
    sourceAudioVerified: false,
    libraryImportVerified: false,
    importerCutoverAuthorized: false,
    filesChanged: false,
});

function validRoot(value: unknown): value is string {
    return typeof value === "string" && value.length > 1 && value.length <= 4096 &&
        !value.includes("\0") && !value.includes("\\") &&
        path.isAbsolute(value) && path.posix.normalize(value) !== "/" &&
        !value.split("/").some(part => part === "." || part === "..");
}

async function inspectRoot(raw: string, reader: Reader): Promise<RootResult> {
    try {
        const stat = await reader.lstat(raw);
        if (!stat.isDirectory() || stat.isSymbolicLink() ||
            !Number.isSafeInteger(stat.dev) || stat.dev < 0) {
            return { state: "unsafe" };
        }
        const real = await reader.realpath(raw);
        // A symlink in any ancestor is not an acceptable trusted root.
        if (real !== path.resolve(raw)) return { state: "unsafe" };
        return { state: "ok", root: { real, dev: stat.dev } };
    } catch {
        return { state: "unavailable" };
    }
}

/**
 * Never accepts a path from the HTTP request; both roots are supplied by
 * the operator and existing Kima music configuration.
 * Identical device numbers are necessary, but NOT sufficient, for hardlinks
 * across mount namespaces/bind mounts. Never claim a hardlink is guaranteed.
 */
export async function inspectDowntifyStorage(
    env: NodeJS.ProcessEnv = process.env,
    musicRoot: string = config.music.musicPath,
    reader: Reader = fs,
): Promise<StoragePreflight> {
    if (env.KIMA_DOWNTIFY_STORAGE_PREFLIGHT_ENABLED !== "true" ||
        env.KIMA_DOWNTIFY_ENABLED !== "true") return make("disabled");

    const downloadRoot = env.KIMA_DOWNTIFY_STAGING_ROOT?.trim();
    if (!validRoot(downloadRoot) || !validRoot(musicRoot)) return make("misconfigured");

    const source = await inspectRoot(downloadRoot, reader);
    if (source.state === "unavailable") return make("source_unavailable");
    if (source.state !== "ok") return make("unsafe_layout");

    const library = await inspectRoot(musicRoot, reader);
    if (library.state === "unavailable") return make("library_unavailable");
    if (library.state !== "ok") return make("unsafe_layout");

    // Shared/overlapping trees risk loops, overwriting source and accidental
    // deletions by a future importer. Reject before reporting topology.
    const relativeA = path.relative(source.root.real, library.root.real);
    const relativeB = path.relative(library.root.real, source.root.real);
    if (!relativeA || !relativeB ||
        (!relativeA.startsWith(".."+path.sep) && relativeA !== ".." && !path.isAbsolute(relativeA)) ||
        (!relativeB.startsWith(".."+path.sep) && relativeB !== ".." && !path.isAbsolute(relativeB))) {
        return make("unsafe_layout");
    }

    return make(
        "inspected",
        source.root.dev === library.root.dev ? "same_device_candidate" : "different_device",
    );
}
