/**
 * UI affordances only. The API middleware remains the authorization boundary.
 * Missing permission fields fail closed for regular listeners.
 */
export interface MusicPermissionUser {
    role: string;
    canRequestAlbums?: boolean;
    canDownloadTracks?: boolean;
}

export function getMusicPermissions(user: MusicPermissionUser | null) {
    return {
        canRequestAlbums: user?.role === "admin" || user?.canRequestAlbums === true,
        canDownloadTracks: user?.role === "admin" || user?.canDownloadTracks === true,
    };
}
