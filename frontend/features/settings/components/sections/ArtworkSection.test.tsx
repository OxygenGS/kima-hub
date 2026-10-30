import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SystemSettings } from "../../types";

const mockGetMissing = vi.fn();
const mockRetry = vi.fn();
const mockInvalidate = vi.fn();

vi.mock("@/lib/api", () => ({
    api: {
        getMissingArtistArtwork: (...args: unknown[]) => mockGetMissing(...args),
        retryMissingArtistArtwork: (...args: unknown[]) => mockRetry(...args),
    },
}));
vi.mock("@/lib/i18n/language-context", () => ({
    useLanguage: () => ({ t: (key: string) => key }),
}));
vi.mock("@tanstack/react-query", () => ({
    useQueryClient: () => ({ invalidateQueries: (...args: unknown[]) => mockInvalidate(...args) }),
}));
vi.mock("../../hooks/useConnectionTest", () => ({
    useConnectionTest: () => ({ connected: false }),
}));
vi.mock("../ui", () => ({
    SettingsSection: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
    SettingsRow: ({ label, children }: { label: string; children: React.ReactNode }) =>
        <div><span>{label}</span>{children}</div>,
    SettingsInput: () => null,
    SettingsToggle: () => null,
    ConnectionTestButton: () => null,
}));

import { ArtworkSection } from "./ArtworkSection";
import { translate } from "@/lib/i18n/translations";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const initialProgress = {
    inProgress: false, queued: 0, processed: 0, recovered: 0,
    missing: 0, failed: 0, startedAt: null as string | null, finishedAt: null as string | null,
};

let host: HTMLDivElement;
let root: Root;

async function renderArtwork() {
    await act(async () => {
        root.render(
            <ArtworkSection
                settings={{ fanartEnabled: false, acoustidApiKey: null } as SystemSettings}
                onUpdate={vi.fn()}
                onTest={vi.fn()}
                isTesting={false}
            />,
        );
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    mockGetMissing.mockResolvedValue({ missingArtists: 3, progress: initialProgress });
    mockRetry.mockResolvedValue({
        message: "Started", progress: { ...initialProgress, inProgress: true },
    });
});

afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
});

describe("artist artwork recovery settings", () => {
    it("shows missing photo count but does not trigger a scan on page load", async () => {
        await renderArtwork();
        expect(host.textContent).toContain("Missing artist photos");
        expect(host.textContent).toContain("Retry missing artist photos");
        expect(host.textContent).toContain("3");
        expect(mockRetry).not.toHaveBeenCalled();
    });

    it("disables retry when no photos are missing", async () => {
        mockGetMissing.mockResolvedValue({ missingArtists: 0, progress: initialProgress });
        await renderArtwork();
        const button = [...host.querySelectorAll("button")].find((b) =>
            b.textContent?.includes("Retry missing artist photos"));
        expect(button?.disabled).toBe(true);
    });

    it("starts only on click, refreshes the count and invalidates artist images on completion", async () => {
        await renderArtwork();
        const button = [...host.querySelectorAll("button")].find((b) =>
            b.textContent?.includes("Retry missing artist photos"));
        expect(button).toBeDefined();

        mockGetMissing.mockResolvedValue({
            missingArtists: 2,
            progress: {
                ...initialProgress, startedAt: "2026-10-30T08:00:00Z",
                finishedAt: "2026-10-30T08:00:01Z", queued: 1,
                processed: 1, recovered: 1,
            },
        });
        await act(async () => { button?.click(); });
        expect(mockRetry).toHaveBeenCalledTimes(1);
        expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["library", "artists"] });
        expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["artist"] });
        expect(host.textContent).toContain("artist photos recovered");
    });

    it("translates the new controls in Dutch", () => {
        expect(translate("nl", "Missing artist photos")).toBe("Ontbrekende artiestfoto's");
        expect(translate("nl", "Retry missing artist photos"))
            .toBe("Ontbrekende artiestfoto's opnieuw zoeken");
    });
});
