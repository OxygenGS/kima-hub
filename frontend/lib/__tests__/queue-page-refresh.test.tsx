import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QueuePage from "@/app/queue/page";
import type { QueueSurfaceProps } from "@/features/queue/QueueSurface";
import type { Track } from "@/lib/audio-state-context";

const state = vi.hoisted(() => ({
    isAuthenticated: true, isPlaying: false, playbackType: "track", currentIndex: 0,
    queue: [] as Track[], currentTrack: null as Track | null,
    pause: vi.fn(), resume: vi.fn(), play: vi.fn(), remove: vi.fn(), clear: vi.fn(), push: vi.fn(),
    surface: null as QueueSurfaceProps | null,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ isAuthenticated: state.isAuthenticated }) }));
vi.mock("@/lib/i18n/language-context", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock("@/lib/audio-context", () => ({
    useAudioState: () => ({ ...state, setQueue: (fn: (queue: Track[]) => Track[]) => { state.queue = fn(state.queue); } }),
    useAudioPlayback: () => ({ isPlaying: state.isPlaying }),
    useAudioControls: () => ({ playTracks: state.play, removeFromQueue: state.remove, clearQueue: state.clear, pause: state.pause, resumeWithGesture: state.resume }),
}));
vi.mock("@/features/queue/QueueSurface", () => ({ QueueSurface: (props: QueueSurfaceProps) => {
    state.surface = props;
    return <button type="button" data-clear onClick={props.onClear}>Clear</button>;
} }));
vi.mock("@/components/ui/ConfirmDialog", () => ({ ConfirmDialog: ({ isOpen, onClose, onConfirm }: { isOpen: boolean; onClose: () => void; onConfirm: () => void }) => (
    isOpen ? <div role="dialog"><button type="button" data-cancel onClick={onClose}>Cancel</button><button type="button" data-confirm onClick={onConfirm}>Confirm</button></div> : null
) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
function render() { act(() => root.render(<QueuePage />)); }
function click(selector: string) { act(() => (host.querySelector(selector) as HTMLButtonElement).click()); }
beforeEach(() => {
    vi.clearAllMocks(); state.isAuthenticated = true; state.isPlaying = false; state.playbackType = "track"; state.currentIndex = 0;
    state.queue = [0, 1, 2].map((index) => ({ id: `id-${index}`, title: `Title ${index}`, duration: 180, artist: { name: "Artist" }, album: { title: "Album" } }));
    state.currentTrack = state.queue[0]; state.surface = null;
    host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("queue page integration", () => {
    it("does not render queue data for a signed-out visitor", () => {
        state.isAuthenticated = false; render(); expect(state.push).toHaveBeenCalledWith("/login");
        expect(state.surface).toBeNull(); expect(host.querySelector("button")).toBeNull();
    });
    it("requires explicit confirmation to clear and supports cancellation", () => {
        render(); click("[data-clear]"); expect(state.clear).not.toHaveBeenCalled();
        click("[data-cancel]"); expect(state.clear).not.toHaveBeenCalled(); expect(host.querySelector('[role="dialog"]')).toBeNull();
        click("[data-clear]"); click("[data-confirm]"); expect(state.clear).toHaveBeenCalledOnce();
    });
    it("resumes or pauses the active item instead of restarting the queue", () => {
        render(); act(() => state.surface!.onToggleCurrent()); expect(state.resume).toHaveBeenCalledOnce(); expect(state.play).not.toHaveBeenCalled();
        state.isPlaying = true; render(); act(() => state.surface!.onToggleCurrent()); expect(state.pause).toHaveBeenCalledOnce();
    });
    it("starts the selected music item when a different media type was active", () => {
        state.playbackType = "podcast"; state.isPlaying = true; render();
        expect(state.surface?.currentIsActive).toBe(false);
        act(() => state.surface!.onToggleCurrent()); expect(state.play).toHaveBeenCalledWith(state.queue, 0);
        expect(state.pause).not.toHaveBeenCalled(); expect(state.resume).not.toHaveBeenCalled();
    });
    it("moves only upcoming positions without changing the active track or starting audio", () => {
        render(); const playing = state.currentTrack; const before = [...state.queue];
        act(() => state.surface!.onMove(2, -1)); expect(state.queue).toEqual([before[0], before[2], before[1]]);
        expect(state.currentTrack).toBe(playing); expect(state.currentIndex).toBe(0); expect(state.play).not.toHaveBeenCalled();
        act(() => state.surface!.onRemove(2)); expect(state.remove).toHaveBeenCalledWith(2);
    });
});
