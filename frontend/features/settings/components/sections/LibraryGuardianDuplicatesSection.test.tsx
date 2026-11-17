import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LibraryGuardianDuplicatesSection } from "./LibraryGuardianDuplicatesSection";

const fake = vi.hoisted(() => ({
    owner: { id: "admin-a" } as { id: string } | null,
    inspect: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
    api: { getLibraryGuardianDuplicates: fake.inspect },
}));
vi.mock("@/lib/auth-context", () => ({
    useAuth: () => ({ user: fake.owner }),
}));
vi.mock("@/lib/i18n/language-context", () => ({
    useLanguage: () => ({ locale: "en" }),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const data = {
    generatedAt: "2026-11-17T12:00:00.000Z",
    basis: "indexed-recording-metadata",
    readOnly: true, groupLimit: 8, sampleLimit: 4, hasMore: true,
    candidates: [{
        recordingMbid: "550e8400-e29b-41d4-a716-446655440000",
        indexedCopies: 3,
        evidence: "matching-acoustic-fingerprint",
        tracks: [{
            id: "track1", title: "Great Song", duration: 212,
            filePath: "Artist/Album One/song.flac", albumId: "album1",
            albumTitle: "Album One", artistName: "The Artist",
        }],
    }],
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    vi.clearAllMocks();
    fake.owner = { id: "admin-a" };
    fake.inspect.mockResolvedValue(data);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(async () => {
    await act(async () => { root.unmount(); });
    host.remove();
});
async function mount() {
    await act(async () => { root.render(<LibraryGuardianDuplicatesSection />); });
}
async function clickInspect() {
    const button = host.querySelector("button");
    expect(button).toBeTruthy();
    await act(async () => { button!.click(); await Promise.resolve(); });
}

describe("Library Guardian settings", () => {
    it("never inspects the database automatically on mount", async () => {
        await mount();
        expect(host.textContent).toContain("Library Guardian");
        expect(host.textContent).toContain("Read-only");
        expect(fake.inspect).not.toHaveBeenCalled();
    });

    it("shows cautious evidence and permits manual album review after a click", async () => {
        await mount();
        await clickInspect();
        expect(fake.inspect).toHaveBeenCalledWith(8, expect.any(AbortSignal));
        expect(host.textContent).toContain("recording groups to review");
        expect(host.textContent).toContain("The Artist");
        expect(host.textContent).toContain("Matching acoustic signature");
        expect(host.textContent).toContain("Additional groups exist");
        expect(host.textContent).toContain("does not prove files are byte-identical");
        const album = host.querySelector('a[href="/album/album1"]');
        expect(album).toBeTruthy();
        expect([...host.querySelectorAll("button")].some(b => /delete|remove|fix/i.test(b.textContent || ""))).toBe(false);
    });

    it("does not reveal another administrator's previously loaded diagnostics", async () => {
        await mount();
        await clickInspect();
        expect(host.textContent).toContain("The Artist");
        fake.owner = { id: "admin-b" };
        await mount();
        expect(host.textContent).not.toContain("The Artist");
    });

    it("ignores results after logout and does not inspect without a user", async () => {
        let resolve!: (v: typeof data) => void;
        fake.inspect.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
        await mount();
        const button = host.querySelector("button");
        await act(async () => { button!.click(); });
        fake.owner = null;
        await mount();
        await act(async () => { resolve(data); await Promise.resolve(); });
        expect(host.textContent).not.toContain("Great Song");
        expect(host.querySelector("button")?.disabled).toBe(true);
    });

    it("shows a retryable error without fabricating an all-clear report", async () => {
        fake.inspect.mockRejectedValueOnce(new Error("offline"));
        await mount();
        await clickInspect();
        expect(host.querySelector('[role="alert"]')?.textContent).toContain("Duplicate check failed");
        expect(host.textContent).not.toContain("No repeated MusicBrainz");
    });
});
