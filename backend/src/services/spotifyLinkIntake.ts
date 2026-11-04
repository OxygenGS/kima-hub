/**
 * v1.18.0 link intake: validate and canonicalize Spotify share links.
 *
 * This PURE function does not resolve Spotify metadata, check the library,
 * enqueue downloads or contact Downtify. A later write handler must re-check
 * the canonical identity, user permissions and per-user idempotency.
 */
export type SpotifyDownloadKind = "track" | "album" | "playlist";

export interface SpotifyLinkIntakePreview {
    provider: "spotify";
    kind: SpotifyDownloadKind;
    canonicalUrl: string;
    intentKey: string;
    /** Per-user duplicate detection is not implemented in this phase. */
    duplicateCheck: "not_checked";
    /** No file was downloaded, moved or indexed by this preview. */
    downloadStarted: false;
    libraryVerification: "not_checked";
    submissionEnabled: false;
}

const MAX_INPUT_LENGTH = 2048;
const URI = /^spotify:(track|album|playlist):([A-Za-z0-9]{22})$/;
const PATH = /^\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(track|album|playlist)\/([A-Za-z0-9]{22})\/?$/;

/**
 * Accept direct Spotify track/album/playlist links, including international
 * share paths and native spotify: URIs. No redirects or network calls.
 *
 * Drops tracking query parameters instead of reflecting them back to clients.
 * Rejects ambiguous domains, insecure URLs, credentials, fragments, custom
 * ports and unsupported resource kinds (artists/episodes/podcasts).
 */
export function parseSpotifyDownloadLink(input: unknown): SpotifyLinkIntakePreview | null {
    if (typeof input !== "string") return null;
    const raw = input.trim();
    if (!raw || raw.length > MAX_INPUT_LENGTH || raw.includes("\\")) return null;

    let match = URI.exec(raw);
    if (!match) {
        let url: URL;
        try {
            url = new URL(raw);
        } catch {
            return null;
        }
        if (
            url.protocol !== "https:" ||
            url.origin !== "https://open.spotify.com" ||
            url.hostname !== "open.spotify.com" ||
            url.username || url.password || url.port ||
            url.hash
        ) return null;
        match = PATH.exec(url.pathname);
    }

    if (!match) return null;
    const kind = match[1] as SpotifyDownloadKind;
    const id = match[2];
    return {
        provider: "spotify",
        kind,
        canonicalUrl: "https://open.spotify.com/" + kind + "/" + id,
        intentKey: "spotify:" + kind + ":" + id,
        duplicateCheck: "not_checked",
        downloadStarted: false,
        libraryVerification: "not_checked",
        submissionEnabled: false,
    };
}
