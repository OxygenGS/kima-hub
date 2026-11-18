/** Keep playlist UI translated without rewriting saved playlist names or requests. */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n/language-context";
import PlaylistsPage from "@/app/playlists/page";

const state = vi.hoisted(() => ({
    playlists: [] as Array<{
        id: string; name: string; trackCount: number; isOwner: boolean; isHidden: boolean;
        coverUpdatedAt?: string | null;
        items?: Array<{ id: string; track: { album: { coverUrl: string | null } } }>;
    }>,
    create: vi.fn(),
    post: vi.fn(),
    studioFilters: null as null | { owner: string; sort: string; scope: string; page: number; q: string },
}));
vi.mock("@/hooks/useQueries", () => ({
    queryKeys: { playlists: () => ["playlists"] },
    usePlaylistStudioQuery: (filters: { owner: string; sort: string; scope: string; page: number; q: string }) => {
        state.studioFilters = filters;
        return {
        data: {
            items: state.playlists,
            total: state.playlists.length,
            pages: 1,
            page: 1,
            limit: 24,
            counts: {
                visible: state.playlists.filter((playlist) => !playlist.isHidden).length,
                hidden: state.playlists.filter((playlist) => playlist.isHidden).length,
            },
        },
        isLoading: false,
        isFetching: false,
        isError: false,
        isPlaceholderData: false,
        };
    },
}));
vi.mock("@tanstack/react-query", () => ({
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/audio-context", () => ({
    useAudioControls: () => ({ playTracks: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({
    api: {
        createPlaylist: (...args: unknown[]) => state.create(...args),
        post: (...args: unknown[]) => state.post(...args),
        getCoverArtUrl: (u: string) => u,
        getPlaylistCoverUrl: (id: string, timestamp: string) =>
            "/api/playlists/" + id + "/cover?v=" + encodeURIComponent(timestamp),
    },
}));
vi.mock("@/components/layout/PageHeader", () => ({
    PageHeader: ({ title, eyebrow, description, children }: {
        title: string; eyebrow?: string; description?: string; children?: React.ReactNode;
    }) => <header><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p>{children}</header>,
}));
vi.mock("@/components/ui/Button", () => ({
    Button: ({ children, onClick, disabled, type }: {
        children?: React.ReactNode; onClick?: () => void; disabled?: boolean; type?: "submit" | "button";
    }) => <button onClick={onClick} disabled={disabled} type={type ?? "button"}>{children}</button>,
}));
vi.mock("@/components/ui/SectionHeader", () => ({
    SectionHeader: ({title}:{title:string}) => <h2>{title}</h2>,
}));
vi.mock("@/components/cards/MediaCard", () => ({
    MediaCard: ({title,subtitle,imageUrl}:{
        title:string;subtitle:string;imageUrl?:string|string[];
    }) => <article>
        <h2>{title}</h2>
        <p>{subtitle}</p>
        {imageUrl && <img alt="playlist-art" src={Array.isArray(imageUrl) ? imageUrl[0] : imageUrl} />}
    </article>,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
async function render() {
    await act(async () => root.render(<LanguageProvider><PlaylistsPage /></LanguageProvider>));
}
async function switchLocale(locale: "en" | "nl") {
    await act(async () => {
        localStorage.setItem("kima-hub-language", locale);
        window.dispatchEvent(new Event("kima-hub-language-change"));
    });
}
beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem("kima-hub-language");
    state.playlists = [];
    state.studioFilters = null;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
    localStorage.removeItem("kima-hub-language");
});
describe("playlist library presentation translations", () => {
    it("switches headings, import controls and creation form immediately", async () => {
        await render();
        expect(host.textContent).toContain("Getting Started");
        expect(host.textContent).toContain("Import from M3U file");
        await switchLocale("nl");
        expect(host.textContent).toContain("Jouw bibliotheek");
        expect(host.textContent).toContain("Afspeellijsten");
        expect(host.textContent).not.toContain("Getting Started");
        expect(host.textContent).toContain("Importeren vanuit M3U-bestand");
        const createCard = [...host.querySelectorAll("button")].find(x =>
            x.textContent?.includes("Maak je eerste afspeellijst")
        );
        expect(createCard).toBeDefined();
        await act(async () => createCard?.click());
        // Inline creation must use translated placeholder while keeping user-entered names unchanged.
        expect(host.querySelector('input[placeholder="Naam van afspeellijst..."]')).not.toBeNull();
        await switchLocale("en");
        expect(host.textContent).toContain("Getting Started");
        expect(state.create).not.toHaveBeenCalled();
        expect(state.post).not.toHaveBeenCalled();
    });

    it("shows custom artwork in Studio cards, with mosaic fallback when no cover is set", async () => {
        const stamp = "2026-11-18T18:00:00.000Z";
        state.playlists = [
            {
                id: "playlist-a", name: "Custom image", trackCount: 1,
                isOwner: true, isHidden: false, coverUpdatedAt: stamp,
                items: [{ id: "item-a", track: { album: { coverUrl: "album-fallback" } } }],
            },
            {
                id: "playlist-b", name: "Automatic mosaic", trackCount: 1,
                isOwner: true, isHidden: false, coverUpdatedAt: null,
                items: [{ id: "item-b", track: { album: { coverUrl: "album-art" } } }],
            },
        ];
        await render();
        const covers = [...host.querySelectorAll<HTMLImageElement>('img[alt="playlist-art"]')];
        expect(covers).toHaveLength(2);
        expect(covers[0].getAttribute("src"))
            .toBe("/api/playlists/playlist-a/cover?v=" + encodeURIComponent(stamp));
        expect(covers[1].getAttribute("src")).toBe("album-art");
    });

    it("passes user-selected owner and sort filters to the server query", async () => {
        state.playlists = [{
            id: "playlist-a", name: "Road trip", trackCount: 4,
            isOwner: true, isHidden: false,
        }];
        await render();
        expect(state.studioFilters).toMatchObject({
            owner: "all", sort: "recent", scope: "visible", page: 1, q: "",
        });

        const owner = host.querySelector<HTMLSelectElement>("#playlist-owner-filter");
        const sort = host.querySelector<HTMLSelectElement>("#playlist-sort-order");
        expect(owner).not.toBeNull();
        expect(sort).not.toBeNull();

        await act(async () => {
            owner!.value = "mine";
            owner!.dispatchEvent(new Event("change", { bubbles: true }));
        });
        expect(state.studioFilters).toMatchObject({ owner: "mine", page: 1 });

        await act(async () => {
            sort!.value = "name-asc";
            sort!.dispatchEvent(new Event("change", { bubbles: true }));
        });
        expect(state.studioFilters).toMatchObject({ owner: "mine", sort: "name-asc", page: 1 });
    });

    it("does not translate stored playlist names when the locale changes", async () => {
        state.playlists = [{ id:"playlist-a", name:"Original Playlist Name", trackCount:3, isOwner:true, isHidden:false }];
        await render();
        expect(host.textContent).toContain("Original Playlist Name");
        await switchLocale("nl");
        expect(host.textContent).toContain("Original Playlist Name");
        expect(host.textContent).toContain("3 nummers");
    });
});
