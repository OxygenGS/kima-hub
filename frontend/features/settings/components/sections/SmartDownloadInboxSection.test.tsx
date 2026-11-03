import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: { getSmartDownloadInbox: vi.fn(), getSmartImportSuggestion: vi.fn(),
    confirmSmartImportRepair: vi.fn(), undoSmartImportRepair: vi.fn() } }));
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
        stage: "review", reason: "unknown-artist", repairId: null,
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

    it("shows evidence and comparison links but requires separate confirmation before editing", async () => {
        vi.mocked(api.getSmartDownloadInbox).mockResolvedValueOnce(report);
        vi.mocked(api.getSmartImportSuggestion).mockResolvedValueOnce({
            status: "suggested", readOnly: true,
            current: { trackId: "track-1", albumId: "old-album", title: "Dance Monkey",
                artist: "Unknown Artist", album: "Album",
                fileModified: "2026-11-03T10:00:00.000Z", fileSize: 200000 },
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
        expect(host.textContent).toContain("Files and tags stay intact");
        expect(host.textContent).toContain("Prepare album link");
        expect(api.confirmSmartImportRepair).not.toHaveBeenCalled();
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


const suggestionWithAlbum = {
    status: "suggested" as const, readOnly: true as const,
    current: {
        trackId: "track-1", albumId: "old-album", title: "Dance Monkey",
        artist: "Unknown Artist", album: "Unknown Album",
        fileModified: "2026-11-03T10:00:00.000Z", fileSize: 200000,
    },
    proposedArtist: { id: "tones", name: "Tones and I" },
    proposedAlbum: { id: "new-album", title: "The Kids Are Coming" },
    evidence: ["folder-artist", "existing-library-artist", "same-title-duration"] as const,
};

function clickButton(label: string) {
    const target = [...host.querySelectorAll("button")].find((node) => node.textContent === label);
    expect(target).toBeDefined();
    target?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

async function openProposal() {
    vi.mocked(api.getSmartDownloadInbox).mockResolvedValueOnce(report);
    vi.mocked(api.getSmartImportSuggestion).mockResolvedValueOnce({
        ...suggestionWithAlbum, evidence: [...suggestionWithAlbum.evidence],
    });
    await clickCheck();
    await act(async () => clickButton("Find possible match"));
}

describe("Smart Download Inbox confirmed album changes", () => {
    it("requires two separate clicks after a proposal before calling the write API", async () => {
        await openProposal();
        expect(api.confirmSmartImportRepair).not.toHaveBeenCalled();
        await act(async () => clickButton("Prepare album link"));
        expect(host.textContent).toContain("Confirm album link change?");
        expect(host.textContent).toContain("Unknown Artist");
        expect(host.textContent).toContain("The Kids Are Coming");
        expect(api.confirmSmartImportRepair).not.toHaveBeenCalled();

        vi.mocked(api.confirmSmartImportRepair).mockResolvedValueOnce({
            status: "relinked", repairId: "repair-1", trackId: "track-1",
            previousAlbumId: "old-album", newAlbumId: "new-album",
            appliedAt: "2026-11-03T10:00:00.000Z",
        });
        vi.mocked(api.getSmartDownloadInbox).mockResolvedValueOnce({
            ...report,
            items: [{
                ...report.items[0], stage: "relinked", reason: "manual-relink",
                repairId: "repair-1", track: { id: "track-1", artist: "Tones and I", album: "The Kids Are Coming" },
            }],
        });
        await act(async () => clickButton("Confirm album link"));
        expect(api.confirmSmartImportRepair).toHaveBeenCalledWith("download-1", {
            trackId: "track-1", previousAlbumId: "old-album", newAlbumId: "new-album",
            fileModified: "2026-11-03T10:00:00.000Z", fileSize: 200000,
        });
        expect(host.textContent).toContain("Album link updated");
        expect(host.textContent).toContain("Undo album link");
    });

    it("allows an admin to cancel a confirmation without writing anything", async () => {
        await openProposal();
        await act(async () => clickButton("Prepare album link"));
        await act(async () => clickButton("Cancel"));
        expect(host.textContent).not.toContain("Confirm album link change?");
        expect(api.confirmSmartImportRepair).not.toHaveBeenCalled();
    });

    it("refuses to offer an apply action for artist-only suggestions", async () => {
        vi.mocked(api.getSmartDownloadInbox).mockResolvedValueOnce(report);
        vi.mocked(api.getSmartImportSuggestion).mockResolvedValueOnce({
            ...suggestionWithAlbum, proposedAlbum: null, evidence: ["folder-artist"],
        });
        await clickCheck();
        await act(async () => clickButton("Find possible match"));
        expect(host.textContent).toContain("Possible match");
        expect(host.textContent).not.toContain("Prepare album link");
        expect(api.confirmSmartImportRepair).not.toHaveBeenCalled();
    });

    it("requires explicit confirmation to undo and sends only the recorded repair ID", async () => {
        vi.mocked(api.getSmartDownloadInbox).mockResolvedValueOnce({
            ...report, items: [{ ...report.items[0], stage: "relinked", reason: "manual-relink", repairId: "repair-9" }],
        });
        await clickCheck();
        await act(async () => clickButton("Undo album link"));
        expect(api.undoSmartImportRepair).not.toHaveBeenCalled();
        expect(host.textContent).toContain("Restore the original indexed album link?");
        vi.mocked(api.undoSmartImportRepair).mockResolvedValueOnce({
            status: "undone", repairId: "repair-9", trackId: "track-1",
        });
        vi.mocked(api.getSmartDownloadInbox).mockResolvedValueOnce(report);
        await act(async () => clickButton("Confirm undo"));
        expect(api.undoSmartImportRepair).toHaveBeenCalledWith("download-1", "repair-9");
        expect(host.textContent).toContain("Original album link restored.");
    });

    it("shows server conflict without falsely claiming a successful repair", async () => {
        await openProposal();
        await act(async () => clickButton("Prepare album link"));
        vi.mocked(api.confirmSmartImportRepair).mockRejectedValueOnce(new Error("Stale confirmation"));
        await act(async () => clickButton("Confirm album link"));
        expect(host.querySelector('[role="alert"]')?.textContent).toContain("Stale confirmation");
        expect(host.textContent).not.toContain("Album link updated");
        expect(api.getSmartDownloadInbox).toHaveBeenCalledTimes(1);
    });
});
