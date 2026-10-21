/** Permission matrix for the visible single-track download action in Soulseek search. */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { SoulseekBrowser } from "@/features/search/components/SoulseekBrowser";
import type { SoulseekResult } from "@/features/search/types";

const state = vi.hoisted(() => ({
    rights: { canRequestAlbums: false, canDownloadTracks: false },
}));
vi.mock("@/lib/i18n/language-context", () => ({
    useLanguage: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/auth-context", () => ({
    useMusicPermissions: () => state.rights,
}));
vi.mock("@/components/ui/Button", () => ({
    Button: ({ children, onClick, disabled }: {
        children?: React.ReactNode; onClick?: () => void; disabled?: boolean;
    }) => <button type="button" onClick={onClick} disabled={disabled}>{children}</button>,
}));
vi.mock("@/components/ui/GradientSpinner", () => ({
    GradientSpinner: () => <span>Loading</span>,
}));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const result: SoulseekResult = {
    username: "example-peer",
    filename: "Example Artist - Sample.flac",
    path: "Example Artist/Sample.flac",
    size: 6000000,
    bitrate: 320,
    format: "flac",
};
let host: HTMLDivElement;
let root: Root;
const download = vi.fn();
const bulk = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
    state.rights = { canRequestAlbums: false, canDownloadTracks: false };
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("Soulseek track downloads are independent of album requests", () => {
    it.each([
        { canRequestAlbums: false, canDownloadTracks: false },
        { canRequestAlbums: true, canDownloadTracks: false },
        { canRequestAlbums: false, canDownloadTracks: true },
        { canRequestAlbums: true, canDownloadTracks: true },
    ])("album=$canRequestAlbums track=$canDownloadTracks", async (rights) => {
        state.rights = rights;
        await act(async () => root.render(
            <SoulseekBrowser
                results={[result]}
                isSearching={false}
                isPolling={false}
                uniqueUserCount={1}
                downloadingFiles={new Set()}
                onDownload={download}
                onBulkDownload={bulk}
            />,
        ));
        const singleDownload = host.querySelector('button[aria-label="Download track"]') as HTMLButtonElement | null;
        const selectionBoxes = host.querySelectorAll('input[type="checkbox"]');
        expect(Boolean(singleDownload)).toBe(rights.canDownloadTracks);
        expect(selectionBoxes.length > 0).toBe(rights.canDownloadTracks);
        if (singleDownload) {
            await act(async () => singleDownload.click());
            expect(download).toHaveBeenCalledOnce();
        } else {
            expect(download).not.toHaveBeenCalled();
        }
        expect(bulk).not.toHaveBeenCalled();
    });
});
