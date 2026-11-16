import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FlowPage from "./page";

const fake = vi.hoisted(() => ({
    user: { id: "alice" } as { id: string } | null,
    currentTrack: { id: "seed", title: "Seed", duration: 180, artist: { name: "A" }, album: { title: "B" } } as any,
    playbackType: "track" as string | null,
    queue: [{ id: "seed" }] as { id: string }[],
    index: 0,
    playing: true,
    getPreview: vi.fn(),
    playTracks: vi.fn(),
    setUpcoming: vi.fn(),
    resume: vi.fn(),
    setShuffle: vi.fn(),
    setOperation: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: { getNovaFlowPreview: fake.getPreview } }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: fake.user }) }));
vi.mock("@/lib/i18n/language-context", () => ({ useLanguage: () => ({ locale: "en" }) }));
vi.mock("@/lib/audio-state-context", () => ({
    useAudioState: () => ({
        playbackType: fake.playbackType,
        currentTrack: fake.currentTrack,
        queue: fake.queue,
        currentIndex: fake.index,
        setActiveOperation: fake.setOperation,
        setIsShuffle: fake.setShuffle,
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
    fake.getPreview.mockResolvedValue(example);
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
        expect(fake.setOperation).toHaveBeenCalledWith({ type: "idle" });
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
