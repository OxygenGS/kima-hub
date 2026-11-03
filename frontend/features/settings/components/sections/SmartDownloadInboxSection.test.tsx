import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: { getSmartDownloadInbox: vi.fn() } }));
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
