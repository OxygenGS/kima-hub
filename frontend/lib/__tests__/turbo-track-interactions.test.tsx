import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/language-context", () => ({
    useLanguage: () => ({ locale: "en", t: (text: string) => text }),
}));

import { TrackList } from "@/features/album/components/TrackList";
import { PopularTracks } from "@/features/artist/components/PopularTracks";
import type { Album, Track } from "@/features/album/types";

// React's act() ensures effects commit before click handlers are exercised.
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const album: Album = {
    id: "album-one",
    title: "The Album",
    artist: { id: "artist-one", name: "The Band" },
    owned: true,
};

function renderAlbumTrack(
    track: Track,
    addToQueue: (track: Track) => void,
    color = "#fca200",
) {
    act(() => root.render(
        <TrackList
            tracks={[track]}
            album={album}
            source="library"
            currentTrackId={track.id}
            colors={{
                vibrant: color,
                darkVibrant: "#111111",
                lightVibrant: "#eeeeee",
                muted: "#777777",
                darkMuted: "#333333",
                lightMuted: "#aaaaaa",
            }}
            onPlayTrack={vi.fn()}
            onAddToQueue={addToQueue}
            onAddToPlaylist={vi.fn()}
            previewTrack={null}
            previewPlaying={false}
            onPreview={vi.fn()}
        />
    ));
}

describe("Project Turbo album-track interactions", () => {
    it("updates metadata without keeping a stale row with the same track ID", () => {
        const queue = vi.fn();
        const first: Track = { id: "song-one", title: "Original title", duration: 170, trackNo: 1, playCount: 3 };
        renderAlbumTrack(first, queue);
        expect(host.textContent).toContain("Original title");

        renderAlbumTrack({ ...first, title: "Corrected title", playCount: 7 }, queue);
        expect(host.textContent).toContain("Corrected title");
        expect(host.textContent).not.toContain("Original title");
        expect(host.textContent).toContain("7");
    });

    it("calls the latest playlist/queue callback even when the row remains memoized", () => {
        const first = vi.fn();
        const second = vi.fn();
        const track: Track = { id: "song-one", title: "Play me", duration: 170, trackNo: 1 };
        renderAlbumTrack(track, first);
        const queueButton = host.querySelector('button[aria-label="Add to queue"]') as HTMLButtonElement;
        expect(queueButton).not.toBeNull();
        expect(queueButton.className).toContain("min-h-11");
        act(() => queueButton.click());
        expect(first).toHaveBeenCalledOnce();

        // Only the callback changes; unchanged rows must use the new action.
        renderAlbumTrack(track, second);
        act(() => (host.querySelector('button[aria-label="Add to queue"]') as HTMLButtonElement).click());
        expect(first).toHaveBeenCalledOnce();
        expect(second).toHaveBeenCalledOnce();
    });

    it("refreshes the active row's accent after the album palette becomes available", () => {
        const track: Track = { id: "song-one", title: "Palette song", duration: 80 };
        renderAlbumTrack(track, vi.fn(), "#ff0000");
        const row = host.querySelector("[data-track-row]") as HTMLElement;
        expect(row.style.borderLeftColor).toBe("#ff0000");
        renderAlbumTrack(track, vi.fn(), "#00ff00");
        expect((host.querySelector("[data-track-row]") as HTMLElement).style.borderLeftColor).toBe("#00ff00");
    });
});

describe("UI 2.0 popular-track accessibility", () => {
    it("allows keyboard activation of a focused track row and exposes a 44px play control", () => {
        const play = vi.fn();
        act(() => root.render(
            <PopularTracks
                tracks={[{ id: "song-one", title: "Keyboard song", duration: 120, album: { id: "album-one", title: "Album" } }]}
                artist={{ id: "artist-one", name: "The Band" }}
                currentTrackId={undefined}
                onPlayTrack={play}
                previewTrack={null}
                previewPlaying={false}
                onPreview={vi.fn()}
            />
        ));
        const row = host.querySelector("[data-track-row]") as HTMLElement;
        expect(row).not.toBeNull();
        expect(row.tabIndex).toBe(0);
        const playButton = row.querySelector('button[aria-label="Play"]') as HTMLButtonElement;
        expect(playButton.className).toContain("w-11");
        act(() => row.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
        expect(play).toHaveBeenCalledOnce();
    });
});
