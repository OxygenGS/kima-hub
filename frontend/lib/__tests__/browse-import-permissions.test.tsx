/**
 * Browse must not offer URL-import actions to standard listeners who lack
 * either acquisition right. Stub network and auth: no actual import is started.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BrowsePlaylistsPage from "@/app/browse/playlists/page";
import { LanguageProvider } from "@/lib/i18n/language-context";

const state = vi.hoisted(() => ({
    rights: { canRequestAlbums: false, canDownloadTracks: false },
    get: vi.fn(),
    post: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({
    useMusicPermissions: () => state.rights,
}));
vi.mock("@/lib/api", () => ({
    api: {
        get: (...args: unknown[]) => state.get(...args),
        post: (...args: unknown[]) => state.post(...args),
    },
}));
vi.mock("@/lib/notify", () => ({ notify: { error: vi.fn() } }));
vi.mock("@/components/ui/Button", () => ({
    Button: ({ children, onClick, disabled }: {
        children?: React.ReactNode; onClick?: () => void; disabled?: boolean;
    }) => <button type="button" onClick={onClick} disabled={disabled}>{children}</button>,
}));
vi.mock("@/components/ui/Modal", () => ({
    Modal: ({ isOpen, title, children, footer }: {
        isOpen: boolean; title?: string; children?: React.ReactNode; footer?: React.ReactNode;
    }) => isOpen ? <div role="dialog" aria-label={title}>{children}{footer}</div> : null,
}));
vi.mock("@/components/ui/EmptyState", () => ({
    EmptyState: ({ title, action }: {
        title: string; action?: { label: string; onClick: () => void };
    }) => <section>{title}{action && <button onClick={action.onClick}>{action.label}</button>}</section>,
}));
vi.mock("@/components/layout/PageHeader", () => ({
    PageHeader: ({ title, eyebrow }: { title: string; eyebrow?: string }) => <header>{eyebrow && <span>{eyebrow}</span>}<h1>{title}</h1></header>,
}));
vi.mock("@/components/ui/SectionHeader", () => ({
    SectionHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
}));
vi.mock("@/components/ui/GradientSpinner", () => ({ GradientSpinner: () => <span>Loading</span> }));
vi.mock("@/components/ui/LoadingScreen", () => ({ LoadingScreen: () => <span>Loading</span> }));
vi.mock("@/components/ui/PageMessage", () => ({ PageMessage: () => <span>Error</span> }));
vi.mock("@/components/cards/MediaCard", () => ({ MediaCard: () => <div>Playlist card</div> }));
vi.mock("@/components/cards/TileCard", () => ({ TileCard: () => <div>Genre card</div> }));
vi.mock("@/features/home/components/DeezerIcon", () => ({ DeezerIcon: () => <span>Deezer</span> }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

async function render() {
    await act(async () => {
        root.render(<LanguageProvider><BrowsePlaylistsPage /></LanguageProvider>);
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem("kima-hub-language");
    state.rights = { canRequestAlbums: false, canDownloadTracks: false };
    state.get.mockResolvedValue({ playlists: [], genres: [] });
    state.post.mockResolvedValue({ url: "https://example.invalid/playlist" });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    localStorage.removeItem("kima-hub-language");
});

describe("Browse playlist import authorization affordances", () => {
    it.each([
        { canRequestAlbums: false, canDownloadTracks: false, allowed: false },
        { canRequestAlbums: true, canDownloadTracks: false, allowed: false },
        { canRequestAlbums: false, canDownloadTracks: true, allowed: false },
        { canRequestAlbums: true, canDownloadTracks: true, allowed: true },
    ])("requires both rights: albums=$canRequestAlbums tracks=$canDownloadTracks", async ({ canRequestAlbums, canDownloadTracks, allowed }) => {
        state.rights = { canRequestAlbums, canDownloadTracks };
        await render();

        const button = [...host.querySelectorAll("button")]
            .find((item) => item.textContent?.includes("Import URL"));
        expect(Boolean(button)).toBe(allowed);
        expect(host.querySelector("[role=dialog]")).toBeNull();

        if (button) {
            await act(async () => button.click());
            expect(host.querySelector("[role=dialog]")).not.toBeNull();
        }
        expect(state.post).not.toHaveBeenCalled();
    });
    it("switches the Browse interface between English and Dutch without changing provider data", async () => {
        state.rights = { canRequestAlbums: true, canDownloadTracks: true };
        await render();
        expect(host.textContent).toContain("Browse playlists");
        expect(host.textContent).toContain("Import URL");

        await act(async () => {
            localStorage.setItem("kima-hub-language", "nl");
            window.dispatchEvent(new Event("kima-hub-language-change"));
        });
        expect(host.textContent).toContain("Afspeellijsten bekijken");
        expect(host.textContent).toContain("URL importeren");
        expect(host.textContent).toContain("Van Deezer");
        expect(host.textContent).not.toContain("Browse playlists");
        expect(state.post).not.toHaveBeenCalled();

        await act(async () => {
            localStorage.setItem("kima-hub-language", "en");
            window.dispatchEvent(new Event("kima-hub-language-change"));
        });
        expect(host.textContent).toContain("Browse playlists");
        expect(host.textContent).not.toContain("Afspeellijsten bekijken");
    });

});
