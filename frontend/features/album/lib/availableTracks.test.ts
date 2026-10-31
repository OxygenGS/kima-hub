import { describe, expect, it } from "vitest";
import type { Album, Track } from "../types";
import { isPlayableAlbumTrack, playableAlbumTracks } from "./availableTracks";

const catalogAlbum: Album = {
    id: "musicbrainz-release-group",
    title: "The Kids Are Coming",
    owned: false,
    artist: { id: "tones", name: "Tones and I" },
};

const preview: Track = {
    id: "mb-2", title: "The Kids Are Coming", duration: 204, isAvailable: false,
};
const local: Track = {
    id: "real-local-id", title: "Dance Monkey", duration: 209,
    isAvailable: true, album: { id: "local-single-album", title: "Singles" },
};

describe("partial album ownership", () => {
    it("lets a matched Soulseek single play without owning the entire release", () => {
        const album = { ...catalogAlbum, tracks: [preview, local] };
        expect(isPlayableAlbumTrack(preview, album)).toBe(false);
        expect(isPlayableAlbumTrack(local, album)).toBe(true);
        expect(playableAlbumTracks(album).map(t => t.id)).toEqual(["real-local-id"]);
        expect(album.owned).toBe(false);
    });

    it("keeps normal library albums playable and honors an explicitly missing file", () => {
        const track: Track = { id: "local", title: "Song", duration: 200 };
        const album: Album = { ...catalogAlbum, owned: true, tracks: [track, { ...local, isAvailable: false }] };
        expect(playableAlbumTracks(album).map(t => t.id)).toEqual(["local"]);
    });

    it("does not enqueue a missing or preview row", () => {
        const album: Album = { ...catalogAlbum, tracks: [preview, { ...local, isMissing: true }] };
        expect(playableAlbumTracks(album)).toEqual([]);
    });
});
