/**
 * v1.18 D9: one deliberate, read-only verification walkthrough.
 *
 * Each backend GET rechecks the saved intent's Kima owner, Downtify
 * account/server, remote job and staging file. No POST, filesystem write,
 * queue retry or Kima library mutation is ever issued by this workflow.
 *
 * Even a complete sequence establishes ONLY untrusted metadata consistency,
 * not the authentic Spotify recording, a verified copy or indexed music.
 */
export type VerificationStep = "remote" | "source" | "header" | "decode" | "tags";
export type VerificationOutcome =
    | { state: "consistent_untrusted"; step: "tags"; recordingVerified: false; libraryImportVerified: false; filesChanged: false; retryAllowed: false }
    | { state: "unverified"; step: VerificationStep; recordingVerified: false; libraryImportVerified: false; filesChanged: false; retryAllowed: false }
    | { state: "unavailable"; step: VerificationStep; recordingVerified: false; libraryImportVerified: false; filesChanged: false; retryAllowed: false };

type ReadApi = (path: string) => Promise<unknown>;
type ReportProgress = (step: VerificationStep) => void;
const STEPS: readonly VerificationStep[] = ["remote", "source", "header", "decode", "tags"];
const ID = /^[a-zA-Z0-9_-]{5,128}$/;
const success = (step: VerificationStep, result: Record<string, unknown>): boolean => {
    if (result.filesChanged !== false || result.retryAllowed !== false ||
        result.libraryImportVerified !== false) return false;
    switch (step) {
        case "remote":
            return result.state === "verified" && result.remotePhase === "downloaded" &&
                result.remoteOwnershipVerified === true &&
                result.playbackVerified === false;
        case "source":
            return result.state === "candidate_present_unverified" &&
                result.regularFileObserved === true && result.recordingVerified === false;
        case "header":
            return result.state === "header_observed_unverified" &&
                result.headerMatchedExtension === true &&
                result.audioDecoded === false && result.recordingVerified === false;
        case "decode":
            return result.state === "stream_decoded_unmatched" &&
                result.audioDecoded === true && result.fullFileSha256Calculated === true &&
                result.wholeFileIntegrityVerified === false &&
                result.recordingVerified === false;
        case "tags":
            return result.state === "metadata_consistent_untrusted" &&
                result.isrcMatches === true && result.durationMatches === true &&
                result.recordingVerified === false &&
                result.wholeFileIntegrityVerified === false;
    }
};
const stop = (state: "unverified" | "unavailable", step: VerificationStep): VerificationOutcome => ({
    state, step, recordingVerified: false, libraryImportVerified: false,
    filesChanged: false, retryAllowed: false,
});

const SUFFIX: Record<VerificationStep, string> = {
    remote: "remote-status",
    source: "source-file",
    header: "audio-header",
    decode: "full-audio",
    tags: "recording-tags",
};

/** Any uncertain, malformed or failed response stops before the next call. */
export async function verifySavedSpotifyTrack(
    intentId: string,
    read: ReadApi,
    progress: ReportProgress = () => undefined,
    isCurrentSession: () => boolean = () => true,
): Promise<VerificationOutcome> {
    if (!ID.test(intentId)) return stop("unverified", "remote");
    const prefix = "/download-manager/spotify/intents/" + encodeURIComponent(intentId) + "/";
    for (const step of STEPS) {
        // Do not continue with old-user requests after account change,
        // logout or unmount, even if a previous response still arrives.
        if (!isCurrentSession()) return stop("unavailable", step);
        progress(step);
        let payload: unknown;
        try {
            payload = await read(prefix + SUFFIX[step]);
        } catch {
            // Never reflect internal server errors, filenames or credentials.
            return stop("unavailable", step);
        }
        if (!isCurrentSession()) return stop("unavailable", step);
        if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
            return stop("unverified", step);
        }
        if (!success(step, payload as Record<string, unknown>)) {
            return stop("unverified", step);
        }
    }
    return {
        state: "consistent_untrusted", step: "tags",
        recordingVerified: false, libraryImportVerified: false,
        filesChanged: false, retryAllowed: false,
    };
}
