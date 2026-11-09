/**
 * Independent Spotify recording identity from a PUBLIC track embed.
 *
 * The anonymous web-player token endpoint now returns 403 for some hosts.
 * Spotify's track embed ships server-rendered metadata bound to the exact
 * track URI. Never extract or reuse its session access tokens.
 *
 * This is an optional, version-sensitive public-page adapter: fail closed
 * if Spotify changes its shape, the HTTP response is unexpected, or the
 * source track ID differs. Media bytes are never requested.
 */
import axios, { type AxiosInstance } from "axios";

const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const MAX_HTML_BYTES = 1024 * 1024;
const MAX_DURATION_MS = 8 * 60 * 60 * 1000;
const MARKER = /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi;

type Identity = {
    spotifyId: string;
    title: string;
    artist: string;
    durationMs: number;
    isrc: null;
};
export type SpotifyEmbedEvidence =
    | { state: "ready"; track: Identity }
    | { state: "unavailable" | "identity_mismatch" };

type Get = Pick<AxiosInstance, "get">;

function object(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Pure, strict parser. Reject duplicated bootstrap scripts and mismatched IDs. */
export function parseSpotifyTrackEmbed(
    html: unknown, expectedId: string,
): SpotifyEmbedEvidence {
    if (!SPOTIFY_ID.test(expectedId) || typeof html !== "string" ||
        Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) return { state: "unavailable" };
    MARKER.lastIndex = 0;
    const first = MARKER.exec(html);
    if (!first || MARKER.exec(html)) return { state: "unavailable" };
    try {
        const next = JSON.parse(first[1]);
        if (!object(next) || !object(next.props) ||
            !object(next.props.pageProps) ||
            !object(next.props.pageProps.state) ||
            !object(next.props.pageProps.state.data) ||
            !object(next.props.pageProps.state.data.entity)) {
            return { state: "unavailable" };
        }
        const entity = next.props.pageProps.state.data.entity;
        if (entity.type !== "track") return { state: "unavailable" };
        // Reject incorrect or self-inconsistent track identity, not a fallback.
        if (entity.uri !== `spotify:track:${expectedId}` ||
            (entity.id !== undefined && entity.id !== expectedId)) {
            return { state: "identity_mismatch" };
        }
        const title = typeof entity.title === "string" ? entity.title.trim()
            : typeof entity.name === "string" ? entity.name.trim() : "";
        const artist = typeof entity.subtitle === "string" ?
            entity.subtitle.trim() : "";
        const durationMs = entity.duration;
        if (title.length < 1 || title.length > 300 ||
            artist.length < 1 || artist.length > 300 ||
            !Number.isSafeInteger(durationMs) || durationMs < 1000 ||
            durationMs > MAX_DURATION_MS ||
            /[\u0000-\u001f\u007f]/.test(title + artist)) {
            return { state: "unavailable" };
        }
        if (typeof entity.title === "string" && typeof entity.name === "string" &&
            entity.title.trim() !== entity.name.trim()) {
            return { state: "identity_mismatch" };
        }
        return {
            state: "ready",
            track: { spotifyId: expectedId, title, artist, durationMs, isrc: null },
        };
    } catch {
        return { state: "unavailable" };
    }
}

/** Fixed trusted host, exact validated ID, no redirects, 8-second timeout. */
export async function getSpotifyTrackEmbed(
    spotifyId: string,
    http: Get = axios,
): Promise<SpotifyEmbedEvidence> {
    if (!SPOTIFY_ID.test(spotifyId)) return { state: "unavailable" };
    try {
        const response = await http.get(
            `https://open.spotify.com/embed/track/${spotifyId}`, {
                responseType: "text",
                timeout: 8000,
                maxRedirects: 0,
                maxContentLength: MAX_HTML_BYTES,
                headers: {
                    Accept: "text/html",
                    "User-Agent": "Mozilla/5.0 (compatible; KimaHub/1.0)",
                },
            },
        );
        if (response.status !== 200 ||
            !/text\/html/i.test(String(response.headers?.["content-type"] || ""))) {
            return { state: "unavailable" };
        }
        return parseSpotifyTrackEmbed(response.data, spotifyId);
    } catch {
        return { state: "unavailable" };
    }
}
