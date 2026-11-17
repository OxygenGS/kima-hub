import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlowContinuationBridge } from "@/components/player/FlowContinuationBridge";

const mocks = vi.hoisted(() => ({
    user: { id: "alice" } as { id: string } | null,
    state: {} as Record<string, unknown>,
    isPlaying: true,
    preview: vi.fn(),
    append: vi.fn(),
    setOperation: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ api: { getNovaFlowPreview: mocks.preview } }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/lib/audio-state-context", () => ({
    useAudioState: () => ({ ...mocks.state, setActiveOperation: mocks.setOperation }),
}));
vi.mock("@/lib/audio-playback-context", () => ({
    useAudioPlayback: () => ({ isPlaying: mocks.isPlaying }),
}));
vi.mock("@/lib/audio-controls-context", () => ({
    useAudioControls: () => ({ appendFlowTracks: mocks.append }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const track = (id: string) => ({
    id, title: id, duration: 180,
    artist: { id: "artist-" + id, name: "Artist" },
    album: { id: "album-" + id, title: "Album" },
});
const result = {
    seedTrackId: "t24",
    tracks: [
        { ...track("new"), reason: "similar" },
        { ...track("again"), reason: "new-to-you" },
    ],
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { id: "alice" };
    mocks.isPlaying = true;
    const queue = Array.from({ length: 25 }, (_, i) => track("t" + i));
    mocks.state = {
        queue, currentIndex: 19, currentTrack: queue[19],
        playbackType: "track", isShuffle: false, repeatMode: "off",
        activeOperation: {
            type: "flow", ownerId: "alice", sessionId: "session-one",
            sourceTrackId: "t0", style: "balanced", energy: 55, discovery: 35,
            trackIds: queue.map(t => t.id), recentTrackIds: queue.map(t => t.id),
        },
    };
    mocks.preview.mockResolvedValue(result);
    mocks.append.mockReturnValue(true);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(async () => {
    await act(async () => { root.unmount(); });
    host.remove();
});

async function render() {
    await act(async () => { root.render(<FlowContinuationBridge />); });
    await act(async () => { await Promise.resolve(); });
}

describe("Continuous Flow bridge", () => {
    it("previews and appends near the end but never calls the audio engine", async () => {
        await render();
        expect(mocks.preview).toHaveBeenCalledWith(
            expect.objectContaining({
                seedTrackId: "t24", limit: 20, style: "balanced",
                excludeTrackIds: expect.arrayContaining(["t0", "t24"]),
            }),
            expect.any(AbortSignal),
        );
        expect(mocks.append).toHaveBeenCalledWith(
            { sessionId: "session-one", ownerId: "alice", queueIds: Array.from({ length: 25 }, (_, i) => "t" + i) },
            expect.arrayContaining([expect.objectContaining({ id: "new" })]),
        );
        expect(mocks.setOperation).not.toHaveBeenCalled();
    });

    it("does not request music when paused or far from the queue tail", async () => {
        mocks.isPlaying = false;
        await render();
        expect(mocks.preview).not.toHaveBeenCalled();
        await act(async () => { root.unmount(); });
        root = createRoot(host);
        mocks.isPlaying = true;
        mocks.state.currentIndex = 3;
        mocks.state.currentTrack = (mocks.state.queue as { id: string }[])[3];
        await render();
        expect(mocks.preview).not.toHaveBeenCalled();
    });

    it("invalidates a manually reordered queue without overwriting it", async () => {
        let resolve!: (value: typeof result) => void;
        mocks.preview.mockImplementation(() => new Promise<typeof result>(done => { resolve = done; }));
        await render();
        const edited = [...(mocks.state.queue as { id: string }[])];
        [edited[20], edited[21]] = [edited[21], edited[20]];
        mocks.state.queue = edited;
        await render();
        expect(mocks.setOperation).toHaveBeenCalledOnce();
        expect(typeof mocks.setOperation.mock.calls[0][0]).toBe("function");
        expect(mocks.setOperation.mock.calls[0][0](mocks.state.activeOperation)).toEqual({ type: "idle" });
        await act(async () => { resolve(result); await Promise.resolve(); });
        expect(mocks.append).not.toHaveBeenCalled();
    });

    it("rejects late results after a browser session is replaced", async () => {
        let resolve!: (value: typeof result) => void;
        mocks.preview.mockImplementation(() => new Promise<typeof result>(done => { resolve = done; }));
        await render();
        mocks.state.activeOperation = {
            ...(mocks.state.activeOperation as Record<string, unknown>),
            sessionId: "session-two",
        };
        mocks.isPlaying = false;
        await render();
        await act(async () => { resolve(result); await Promise.resolve(); });
        expect(mocks.append).not.toHaveBeenCalled();
    });

    it("stops after an exhausted library rather than repeatedly re-requesting duplicates", async () => {
        mocks.preview.mockResolvedValue({ seedTrackId: "t24", tracks: [] });
        await render();
        expect(mocks.setOperation).toHaveBeenCalledOnce();
        expect(mocks.setOperation.mock.calls[0][0](mocks.state.activeOperation)).toEqual({ type: "idle" });
        expect(mocks.append).not.toHaveBeenCalled();
    });

    it("does not let another signed-in account continue this Flow", async () => {
        mocks.user = { id: "bob" };
        await render();
        expect(mocks.preview).not.toHaveBeenCalled();
        expect(mocks.setOperation).toHaveBeenCalledOnce();
    });
});
