/** Playlist actions change language live; provider and playlist identifiers are never translated. */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n/language-context";
import { translate } from "@/lib/i18n/translations";
import PlaylistsPage from "@/app/playlists/page";

const mocks = vi.hoisted(() => ({
    playTracks: vi.fn(),
    invalidateQueries: vi.fn(),
}));
vi.mock("@/hooks/useQueries", () => ({
    usePlaylistsQuery: () => ({ data: [], isLoading: false }),
    queryKeys: { playlists: () => ["playlists"] },
}));
vi.mock("@tanstack/react-query", () => ({
    useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock("@/lib/audio-context", () => ({
    useAudioControls: () => ({ playTracks: mocks.playTracks }),
}));
vi.mock("@/components/layout/PageHeader", () => ({
    PageHeader: ({ title, eyebrow, description, children }: {
        title: string; eyebrow?: string; description?: string; children?: React.ReactNode;
    }) => <header><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p>{children}</header>,
}));
vi.mock("@/components/ui/Button", () => ({
    Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
        <button onClick={onClick}>{children}</button>,
}));
vi.mock("@/components/ui/LoadingScreen", () => ({
    LoadingScreen: () => <span>Loading</span>,
}));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem("kima-hub-language");
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
    localStorage.removeItem("kima-hub-language");
});

describe("playlist library live EN/NL switching", () => {
    it("localizes the empty-library entry points without changing routes or calling APIs", async () => {
        await act(async () => root.render(<LanguageProvider><PlaylistsPage /></LanguageProvider>));
        expect(host.textContent).toContain("Create your first playlist");
        expect(host.textContent).toContain("Import from M3U file");

        await act(async () => {
            localStorage.setItem("kima-hub-language", "nl");
            window.dispatchEvent(new Event("kima-hub-language-change"));
        });

        expect(host.textContent).toContain(translate("nl", "Create your first playlist"));
        expect(host.textContent).toContain(translate("nl", "Import from M3U file"));
        expect(host.textContent).not.toContain("Create your first playlist");
        const browse = [...host.querySelectorAll("a")].find(a => a.textContent?.includes(translate("nl", "Browse public playlists")));
        expect(browse?.getAttribute("href")).toBe("/browse/playlists");
        expect(mocks.playTracks).not.toHaveBeenCalled();
        expect(mocks.invalidateQueries).not.toHaveBeenCalled();
    });
});
