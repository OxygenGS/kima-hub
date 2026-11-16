import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectDeviceBridge } from "@/components/player/ConnectDeviceBridge";

const fake = vi.hoisted(() => ({
    heartbeat: vi.fn(),
    ack: vi.fn(),
    incoming: vi.fn(),
    outgoing: vi.fn(),
    pause: vi.fn(),
    next: vi.fn(),
    previous: vi.fn(),
    playing: true,
    playbackType: "track" as string,
}));

vi.mock("@/lib/api", () => ({
    api: {
        connectHeartbeat: fake.heartbeat,
        acknowledgeConnectCommand: fake.ack,
        getIncomingConnectHandoff: fake.incoming,
        getOutgoingConnectHandoff: fake.outgoing,
    },
}));
vi.mock("@/lib/auth-context", () => ({
    useAuth: () => ({ user: { id: "alice" } }),
}));
vi.mock("@/lib/audio-state-context", () => ({
    useAudioState: () => ({
        playbackType: fake.playbackType,
        currentTrack: { id: "track1", title: "Test track" },
    }),
}));
vi.mock("@/lib/audio-playback-context", () => ({
    useAudioPlayback: () => ({ isPlaying: fake.playing, currentTime: 10 }),
}));
vi.mock("@/lib/audio-controls-context", () => ({
    useAudioControls: () => ({
        pause: fake.pause,
        next: fake.next,
        previous: fake.previous,
    }),
}));
vi.mock("@/lib/connect-device-id", () => ({
    getConnectDeviceId: () => "aa47d96f-37dd-4fd4-a550-74e10e2f7241",
    getConnectDeviceName: () => "Kima desktop",
}));
vi.mock("@/components/player/ConnectHandoffPrompt", () => ({
    ConnectHandoffPrompt: () => null,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    vi.clearAllMocks();
    fake.playing = true;
    fake.playbackType = "track";
    fake.heartbeat.mockResolvedValue({ command: null, ttlSeconds: 45 });
    fake.ack.mockResolvedValue({ command: { status: "handled" } });
    fake.incoming.mockResolvedValue({ handoff: null });
    fake.outgoing.mockResolvedValue({ handoff: null });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

async function mountBridge() {
    await act(async () => {
        root.render(<ConnectDeviceBridge />);
        await Promise.resolve();
        await Promise.resolve();
    });
}

describe("Kima Connect command handling receipts", () => {
    it("reports handled after invoking the local pause callback", async () => {
        fake.heartbeat.mockResolvedValue({
            command: { id: "cmd-1", type: "pause", createdAt: Date.now() },
            ttlSeconds: 45,
        });
        await mountBridge();
        expect(fake.pause).toHaveBeenCalledOnce();
        expect(fake.ack).toHaveBeenCalledWith(
            "cmd-1", "aa47d96f-37dd-4fd4-a550-74e10e2f7241", "handled",
        );
    });

    it("reports ignored without triggering track navigation when the player is paused", async () => {
        fake.playing = false;
        fake.heartbeat.mockResolvedValue({
            command: { id: "cmd-2", type: "next", createdAt: Date.now() },
            ttlSeconds: 45,
        });
        await mountBridge();
        expect(fake.next).not.toHaveBeenCalled();
        expect(fake.ack).toHaveBeenCalledWith(
            "cmd-2", "aa47d96f-37dd-4fd4-a550-74e10e2f7241", "ignored",
        );
    });

    it("wakes the addressed browser immediately without waiting for the periodic heartbeat", async () => {
        await mountBridge();
        expect(fake.heartbeat).toHaveBeenCalledTimes(1);
        await act(async () => {
            window.dispatchEvent(new CustomEvent("kima-connect-command-wake", {
                detail: { deviceId: "aa47d96f-37dd-4fd4-a550-74e10e2f7241" },
            }));
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(fake.heartbeat).toHaveBeenCalledTimes(2);
    });

    it("ignores wake hints addressed to other browsers and unregisters on unmount", async () => {
        await mountBridge();
        window.dispatchEvent(new CustomEvent("kima-connect-command-wake", {
            detail: { deviceId: "bb47d96f-37dd-4fd4-a550-74e10e2f7242" },
        }));
        expect(fake.heartbeat).toHaveBeenCalledTimes(1);

        act(() => root.unmount());
        window.dispatchEvent(new CustomEvent("kima-connect-command-wake", {
            detail: { deviceId: "aa47d96f-37dd-4fd4-a550-74e10e2f7241" },
        }));
        expect(fake.heartbeat).toHaveBeenCalledTimes(1);
        // Replace the already unmounted root so afterEach can always clean up.
        root = createRoot(host);
    });

    it("does not lose a wake hint delivered while a heartbeat is in flight", async () => {
        let releaseFirst!: (value: { command: null; ttlSeconds: number }) => void;
        fake.heartbeat.mockImplementationOnce(() => new Promise(resolve => { releaseFirst = resolve; }));
        await mountBridge();
        expect(fake.heartbeat).toHaveBeenCalledTimes(1);
        window.dispatchEvent(new CustomEvent("kima-connect-command-wake", {
            detail: { deviceId: "aa47d96f-37dd-4fd4-a550-74e10e2f7241" },
        }));
        expect(fake.heartbeat).toHaveBeenCalledTimes(1);

        await act(async () => {
            releaseFirst({ command: null, ttlSeconds: 45 });
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(fake.heartbeat).toHaveBeenCalledTimes(2);
    });

    it("never sends a receipt for an empty command heartbeat", async () => {
        await mountBridge();
        expect(fake.ack).not.toHaveBeenCalled();
        expect(fake.pause).not.toHaveBeenCalled();
    });
});
