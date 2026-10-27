import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/audio-context", () => ({
    useAudioControls: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
    api: { getAlbum: vi.fn() },
}));

import { api } from "@/lib/api";
import { loadAllOwnedTracks } from "./useArtistActions";
import type { Artist, Album } from "../types";

const artist: Artist = { id: "artist-1", name: "Band" };
const getAlbum = vi.mocked(api.getAlbum);

beforeEach(() => {
    getAlbum.mockReset();
});

describe("artist Play All / Shuffle track loading", () => {
    it("reuses tracks already included in the artist response without refetching albums", async () => {
        const albums: Album[] = [
            {
                id: "album-1", title: "First", owned: true, year: 2026,
                tracks: [
                    { id: "track-2", title: "Second", duration: 122, trackNo: 2 },
                    { id: "track-1", title: "First", duration: 121, trackNo: 1 },
                ],
            },
            {
                id: "album-2", title: "Older", owned: true, year: 2024,
                tracks: [{ id: "track-3", title: "Older", duration: 200, trackNo: 1 }],
            },
            { id: "unowned", title: "Not in library", owned: false, year: 2027 },
        ];

        const tracks = await loadAllOwnedTracks(artist, albums);
        expect(tracks.map((track) => track.id)).toEqual(["track-1", "track-2", "track-3"]);
        expect(tracks[0].trackNumber).toBe(1);
        expect(tracks[0].album.id).toBe("album-1");
        expect(getAlbum).not.toHaveBeenCalled();
    });

    it("fetches only albums whose cached artist data lacks playable tracks", async () => {
        const albums: Album[] = [
            {
                id: "cached", title: "Cached", owned: true, year: 2026,
                tracks: [{ id: "cached-track", title: "Cached Song", duration: 99, trackNo: 1 }],
            },
            { id: "missing", title: "Missing details", owned: true, year: 2025 },
        ];
        getAlbum.mockResolvedValue({
            tracks: [{ id: "fetched-track", title: "Fetched Song", duration: 101, trackNo: 4 }],
        });

        const tracks = await loadAllOwnedTracks(artist, albums);
        expect(tracks.map((track) => track.id)).toEqual(["cached-track", "fetched-track"]);
        expect(tracks[1].trackNumber).toBe(4);
        expect(getAlbum).toHaveBeenCalledTimes(1);
        expect(getAlbum).toHaveBeenCalledWith("missing");
    });

    it("returns no tracks or requests when the artist owns no albums", async () => {
        expect(await loadAllOwnedTracks(artist, [
            { id: "unowned", title: "Discovery", owned: false },
        ])).toEqual([]);
        expect(getAlbum).not.toHaveBeenCalled();
    });
});
