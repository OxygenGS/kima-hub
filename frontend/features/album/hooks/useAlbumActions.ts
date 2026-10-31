import { api } from "@/lib/api";
import { useAudioControls } from "@/lib/audio-context";
import { useDownloadContext } from "@/lib/download-context";
import { shuffleArray } from "@/lib/shuffle";
import { notify } from "@/lib/notify";
import { useLanguage } from "@/lib/i18n/language-context";
import { isMbid } from "@/lib/mbid";
import { Album, Track } from "../types";
import { isPlayableAlbumTrack, playableAlbumTracks } from "../lib/availableTracks";

export const toQueueTrack = (track: Track, album: Album) => ({
    id: track.id,
    title: track.title,
    duration: track.duration,
    artist: {
        name: track.artist?.name || album.artist?.name || "",
        id: track.artist?.id || album.artist?.id || "",
    },
    album: {
        title: track.album?.title || album.title,
        id: track.album?.id || album.id,
        coverArt: track.album?.coverArt || album.coverArt || album.coverUrl,
    },
});

export function useAlbumActions() {
    const { t } = useLanguage();
    const {
        playTracks,
        playTrack: playTrackAudio,
        addToQueue: addToQueueAudio,
    } = useAudioControls();
    const { addPendingDownload, isPendingByMbid } = useDownloadContext();

    const requireAlbum = (album: Album | null): album is Album => {
        if (!album) notify.error(t("Album data not available"));
        return !!album;
    };

    const playAlbum = (album: Album | null, startIndex: number = 0) => {
        if (!requireAlbum(album)) return;
        const tracks = playableAlbumTracks(album);
        if (!tracks.length) return;
        playTracks(tracks.map((t) => toQueueTrack(t, album)), Math.min(Math.max(startIndex, 0), tracks.length - 1));
    };

    const shufflePlay = (album: Album | null) => {
        if (!requireAlbum(album)) return;
        const tracks = playableAlbumTracks(album);
        if (!tracks.length) return;
        playTracks(shuffleArray(tracks.map((t) => toQueueTrack(t, album))), 0);
    };

    const playTrack = (track: Track, album: Album | null) => {
        if (!requireAlbum(album) || !isPlayableAlbumTrack(track, album)) return;
        playTrackAudio(toQueueTrack(track, album));
    };

    const addToQueue = (track: Track, album: Album | null) => {
        if (!requireAlbum(album) || !isPlayableAlbumTrack(track, album)) return;
        addToQueueAudio(toQueueTrack(track, album));
    };

    const downloadAlbum = async (album: Album | null, e?: React.MouseEvent) => {
        if (e) {
            e.stopPropagation();
        }

        if (!requireAlbum(album)) return;

        const mbid = [album.rgMbid, album.mbid].find(isMbid);
        if (!mbid) {
            notify.error(t("Can't download this album"), { message: t("It has no MusicBrainz ID.") });
            return;
        }

        if (isPendingByMbid(mbid)) return;

        try {
            addPendingDownload("album", album.title, mbid);
            await api.downloadAlbum(
                album.artist?.name || "Unknown Artist",
                album.title,
                mbid
            );
        } catch {
            notify.error(t("Failed to start album download"));
        }
    };

    return {
        playAlbum,
        shufflePlay,
        playTrack,
        addToQueue,
        downloadAlbum,
    };
}
