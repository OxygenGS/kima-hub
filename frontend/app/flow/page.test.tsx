import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FlowPage from "./page";

const fake = vi.hoisted(() => ({
    user: { id: "alice" } as { id: string } | null,
    currentTrack: { id: "seed", title: "Seed", duration: 180, artist: { name: "A" }, album: { title: "B" } } as { id: string; title: string; duration: number; artist: { name: string }; album: { title: string } } | null,
    playbackType: "track" as string | null,
    queue: [{ id: "seed" }] as { id: string }[],
    index: 0,
    playing: true,
    activeOperation: { type: "idle" } as { type: string; ownerId?: string; sessionId?: string },
    getPreview: vi.fn(),
    setFeedback: vi.fn(),
    clearFeedback: vi.fn(),
    playTracks: vi.fn(),
    setUpcoming: vi.fn(),
    resume: vi.fn(),
    setShuffle: vi.fn(),
    setRepeat: vi.fn(),
    setOperation: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: {
    getNovaFlowPreview: fake.getPreview,
    setNovaFlowFeedback: fake.setFeedback,
    clearNovaFlowFeedback: fake.clearFeedback,
} }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: fake.user }) }));
vi.mock("@/lib/i18n/language-context", () => ({ useLanguage: () => ({ locale: "en" }) }));
vi.mock("@/lib/audio-state-context", () => ({
    useAudioState: () => ({
        playbackType: fake.playbackType,
        activeOperation: fake.activeOperation,
        currentTrack: fake.currentTrack,
        queue: fake.queue,
        currentIndex: fake.index,
        setActiveOperation: fake.setOperation,
        setIsShuffle: fake.setShuffle,
        setRepeatMode: fake.setRepeat,
    }),
}));
vi.mock("@/lib/audio-playback-context", () => ({ useAudioPlayback: () => ({ isPlaying: fake.playing }) }));
vi.mock("@/lib/audio-controls-context", () => ({
    useAudioControls: () => ({
        playTracks: fake.playTracks,
        setUpcoming: fake.setUpcoming,
        resumeWithGesture: fake.resume,
    }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const example = {
    seedTrackId: "seed",
    tracks: [
        { id: "seed", title: "Seed song", duration: 180, reason: "seed",
            artist: { id: "a", name: "Artist A" }, album: { id: "a1", title: "Album A", coverArt: null } },
        { id: "next", title: "Recommended song", duration: 210, reason: "similar",
            artist: { id: "b", name: "Artist B" }, album: { id: "b1", title: "Album B", coverArt: null } },
    ],
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    vi.clearAllMocks();
    fake.user = { id: "alice" };
    fake.currentTrack = { id: "seed", title: "Seed", duration: 180, artist: { name: "A" }, album: { title: "B" } };
    fake.playbackType = "track";
    fake.queue = [{ id: "seed" }];
    fake.index = 0;
    fake.playing = true;
    fake.activeOperation = { type: "idle" };
    fake.getPreview.mockResolvedValue(example);
    fake.setFeedback.mockResolvedValue({ trackId: "next", feedback: "more" });
    fake.clearFeedback.mockResolvedValue({ trackId: "next", feedback: null });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(async () => {
    await act(async () => { root.unmount(); });
    host.remove();
});
async function renderFlow() {
    await act(async () => { root.render(<FlowPage />); });
    await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 350));
        await Promise.resolve();
    });
}

describe("NOVA Flow guided listening", () => {
    it("prepares a library preview without automatically starting audio", async () => {
        await renderFlow();
        expect(fake.getPreview).toHaveBeenCalledWith(
            expect.objectContaining({ seedTrackId: "seed", style: "balanced", energy: 55, discovery: 35 }),
            expect.any(AbortSignal),
        );
        expect(host.textContent).toContain("Recommended song");
        expect(fake.playTracks).not.toHaveBeenCalled();
        expect(fake.setUpcoming).not.toHaveBeenCalled();
    });

    it("keeps current audio playing and replaces only upcoming songs on an explicit click", async () => {
        await renderFlow();
        const button = [...host.querySelectorAll("button")].find(b => b.textContent?.includes("Keep playing current song"));
        expect(button).toBeDefined();
        await act(async () => { button!.click(); });
        expect(fake.setUpcoming).toHaveBeenCalledOnce();
        expect(fake.setUpcoming.mock.calls[0][0].map((t: { id: string }) => t.id)).toEqual(["next"]);
        expect(fake.playTracks).not.toHaveBeenCalled();
        expect(fake.setShuffle).toHaveBeenCalledWith(false);
        expect(fake.setRepeat).toHaveBeenCalledWith("off");
        expect(fake.setOperation).toHaveBeenCalledWith(expect.objectContaining({
            type: "flow", ownerId: "alice", sourceTrackId: "seed", style: "balanced",
            energy: 55, discovery: 35, trackIds: ["seed", "next"],
            recentTrackIds: ["seed", "next"],
        }));
    });

    it("starts the existing player only after a local gesture for an idle listener", async () => {
        fake.currentTrack = null;
        fake.playbackType = null;
        fake.queue = [];
        await renderFlow();
        expect(fake.playTracks).not.toHaveBeenCalled();
        const button = [...host.querySelectorAll("button")].find(b => b.textContent?.includes("Start Flow"));
        expect(button).toBeDefined();
        await act(async () => { button!.click(); });
        expect(fake.playTracks).toHaveBeenCalledOnce();
        expect(fake.playTracks.mock.calls[0][0].map((t: { id: string }) => t.id)).toEqual(["seed", "next"]);
        expect(fake.setOperation).toHaveBeenCalledWith(expect.objectContaining({ type: "flow", ownerId: "alice" }));
    });

    it("allows the listener to turn off auto-refill without pausing their music", async () => {
        fake.activeOperation = { type: "flow", ownerId: "alice", sessionId: "session" };
        await renderFlow();
        const stop = [...host.querySelectorAll("button")].find(b => b.textContent?.includes("Stop automatic Flow"));
        expect(stop).toBeDefined();
        await act(async () => { stop!.click(); });
        expect(fake.setOperation).toHaveBeenCalledWith({ type: "idle" });
        expect(fake.playTracks).not.toHaveBeenCalled();
        expect(fake.setUpcoming).not.toHaveBeenCalled();
    });

    it("saves More like this for this track without starting or seeking audio", async () => {
        await renderFlow();
        const button = host.querySelector('button[aria-label="More like this: Recommended song"]') as HTMLButtonElement;
        expect(button).toBeTruthy();
        await act(async () => { button.click(); await Promise.resolve(); });
        expect(fake.setFeedback).toHaveBeenCalledWith("next", "more");
        expect(fake.playTracks).not.toHaveBeenCalled();
        expect(fake.setUpcoming).not.toHaveBeenCalled();
        expect(fake.clearFeedback).not.toHaveBeenCalled();
    });

    it("sends Less like this independently of Favorites", async () => {
        await renderFlow();
        const button = host.querySelector('button[aria-label="Less like this: Recommended song"]') as HTMLButtonElement;
        expect(button).toBeTruthy();
        await act(async () => { button.click(); await Promise.resolve(); });
        expect(fake.setFeedback).toHaveBeenCalledWith("next", "less");
        expect(fake.playTracks).not.toHaveBeenCalled();
    });

    it("allows a second click to undo a selected personal preference", async () => {
        fake.getPreview.mockResolvedValue({
            ...example, tracks: example.tracks.map(track =>
                track.id === "next" ? { ...track, feedback: "more" } : track),
        });
        await renderFlow();
        const button = host.querySelector('button[aria-label="More like this: Recommended song"]') as HTMLButtonElement;
        expect(button.getAttribute("aria-pressed")).toBe("true");
        await act(async () => { button.click(); await Promise.resolve(); });
        expect(fake.clearFeedback).toHaveBeenCalledWith("next");
        expect(fake.setFeedback).not.toHaveBeenCalled();
        expect(fake.playTracks).not.toHaveBeenCalled();
    });

    it("does not show the previous account's preview after a user switch", async () => {
        await renderFlow();
        expect(host.textContent).toContain("Seed song");
        fake.user = { id: "bob" };
        fake.getPreview.mockImplementation(() => new Promise(() => {}));
        await act(async () => { root.render(<FlowPage />); });
        expect(host.textContent).not.toContain("Seed song");
    });
});
