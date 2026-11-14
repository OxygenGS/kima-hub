import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectHandoffPrompt } from "@/components/player/ConnectHandoffPrompt";

const fake = vi.hoisted(() => ({
    fetchTrack: vi.fn(),
    update: vi.fn(),
    playTracks: vi.fn(),
    dismiss: vi.fn(),
    observer: null as null | ((value: { generation: number; status: string; src: string | null }) => void),
    snapshot: { generation: 1, status: "paused", src: null as string | null },
}));

vi.mock("@/lib/api", () => ({
    api: {
        getTrack: fake.fetchTrack,
        getStreamUrl: (id: string) => "/api/library/tracks/" + id + "/stream?token=redacted",
        updateConnectHandoff: fake.update,
    },
}));
vi.mock("@/lib/audio-controls-context", () => ({
    useAudioControls: () => ({ playTracks: fake.playTracks }),
}));
vi.mock("@/lib/audio-controller-context", () => ({
    useAudioController: () => ({
        getSnapshot: () => fake.snapshot,
        subscribe: (fn: typeof fake.observer) => { fake.observer = fn; return () => { fake.observer = null; }; },
    }),
}));
vi.mock("@/lib/i18n/language-context", () => ({
    useLanguage: () => ({ locale: "en" }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const id = "aa47d96f-37dd-4fd4-a550-74e10e2f7241";
const offer = {
    id: "bb47d96f-37dd-4fd4-a550-74e10e2f7242",
    sourceDeviceId: id,
    targetDeviceId: "cc47d96f-37dd-4fd4-a550-74e10e2f7243",
    sourceName: "Kima desktop",
    trackTitle: "Music",
    sourceTrackId: "track123",
    trackIds: ["track123", "track456"],
    currentIndex: 0,
    positionSeconds: 37,
    createdAt: Date.now(),
    expiresAt: Date.now() + 100_000,
    status: "pending" as const,
};
const track = (id: string) => ({
    id, title: "Test", artist: { name: "Artist" }, album: { title: "Album" }, duration: 210,
});

let node: HTMLDivElement;
let root: Root;

beforeEach(() => {
    vi.clearAllMocks();
    fake.snapshot = { generation: 1, status: "paused", src: null };
    fake.observer = null;
    fake.fetchTrack.mockImplementation(async (trackId: string) => track(trackId));
    fake.update.mockResolvedValue({ status: "started" });
    node = document.createElement("div");
    document.body.appendChild(node);
    root = createRoot(node);
});
afterEach(() => {
    act(() => root.unmount());
    node.remove();
});

const renderPrompt = async (data = offer) => {
    await act(async () => {
        root.render(<ConnectHandoffPrompt handoff={data} deviceId={data.targetDeviceId} onDismiss={fake.dismiss} />);
        await Promise.resolve();
        await Promise.resolve();
    });
};

describe("consent-based Kima Connect handoff receiver", () => {
    it("prefetches the queue but never auto-plays or acknowledges before a click", async () => {
        await renderPrompt();
        expect(fake.fetchTrack).toHaveBeenCalledTimes(2);
        expect(node.textContent).toContain("Play music on this device?");
        expect(fake.playTracks).not.toHaveBeenCalled();
        expect(fake.update).not.toHaveBeenCalled();
    });

    it("plays synchronously on local approval, then waits for a matching playing generation", async () => {
        await renderPrompt();
        await act(async () => {
            (node.querySelector("button:not([disabled])") as HTMLButtonElement).click();
        });
        expect(fake.playTracks).toHaveBeenCalledWith(
            [track("track123"), track("track456")], 0, { seekTo: 37 },
        );
        expect(fake.update).not.toHaveBeenCalled();
        await act(async () => {
            fake.observer?.({ generation: 2, status: "playing", src: "/api/library/tracks/another/stream" });
            await Promise.resolve();
        });
        expect(fake.update).not.toHaveBeenCalled();
        await act(async () => {
            fake.snapshot = { generation: 2, status: "playing", src: "/api/library/tracks/track123/stream" };
            fake.observer?.(fake.snapshot);
            await Promise.resolve();
        });
        expect(fake.update).toHaveBeenCalledWith(offer.id, offer.targetDeviceId, "started");
        expect(fake.dismiss).toHaveBeenCalledOnce();
    });

    it("does not load tracks after the offer has expired", async () => {
        await renderPrompt({ ...offer, expiresAt: Date.now() - 100 });
        await act(async () => {
            (node.querySelector("button:not([disabled])") as HTMLButtonElement).click();
        });
        expect(fake.playTracks).not.toHaveBeenCalled();
        expect(fake.update).not.toHaveBeenCalled();
        expect(node.textContent).toContain("Transfer expired");
    });

    it("declines without touching the audio engine", async () => {
        await renderPrompt();
        await act(async () => {
            const button = Array.from(node.querySelectorAll("button")).find(b => b.textContent?.includes("Decline"));
            button?.click();
            await Promise.resolve();
        });
        expect(fake.playTracks).not.toHaveBeenCalled();
        expect(fake.update).toHaveBeenCalledWith(offer.id, offer.targetDeviceId, "declined");
    });

    it("blocks accept when a track is unavailable", async () => {
        fake.fetchTrack.mockRejectedValue(new Error("404"));
        await renderPrompt();
        expect(node.textContent).toContain("Transfer is blocked");
        expect((node.querySelector("button") as HTMLButtonElement).disabled).toBe(true);
        expect(fake.playTracks).not.toHaveBeenCalled();
    });
});
