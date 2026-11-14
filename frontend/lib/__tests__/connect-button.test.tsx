import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectButton } from "@/components/player/ConnectButton";

const fake = vi.hoisted(() => ({
    getDevices: vi.fn(),
    sendCommand: vi.fn(),
    offerHandoff: vi.fn(),
    updateHandoff: vi.fn(),
    playing: true,
    currentTime: 42,
    authUser: { id: "alice" } as { id: string },
}));

vi.mock("@/lib/api", () => ({
    api: { getConnectDevices: fake.getDevices, sendConnectCommand: fake.sendCommand, offerConnectHandoff: fake.offerHandoff, updateConnectHandoff: fake.updateHandoff },
}));
vi.mock("@/lib/auth-context", () => ({
    useAuth: () => ({ user: fake.authUser }),
}));
vi.mock("@/lib/i18n/language-context", () => ({
    useLanguage: () => ({ locale: "en" }),
}));
vi.mock("@/lib/audio-state-context", () => ({
    useAudioState: () => ({
        playbackType: "track",
        currentIndex: 0,
        currentTrack: { id: "cml123abc", title: "Local", duration: 200 },
        queue: [{ id: "cml123abc", title: "Local", duration: 200 }],
    }),
}));
vi.mock("@/lib/audio-playback-context", () => ({
    useAudioPlayback: () => ({ isPlaying: fake.playing, currentTime: fake.currentTime }),
}));
vi.mock("@/lib/connect-device-id", () => ({
    getConnectDeviceId: () => "aa47d96f-37dd-4fd4-a550-74e10e2f7241",
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const own = {
    id: "aa47d96f-37dd-4fd4-a550-74e10e2f7241", name: "My laptop",
    status: "paused", trackTitle: "Local", lastSeen: 1000,
};
const remote = {
    id: "bb47d96f-37dd-4fd4-a550-74e10e2f7242", name: "Kima mobile",
    status: "playing", trackTitle: "Remote song", lastSeen: 1000,
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    vi.clearAllMocks();
    fake.authUser = { id: "alice" };
    fake.playing = true;
    fake.currentTime = 42;
    fake.getDevices.mockResolvedValue({ devices: [own, remote] });
    fake.sendCommand.mockResolvedValue({ queued: true, commandId: "cmd1" });
    fake.offerHandoff.mockResolvedValue({ id: "handoff1", expiresAt: 12345 });
    fake.updateHandoff.mockResolvedValue({ status: "cancelled" });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

const open = async () => {
    act(() => root.render(<ConnectButton />));
    await act(async () => {
        (host.querySelector('[aria-label="Kima Connect"]') as HTMLButtonElement).click();
        await Promise.resolve();
    });
};

describe("Kima Connect device menu", () => {
    it("lists only returned devices and never provides remote buttons for this device", async () => {
        await open();
        expect(host.textContent).toContain("My laptop");
        expect(host.textContent).toContain("This device");
        expect(host.textContent).toContain("Kima mobile");
        expect(host.textContent).toContain("Remote song");
        expect(host.querySelectorAll('[aria-label^="Pause - "]')).toHaveLength(1);
        expect(host.querySelector('[aria-label="Pause - Kima mobile"]')).not.toBeNull();
        expect(host.querySelector('[aria-label="Pause - My laptop"]')).toBeNull();
    });

    it("queues a remote command without claiming to have played audio", async () => {
        await open();
        await act(async () => {
            (host.querySelector('[aria-label="Pause - Kima mobile"]') as HTMLButtonElement).click();
            await Promise.resolve();
        });
        expect(fake.sendCommand).toHaveBeenCalledWith(remote.id, "pause");
        expect(host.textContent).toContain("Command queued");
    });

    it("does not allow remote transport actions on a paused browser", async () => {
        fake.getDevices.mockResolvedValue({ devices: [own, { ...remote, status: "paused" }] });
        await open();
        const pause = host.querySelector('[aria-label="Pause - Kima mobile"]') as HTMLButtonElement;
        const next = host.querySelector('[aria-label="Next track - Kima mobile"]') as HTMLButtonElement;
        expect(pause.disabled).toBe(true);
        expect(next.disabled).toBe(true);
        expect(fake.sendCommand).not.toHaveBeenCalled();
    });

    it("never displays the previous account's devices after switching accounts", async () => {
        await open();
        expect(host.textContent).toContain("Kima mobile");

        fake.authUser = { id: "bob" };
        fake.getDevices.mockImplementation(() => new Promise(() => {}));
        await act(async () => {
            root.render(<ConnectButton />);
            await Promise.resolve();
        });

        expect(host.textContent).not.toContain("Kima mobile");
        expect(host.querySelector('[aria-label="Pause - Kima mobile"]')).toBeNull();
    });

    it("offers the current track, queue and position without stopping the source", async () => {
        await open();
        await act(async () => {
            (host.querySelector('[title="Offer playback transfer to this device"]') as HTMLButtonElement).click();
            await Promise.resolve();
        });
        expect(fake.offerHandoff).toHaveBeenCalledWith({
            sourceDeviceId: own.id,
            targetDeviceId: remote.id,
            trackIds: ["cml123abc"],
            currentIndex: 0,
            positionSeconds: 42,
        });
        expect(host.textContent).toContain("Confirm playback on the other device");
        expect(fake.sendCommand).not.toHaveBeenCalled();
    });

    it("allows cancelling an offered transfer before the receiver accepts", async () => {
        await open();
        await act(async () => {
            (host.querySelector('[title="Offer playback transfer to this device"]') as HTMLButtonElement).click();
            await Promise.resolve();
        });
        expect(host.textContent).toContain("Cancel pending transfer");
        await act(async () => {
            const button = Array.from(host.querySelectorAll("button"))
                .find(b => b.textContent?.includes("Cancel pending transfer"));
            button?.click();
            await Promise.resolve();
        });
        expect(fake.updateHandoff).toHaveBeenCalledWith("handoff1", own.id, "cancelled");
        expect(host.textContent).toContain("Transfer cancelled");
    });

    it("disables transfer if no audio is currently playing", async () => {
        fake.playing = false;
        await open();
        expect((host.querySelector('[title="Offer playback transfer to this device"]') as HTMLButtonElement).disabled).toBe(true);
        expect(fake.offerHandoff).not.toHaveBeenCalled();
    });

    it("does not send an instruction when the user only opens the menu", async () => {
        await open();
        expect(fake.sendCommand).not.toHaveBeenCalled();
    });
});
