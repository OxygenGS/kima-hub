import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: { getSmartDownloadInbox: vi.fn(), getSmartImportSuggestion: vi.fn() } }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/lib/i18n/language-context", () => ({
    useLanguage: () => ({ locale: "en", t: (key: string) => key }),
}));
vi.mock("@/components/ui/SectionHeader", () => ({
    SectionHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
}));

import { api, type SmartDownloadInbox } from "@/lib/api";
import { SmartDownloadInboxSection } from "./SmartDownloadInboxSection";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let host: HTMLDivElement;

const report: SmartDownloadInbox = {
    generatedAt: "2026-11-03T11:00:00.000Z", total: 1, displayed: 1, limit: 25,
    items: [{
        id: "download-1", subject: "Tones and I - Dance Monkey",
        createdAt: "2026-11-03T10:00:00.000Z",
        stage: "review", reason: "unknown-artist",
        filePath: "Singles/Kima Downloads/Tones and I/Album/Dance Monkey.flac",
        track: { id: "track-1", album: "Album", artist: "Unknown Artist" },
    }],
};
async function clickCheck() {
    await act(async () => {
        host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
}
beforeEach(async () => {
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<SmartDownloadInboxSection />));
});
afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
});

describe("Smart Download Inbox", () => {
    it("never fetches private download records just by opening Settings", () => {
        expect(api.getSmartDownloadInbox).not.toHaveBeenCalled();
        expect(host.textContent).toContain("Check Soulseek imports");
    });
    it("labels review items as unverified rather than claiming a valid match", async () => {
        vi.mocked(api.getSmartDownloadInbox).mockResolvedValueOnce(report);
        await clickCheck();
        expect(api.getSmartDownloadInbox).toHaveBeenCalledTimes(1);
        expect(host.textContent).toContain("Dance Monkey");
        expect(host.textContent).toContain("Needs review");
        expect(host.textContent).toContain("unknown artist");
        expect(host.textContent).toContain("not a fresh disk check");
    });
    it("shows a load error rather than inventing an empty inbox", async () => {
        vi.mocked(api.getSmartDownloadInbox).mockRejectedValueOnce(new Error("offline"));
        await clickCheck();
        expect(host.querySelector('[role="alert"]')?.textContent).toContain("Import check failed");
        expect(host.textContent).not.toContain("No recent Soulseek downloads found");
    });
});

describe("read-only artist and album proposals", () => {
    it("never searches for suggestions without an explicit second click", async () => {
        vi.mocked(api.getSmartDownloadInbox).mockResolvedValueOnce(report);
        await clickCheck();
        expect(api.getSmartImportSuggestion).not.toHaveBeenCalled();
        expect(host.textContent).toContain("Find possible match");
    });

    it("shows evidence and comparison links without offering an edit", async () => {
        vi.mocked(api.getSmartDownloadInbox).mockResolvedValueOnce(report);
        vi.mocked(api.getSmartImportSuggestion).mockResolvedValueOnce({
            status: "suggested", readOnly: true,
            current: { trackId: "track-1", title: "Dance Monkey", artist: "Unknown Artist", album: "Album" },
            proposedArtist: { id: "artist-1", name: "Tones and I" },
            proposedAlbum: { id: "album-1", title: "The Kids Are Coming" },
            evidence: ["folder-artist", "existing-library-artist", "same-title-duration"],
        });
        await clickCheck();
        await act(async () => {
            const button = [...host.querySelectorAll("button")].find((b) => b.textContent === "Find possible match");
            button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        expect(api.getSmartImportSuggestion).toHaveBeenCalledWith("download-1");
        expect(host.textContent).toContain("Possible match (not verified)");
        expect(host.querySelector('a[href="/artist/artist-1"]')).toBeTruthy();
        expect(host.querySelector('a[href="/album/album-1"]')).toBeTruthy();
        expect(host.textContent).toContain("No change is applied");
    });

    it("does not invent a proposal when the server finds conflicting metadata", async () => {
        vi.mocked(api.getSmartDownloadInbox).mockResolvedValueOnce(report);
        vi.mocked(api.getSmartImportSuggestion).mockResolvedValueOnce({
            status: "conflict", readOnly: true, current: null,
            proposedArtist: null, proposedAlbum: null, evidence: [],
        });
        await clickCheck();
        await act(async () => {
            host.querySelectorAll("button")[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        expect(host.textContent).toContain("Artist metadata conflicts");
        expect(host.querySelectorAll('a[href^="/artist/"]')).toHaveLength(0);
    });
});
