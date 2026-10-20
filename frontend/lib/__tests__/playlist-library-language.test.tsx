/** Keep playlist UI translated without rewriting saved playlist names or requests. */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n/language-context";
import PlaylistsPage from "@/app/playlists/page";

const state = vi.hoisted(() => ({
    playlists: [] as Array<{id:string;name:string;trackCount:number;isOwner:boolean;isHidden:boolean}>,
    create: vi.fn(),
    post: vi.fn(),
}));
vi.mock("@/hooks/useQueries", () => ({
    queryKeys: { playlists: () => ["playlists"] },
    usePlaylistsQuery: () => ({ data: state.playlists, isLoading: false }),
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
    MediaCard: ({title,subtitle}:{title:string;subtitle:string}) => <article><h2>{title}</h2><p>{subtitle}</p></article>,
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

    it("does not translate stored playlist names when the locale changes", async () => {
        state.playlists = [{ id:"playlist-a", name:"Original Playlist Name", trackCount:3, isOwner:true, isHidden:false }];
        await render();
        expect(host.textContent).toContain("Original Playlist Name");
        await switchLocale("nl");
        expect(host.textContent).toContain("Original Playlist Name");
        expect(host.textContent).toContain("3 nummers");
    });
});
