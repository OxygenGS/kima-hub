import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueueSurface, type QueueSurfaceProps } from "@/features/queue/QueueSurface";
import { moveUpcomingTrack } from "@/features/queue/queuePresentation";
import type { Track } from "@/lib/audio-state-context";
import { translate } from "@/lib/i18n/translations";

const language = vi.hoisted(() => ({ locale: "en" as "en" | "nl" }));
vi.mock("@/lib/i18n/language-context", () => ({ useLanguage: () => ({ locale: language.locale, t: (key: string) => translate(language.locale, key) }) }));
vi.mock("@/lib/api", () => ({ api: { getCoverArtUrl: (cover: string) => `/art/${cover}` } }));
vi.mock("@/components/ui/CachedImage", () => ({ CachedImage: () => null }));
vi.mock("next/link", () => ({ default: ({ children, prefetch, ...props }: React.ComponentProps<"a"> & { prefetch?: boolean }) => <a {...props} data-prefetch={String(prefetch)}>{children}</a> }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { language.locale = "en"; host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });
const tracks: Track[] = [0, 1, 2, 3].map((index) => ({
    id: index > 1 ? "duplicate-id" : `track-${index}`, title: `Track ${index}`,
    duration: 180, artist: { id: "artist", name: "Original Artist" }, album: { id: "album", title: "Original Album" },
}));
function props(): QueueSurfaceProps { return { queue: tracks, currentIndex: 1, currentIsActive: true, isPlaying: true,
    onToggleCurrent: vi.fn(), onPlay: vi.fn(), onMove: vi.fn(), onRemove: vi.fn(), onClear: vi.fn(), onBrowse: vi.fn() }; }
function render(p: QueueSurfaceProps) { act(() => root.render(<QueueSurface {...p} />)); }
function action(label: string) { return host.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement; }

describe("queue presentation", () => {
    it("distinguishes history, the selected item and upcoming duplicate IDs by position", () => {
        const p = props(); render(p);
        expect(host.querySelectorAll("h1")).toHaveLength(1);
        expect(host.querySelector('[data-queue-index="0"] [aria-label^="Move"]')).toBeNull();
        expect(action("Move up: Track 2").disabled).toBe(true);
        expect(action("Move down: Track 3").disabled).toBe(true);
        act(() => { action("Play: Track 3").click(); action("Remove from queue: Track 2").click(); action("Move up: Track 3").click(); });
        expect(p.onPlay).toHaveBeenCalledWith(3); expect(p.onRemove).toHaveBeenCalledWith(2); expect(p.onMove).toHaveBeenCalledWith(3, -1);
    });
    it("uses the selected-item playback callback, without dispatching an upcoming item", () => {
        const p = props(); render(p); act(() => action("Pause").click());
        expect(p.onToggleCurrent).toHaveBeenCalledOnce(); expect(p.onPlay).not.toHaveBeenCalled();
        render({ ...p, currentIsActive: false });
        expect(host.textContent).toContain("Selected track"); expect(action("Play")).not.toBeNull();
        expect(action("Pause")).toBeNull();
    });
    it("only requests clearing and keeps the empty state free of stale current-track content", () => {
        const p = props(); render(p);
        const clear = Array.from(host.querySelectorAll("button")).find((button) => button.textContent === "Clear queue")!;
        act(() => clear.click()); expect(p.onClear).toHaveBeenCalledOnce(); expect(p.onRemove).not.toHaveBeenCalled();
        render({ ...p, queue: [] }); expect(host.textContent).toContain("No tracks in queue");
        expect(host.querySelector("[data-queue-index]")).toBeNull(); expect(action("Pause")).toBeNull();
        act(() => (host.querySelector("button") as HTMLButtonElement).click()); expect(p.onBrowse).toHaveBeenCalledOnce();
    });
    it("treats an absent selected index as an entirely upcoming queue", () => {
        render({ ...props(), currentIndex: -1, currentIsActive: false });
        expect(host.querySelectorAll("[data-queue-index]")).toHaveLength(4);
        expect(action("Move up: Track 0").disabled).toBe(true);
        expect(host.textContent).not.toContain("Now Playing");
    });
    it("retains metadata and indices while translating controls", () => {
        const p = props(); render(p); language.locale = "nl"; render(p);
        expect(host.textContent).toContain("Original Artist"); expect(host.textContent).toContain("Original Album");
        expect(host.querySelector("h1")?.textContent).toBe(translate("nl", "Queue"));
        act(() => action(`${translate("nl", "Play")}: Track 3`).click()); expect(p.onPlay).toHaveBeenCalledWith(3);
        expect(host.querySelector('a[href="/album/album"]')).not.toBeNull();
    });
    it("shows an end-of-queue state without inventing recommendations or extra items", () => {
        render({ ...props(), queue: [tracks[0]], currentIndex: 0 });
        expect(host.textContent).toContain("You have reached the end of the queue.");
        expect(host.querySelectorAll("[data-queue-index]")).toHaveLength(0);
    });
});

describe("upcoming-only reorder", () => {
    it("reorders by position, preserves duplicate IDs and leaves the input unchanged", () => {
        const before = [...tracks]; const reordered = moveUpcomingTrack(tracks, 1, 3, -1);
        expect(reordered).toEqual([tracks[0], tracks[1], tracks[3], tracks[2]]);
        expect(tracks).toEqual(before); expect(reordered).not.toBe(tracks);
    });
    it("never moves the current track, history or an upcoming item across the active boundary", () => {
        for (const [index, direction] of [[0, 1], [1, 1], [2, -1], [3, 1], [10, -1], [-1, 1]] as const) {
            expect(moveUpcomingTrack(tracks, 1, index, direction)).toBe(tracks);
        }
    });
    it("supports a queue with no selected item and rejects noninteger indices", () => {
        expect(moveUpcomingTrack(tracks, -1, 0, 1)).toEqual([tracks[1], tracks[0], tracks[2], tracks[3]]);
        expect(moveUpcomingTrack(tracks, 0, 2.5, 1)).toBe(tracks);
    });
});
