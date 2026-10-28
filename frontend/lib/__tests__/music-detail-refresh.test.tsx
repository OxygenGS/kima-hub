/* eslint-disable @next/next/no-img-element -- deterministic image stub, not production artwork. */
import React, { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MusicDetailHero, MusicDetailHeroSkeleton } from "@/components/ui/MusicDetailHero";
import { MediaActionBar } from "@/components/ui/MediaActionBar";
import { ArtistHero } from "@/features/artist/components/ArtistHero";
import { AlbumHero } from "@/features/album/components/AlbumHero";
import { ArtistActionBar } from "@/features/artist/components/ArtistActionBar";
import { AlbumActionBar } from "@/features/album/components/AlbumActionBar";
import { translate } from "@/lib/i18n/translations";

const state = vi.hoisted(() => ({ locale: "en" as "en" | "nl", canRequestAlbums: false }));
const backdrop = vi.hoisted(() => vi.fn());
vi.mock("@/lib/i18n/language-context", () => ({
    useLanguage: () => ({ locale: state.locale, t: (key: string) => translate(state.locale, key) }),
}));
vi.mock("@/lib/auth-context", () => ({
    useMusicPermissions: () => ({ canRequestAlbums: state.canRequestAlbums }),
}));
vi.mock("next/link", () => ({
    default: ({ children, prefetch, ...props }: React.ComponentProps<"a"> & { prefetch?: boolean }) => (
        <a {...props} data-prefetch={String(prefetch)}>{children}</a>
    ),
}));
vi.mock("@/components/ui/CachedImage", () => ({
    CachedImage: ({ src, alt, priority, sizes }: { src: string; alt: string; priority?: boolean; sizes?: string }) => (
        <img src={src} alt={alt} sizes={sizes} data-priority={String(priority)} />
    ),
}));
vi.mock("@/components/ui/HeroBackdrop", () => ({
    HeroBackdrop: (props: { image: string | null }) => { backdrop(props); return null; },
}));
vi.mock("@/components/MetadataEditControls", () => ({
    MetadataEditControls: ({ editable, onSave }: { editable: boolean; onSave: () => void }) => (
        editable ? <button onClick={onSave} aria-label="Edit metadata">Edit</button> : null
    ),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
function render(node: React.ReactNode) { act(() => root.render(node)); }
function button(label: string) {
    return Array.from(host.querySelectorAll("button")).find((node) => node.getAttribute("aria-label") === label || node.textContent === label);
}
beforeEach(() => {
    vi.clearAllMocks(); state.locale = "en"; state.canRequestAlbums = false;
    host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

const hero: ComponentProps<typeof MusicDetailHero> = {
    libraryHref: "/collection?tab=albums", image: "/low-res.jpg", coverImage: "/cover.jpg",
    alt: "Original cover title", colors: null, tint: "music", fallback: ["#222222", "#111111"],
    shape: "square", fallbackIcon: <span data-art-fallback>Artwork</span>,
    eyebrowDotClass: "bg-type-album", eyebrowLabel: "Album", title: "The Original Record",
    meta: <span>2026</span>,
};
const artistActions = (): ComponentProps<typeof ArtistActionBar> => ({
    albums: [{ id: "owned", title: "Record", owned: true }], source: "library",
    onPlayAll: vi.fn(), onShuffle: vi.fn(), onDownloadAll: vi.fn(), onStartRadio: vi.fn(),
    onPause: vi.fn(), isPendingDownload: false, isPlaying: false, isPlayingThisArtist: false,
});
const albumActions = (): ComponentProps<typeof AlbumActionBar> => ({
    album: { id: "record", title: "Record", owned: true }, source: "library",
    onPlayAll: vi.fn(), onShuffle: vi.fn(), onDownloadAlbum: vi.fn(), onAddToPlaylist: vi.fn(),
    onPause: vi.fn(), isPendingDownload: false, isPlaying: false, isPlayingThisAlbum: false,
});

describe("music detail presentation", () => {
    it("retains the complete title, metadata edit and action callbacks", () => {
        const edit = vi.fn(); const play = vi.fn();
        const title = "LongOriginalTitle".repeat(20);
        render(<MusicDetailHero {...hero} title={title} titleExtra={<button onClick={edit}>Edit</button>}>
            <button onClick={play}>Listen</button>
        </MusicDetailHero>);
        expect(host.querySelectorAll("h1")).toHaveLength(1);
        expect(host.querySelector("h1")?.textContent).toBe(title);
        expect(host.querySelector("h1")?.className).not.toContain("line-clamp");
        act(() => button("Edit")?.click()); act(() => button("Listen")?.click());
        expect(edit).toHaveBeenCalledOnce(); expect(play).toHaveBeenCalledOnce();
        expect(host.querySelector('a[href="/collection?tab=albums"]')?.getAttribute("data-prefetch")).toBe("false");
    });
    it("keeps the low-resolution backdrop separate from the eager cover and a fallback underneath", () => {
        render(<MusicDetailHero {...hero} />);
        expect(backdrop).toHaveBeenCalledWith(expect.objectContaining({ image: "/low-res.jpg" }));
        expect(host.querySelectorAll("img")).toHaveLength(1);
        expect(host.querySelector("img")?.getAttribute("src")).toBe("/cover.jpg");
        expect(host.querySelector("img")?.getAttribute("data-priority")).toBe("true");
        expect(host.querySelector("[data-art-fallback]")?.parentElement?.getAttribute("aria-hidden")).toBe("true");
    });
    it("does not substitute a backdrop when the cover is explicitly absent", () => {
        render(<MusicDetailHero {...hero} coverImage={null} />);
        expect(host.querySelector("img")).toBeNull();
        expect(host.querySelector("[data-art-fallback]")).not.toBeNull();
        expect(host.querySelector("h1")?.textContent).toBe(hero.title);
    });
    it("localizes the artist label without rewriting the artist name or exposing editing to discovery", () => {
        state.locale = "nl";
        render(<ArtistHero artist={{ id: "artist", name: "Original Artist" }} source="discovery" albums={[]} heroImage={null} colors={null} onReload={vi.fn()} />);
        expect(host.textContent).toContain(translate("nl", "Artist"));
        expect(host.querySelector("h1")?.textContent).toBe("Original Artist");
        expect(host.querySelector('[aria-label="Edit metadata"]')).toBeNull();
        expect(host.textContent).not.toContain("0");
    });
    it("preserves the album artist destination, original genre and metadata-save callback", async () => {
        const reload = vi.fn();
        render(<AlbumHero album={{ id: "record", title: "Original Album", artist: { id: "artist", name: "Original Artist" }, year: 2026, trackCount: 8, genre: "Post-Rock" }} source="library" coverUrl={null} colors={null} onReload={reload} />);
        expect(host.querySelector('a[href="/artist/artist"]')?.textContent).toBe("Original Artist");
        expect(host.textContent).toContain("Post-Rock");
        expect(host.textContent).toContain("8");
        await act(async () => button("Edit metadata")?.click());
        expect(reload).toHaveBeenCalledOnce();
    });
    it("shares the artwork shapes in the noninteractive loading skeleton", () => {
        render(<MusicDetailHeroSkeleton shape="circle" />);
        expect(host.querySelector('[data-shape="circle"]')).not.toBeNull();
        expect(host.querySelector('div[aria-hidden="true"]')).not.toBeNull();
        expect(host.querySelector("button, a, h1")).toBeNull();
    });
});

describe("music actions retain permission and playback contracts", () => {
    it("keeps artist play, shuffle, radio and pause wired to their own callbacks", () => {
        const props = artistActions(); render(<ArtistActionBar {...props} />);
        act(() => button(translate("en", "play all"))?.click());
        act(() => button(translate("en", "shuffle play"))?.click());
        act(() => button(translate("en", "start artist radio"))?.click());
        expect(props.onPlayAll).toHaveBeenCalledOnce(); expect(props.onShuffle).toHaveBeenCalledOnce();
        expect(props.onStartRadio).toHaveBeenCalledOnce(); expect(props.onPause).not.toHaveBeenCalled();
        render(<ArtistActionBar {...props} isPlaying isPlayingThisArtist />);
        act(() => button(translate("en", "pause"))?.click());
        expect(props.onPause).toHaveBeenCalledOnce(); expect(props.onDownloadAll).not.toHaveBeenCalled();
    });
    it("has no playback or request controls for an unowned discovery artist without request rights", () => {
        const props = artistActions();
        render(<ArtistActionBar {...props} albums={[{ id: "remote", title: "Remote", owned: false }]} source="discovery" />);
        expect(host.querySelectorAll("button")).toHaveLength(0);
        expect(props.onPlayAll).not.toHaveBeenCalled();
    });
    it("allows an authorized artist request and disables repeat clicks while pending", () => {
        state.canRequestAlbums = true; const props = artistActions();
        render(<ArtistActionBar {...props} source="discovery" albums={[]} />);
        act(() => button(translate("en", "Request albums"))?.click());
        expect(props.onDownloadAll).toHaveBeenCalledOnce();
        render(<ArtistActionBar {...props} source="discovery" albums={[]} isPendingDownload />);
        const pending = button(translate("en", "Requesting..."));
        expect(pending?.disabled).toBe(true); expect(pending?.getAttribute("aria-busy")).toBe("true");
        act(() => pending?.click()); expect(props.onDownloadAll).toHaveBeenCalledOnce();
    });
    it("keeps owned album playback and playlist actions; playing another album does not pause it", () => {
        const props = albumActions(); render(<AlbumActionBar {...props} isPlaying />);
        act(() => button(translate("en", "play all"))?.click());
        act(() => button(translate("en", "add to playlist"))?.click());
        expect(props.onPlayAll).toHaveBeenCalledOnce(); expect(props.onAddToPlaylist).toHaveBeenCalledOnce();
        expect(props.onPause).not.toHaveBeenCalled();
        render(<AlbumActionBar {...props} isPlaying isPlayingThisAlbum />);
        act(() => button(translate("en", "pause"))?.click()); expect(props.onPause).toHaveBeenCalledOnce();
    });
    it("requires both request rights and a music identifier for an unowned album", () => {
        const props = albumActions(); const album = { id: "remote", title: "Remote", owned: false, mbid: "release-id" };
        render(<AlbumActionBar {...props} album={album} source="discovery" />);
        expect(host.querySelectorAll("button")).toHaveLength(0);
        state.canRequestAlbums = true;
        render(<AlbumActionBar {...props} album={album} source="discovery" />);
        act(() => button(translate("en", "Request album"))?.click()); expect(props.onDownloadAlbum).toHaveBeenCalledOnce();
        render(<AlbumActionBar {...props} album={{ ...album, mbid: undefined }} source="discovery" />);
        expect(host.querySelectorAll("button")).toHaveLength(0);
    });
    it("keeps icon-only defaults for other callers and translates visible music controls", () => {
        render(<MediaActionBar showPause={false} onPlayPause={vi.fn()} secondaryShape="square" />);
        expect(host.querySelector("button")?.textContent).toBe("");
        state.locale = "nl"; render(<AlbumActionBar {...albumActions()} />);
        const play = button(translate("nl", "play all"));
        expect(play?.textContent).toBe(translate("nl", "play all"));
        expect(play?.type).toBe("button");
    });
});
