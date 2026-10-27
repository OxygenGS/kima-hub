import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/language-context", () => ({
    useLanguage: () => ({ locale: "en", t: (key: string) => key }),
}));
vi.mock("@/lib/audio-state-context", () => ({
    useAudioState: () => ({ currentTrack: null }),
}));
vi.mock("@/components/ui/PlaylistSelector", () => ({
    PlaylistSelector: () => null,
}));
vi.mock("@/components/ui/CachedImage", () => ({
    CachedImage: () => null,
}));

import { LibraryTabs } from "@/features/library/components/LibraryTabs";
import { Pagination } from "@/components/ui/Pagination";
import { TracksList } from "@/features/library/components/TracksList";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;

function render(node: React.ReactNode) {
    act(() => root.render(<>{node}</>));
}

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("library navigation intent and mobile controls", () => {
    it("warms an inactive tab on hover without switching; click still navigates", () => {
        const intent = vi.fn();
        const change = vi.fn();
        render(<LibraryTabs activeTab="artists" onTabIntent={intent} onTabChange={change} />);
        const button = Array.from(host.querySelectorAll("button")).find(el => el.textContent === "Albums")!;
        act(() => button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
        expect(intent).toHaveBeenCalledWith("albums");
        expect(change).not.toHaveBeenCalled();
        act(() => button.click());
        expect(change).toHaveBeenCalledWith("albums");
    });

    it("warms next page on focus, but never when already at the last page", () => {
        const intent = vi.fn();
        const change = vi.fn();
        render(<Pagination label="Artists" currentPage={2} totalPages={4}
            onPageChange={change} onNextPageIntent={intent} />);
        const next = host.querySelector('button[aria-label="Next page"]') as HTMLButtonElement;
        act(() => next.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
        expect(intent).toHaveBeenCalledOnce();
        expect(change).not.toHaveBeenCalled();
        act(() => next.click());
        expect(change).toHaveBeenCalledWith(3);
        render(<Pagination label="Artists" currentPage={4} totalPages={4}
            onPageChange={change} onNextPageIntent={intent} />);
        const last = host.querySelector('button[aria-label="Next page"]') as HTMLButtonElement;
        expect(last.disabled).toBe(true);
        act(() => last.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
        expect(intent).toHaveBeenCalledOnce();
    });

    it("keeps mobile library-track actions visible and supports keyboard row activation", () => {
        const play = vi.fn();
        const queue = vi.fn();
        render(
            <TracksList
                tracks={[{ id: "t-1", title: "Readable song", duration: 180,
                    album: { id: "a-1", title: "Album", artist: { id: "ar-1", name: "Artist" } } }]}
                onPlay={play}
                onAddToQueue={queue}
                onAddToPlaylist={vi.fn()}
                onDelete={vi.fn()}
            />,
        );
        const row = host.querySelector('[data-tv-section="library-tracks"] [data-tv-card]') as HTMLElement;
        expect(row).not.toBeNull();
        expect(row.className).toContain("grid-cols-[44px_minmax(0,1fr)]");
        const queueButton = row.querySelector('button[aria-label="Add to queue"]') as HTMLButtonElement;
        expect(queueButton.className).toContain("opacity-100");
        expect(queueButton.className).toContain("w-11");
        act(() => queueButton.click());
        expect(queue).toHaveBeenCalledOnce();
        act(() => row.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
        expect(play).toHaveBeenCalledOnce();
        expect(play.mock.calls[0][1]).toBe(0);
    });
});
