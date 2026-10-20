/**
 * Browse must not offer URL-import actions to standard listeners who lack
 * either acquisition right. Stub network and auth: no actual import is started.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BrowsePlaylistsPage from "@/app/browse/playlists/page";

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
    PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
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
        root.render(<BrowsePlaylistsPage />);
    });
}

beforeEach(() => {
    vi.clearAllMocks();
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
});
