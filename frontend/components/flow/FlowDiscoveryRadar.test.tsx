import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlowDiscoveryRadar } from "./FlowDiscoveryRadar";

const fake = vi.hoisted(() => ({
    discover: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
    api: { getNovaDiscovery: fake.discover },
}));
vi.mock("@/lib/i18n/language-context", () => ({
    useLanguage: () => ({ locale: "en" }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const response = {
    seedArtist: "My Artist",
    artists: [
        { name: "Another Artist", mbid: "550e8400-e29b-41d4-a716-446655440000", match: 0.86 },
        { name: "Independent", mbid: null, match: 0.78 },
    ],
    sourceFailed: false,
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    vi.clearAllMocks();
    fake.discover.mockResolvedValue(response);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(async () => {
    await act(async () => { root.unmount(); });
    host.remove();
});

async function mount(ownerId: string | null = "alice", seedTrackId: string | null = "track-1") {
    await act(async () => {
        root.render(<FlowDiscoveryRadar ownerId={ownerId} seedTrackId={seedTrackId} />);
    });
}
async function clickDiscover() {
    const button = [...host.querySelectorAll("button")].find(b => b.textContent?.includes("Find new artists"));
    expect(button).toBeDefined();
    await act(async () => { button!.click(); await Promise.resolve(); });
}

describe("NOVA Discovery Radar", () => {
    it("never sends remote discovery requests on mount, only explicit clicks", async () => {
        await mount();
        expect(host.textContent).toContain("Beyond your library");
        expect(fake.discover).not.toHaveBeenCalled();
        await clickDiscover();
        expect(fake.discover).toHaveBeenCalledWith("track-1", 8, expect.any(AbortSignal));
        expect(host.textContent).toContain("Another Artist");
        expect(host.textContent).toContain("Independent");
        const links = [...host.querySelectorAll("a[href]")].map(a => a.getAttribute("href"));
        expect(links).toContain("/artist/550e8400-e29b-41d4-a716-446655440000");
        expect(links).toContain("/artist/Independent");
    });

    it("does not leak recommendations to a different user after switching accounts", async () => {
        await mount();
        await clickDiscover();
        expect(host.textContent).toContain("Another Artist");
        await mount("bob", "track-1");
        expect(host.textContent).not.toContain("Another Artist");
        expect(fake.discover).toHaveBeenCalledOnce();
    });

    it("discards results that arrive after the user changes tracks", async () => {
        let release!: (value: typeof response) => void;
        fake.discover.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
        await mount();
        const button = [...host.querySelectorAll("button")].find(b => b.textContent?.includes("Find new artists"));
        await act(async () => { button!.click(); });
        await mount("alice", "track-2");
        await act(async () => { release(response); await Promise.resolve(); });
        expect(host.textContent).not.toContain("Another Artist");
    });

    it("uses source status instead of claiming invented discoveries", async () => {
        fake.discover.mockResolvedValueOnce({ seedArtist: "My Artist", artists: [], sourceFailed: true });
        await mount();
        await clickDiscover();
        expect(host.textContent).toContain("Some discovery sources are unavailable");
        expect(host.textContent).toContain("No confirmed new artists found");
        expect(host.querySelectorAll("a[href]")).toHaveLength(0);
    });

    it("cannot query without a signed-in owner or a playable local seed", async () => {
        await mount(null, null);
        const button = host.querySelector("button");
        expect(button?.disabled).toBe(true);
        expect(fake.discover).not.toHaveBeenCalled();
    });

    it("shows a retriable error without claiming any change to the library", async () => {
        fake.discover.mockRejectedValueOnce(new Error("unavailable"));
        await mount();
        await clickDiscover();
        expect(host.textContent).toContain("Discovery is unavailable");
        expect(fake.discover).toHaveBeenCalledOnce();
    });
});
