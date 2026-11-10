/**
 * Read-only Lidarr manual import inspection for a pre-verified staged file.
 *
 * This is intentionally NOT a public API route. The caller must supply
 * a durable source receipt proven by the importer and a checked shared-mount
 * path; neither one may originate from browser input.
 *
 * A successful response authorizes NO import command or media mutation.
 */
import type { AxiosInstance } from "axios";
import {
    selectVerifiedLidarrImport,
    type VerifiedLidarrSource,
    type LidarrMatch,
} from "./downtifyLidarrHandoff";

const MAX_CANDIDATES = 1000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
export type LidarrInspection =
    | LidarrMatch
    | { state: "lidarr_unavailable" | "lidarr_incompatible" };

export async function inspectDowntifyLidarrStagedTrack(
    client: Pick<AxiosInstance, "get">,
    source: VerifiedLidarrSource,
): Promise<LidarrInspection> {
    // Source and path checks MUST precede any Lidarr request.
    const initial = selectVerifiedLidarrImport(source, []);
    if (initial.state === "unsafe_source" ||
        initial.state === "metadata_missing") return initial;
    try {
        const response = await client.get<unknown>("/api/v1/manualimport", {
            params: {
                folder: source.path,
                filterExistingFiles: true,
                replaceExistingFiles: false,
            },
            timeout: 15000,
            maxRedirects: 0,
            maxContentLength: MAX_RESPONSE_BYTES,
        });
        if (response.status !== 200 || !Array.isArray(response.data) ||
            response.data.length > MAX_CANDIDATES) {
            return { state: "lidarr_incompatible" };
        }
        // No filename/title is returned in error responses or logs.
        return selectVerifiedLidarrImport(source, response.data);
    } catch {
        return { state: "lidarr_unavailable" };
    }
}
