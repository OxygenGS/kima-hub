import type { Album, Track } from "../types";

/**
 * Album ownership and track availability are not interchangeable. A standalone
 * Soulseek single can be playable while its MusicBrainz album remains unowned.
 */
export function isPlayableAlbumTrack(track: Track, album: Album): boolean {
    if (track.isMissing) return false;
    if (track.isAvailable !== undefined) return track.isAvailable;
    return album.owned === true;
}

export function playableAlbumTracks(album: Album): Track[] {
    return (album.tracks || []).filter((track) => isPlayableAlbumTrack(track, album));
}
