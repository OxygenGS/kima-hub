import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/HeroBackdrop", () => ({
    HeroBackdrop: () => null,
}));
vi.mock("@/components/ui/CachedImage", () => ({
    CachedImage: () => null,
}));
vi.mock("@/lib/i18n/language-context", () => ({
    useLanguage: () => ({ locale: "en", t: (key: string) => key }),
}));
vi.mock("@/lib/auth-context", () => ({
    useMusicPermissions: () => ({ canRequestAlbums: true }),
}));

import { MediaHero } from "@/components/ui/MediaHero";
import { MediaActionBar } from "@/components/ui/MediaActionBar";
import { ArtistActionBar } from "@/features/artist/components/ArtistActionBar";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;

function render(view: React.ReactNode) {
    act(() => root.render(<>{view}</>));
}

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("UI 2.0 shared media detail layout", () => {
    it("stacks artwork above the complete title on narrow screens and retains desktop layout", () => {
        render(
            <MediaHero
                image={null}
                alt="Long album art"
                colors={null}
                tint="music"
                fallback={["#111111", "#000000"]}
                shape="square"
                fallbackIcon={<span>Artwork</span>}
                eyebrowDotClass="bg-type-album"
                eyebrowLabel="Album"
                title="A Very Long Album Title That Should Wrap"
                titleExtra={<button aria-label="Edit metadata">Edit</button>}
                meta={<span>2026</span>}
            />
        );
        const heading = host.querySelector("h1");
        const heroRow = heading?.parentElement?.parentElement?.parentElement;
        expect(heading?.textContent).toBe("A Very Long Album Title That Should Wrap");
        expect(heading?.className).toContain("break-words");
        expect(heading?.className).toContain("line-clamp-3");
        expect(heroRow?.className).toContain("flex-col");
        expect(heroRow?.className).toContain("sm:flex-row");
        expect(host.querySelector('[aria-label="Edit metadata"]')).not.toBeNull();
    });

    it("wraps media actions and provides accessible secondary touch targets", () => {
        const play = vi.fn();
        const shuffle = vi.fn();
        render(
            <MediaActionBar
                showPause={false}
                onPlayPause={play}
                onShuffle={shuffle}
                secondaryShape="square"
            />
        );
        const actionRow = host.querySelector(".flex-wrap");
        expect(actionRow).not.toBeNull();
        const shuffleButton = Array.from(host.querySelectorAll("button")).find(
            button => button.getAttribute("aria-label")?.toLowerCase().includes("shuffle")
        );
        expect(shuffleButton).toBeDefined();
        expect(shuffleButton?.className).toContain("min-h-11");
        expect(shuffleButton?.className).toContain("min-w-11");
        act(() => shuffleButton?.click());
        expect(shuffle).toHaveBeenCalledOnce();
        expect(play).not.toHaveBeenCalled();
    });

    it("does not show inert playback controls for a discovery-only artist", () => {
        const play = vi.fn();
        render(
            <ArtistActionBar
                albums={[{ id: "discovery-album", title: "Unowned", owned: false }]}
                source="discovery"
                onPlayAll={play}
                onShuffle={vi.fn()}
                onDownloadAll={vi.fn()}
                onStartRadio={vi.fn()}
                isPendingDownload={false}
                isPlaying={false}
                isPlayingThisArtist={false}
                onPause={vi.fn()}
            />
        );
        expect(host.querySelector('button[aria-label="play all"]')).toBeNull();
        expect(host.textContent).toContain("Request albums");
        expect(play).not.toHaveBeenCalled();
    });
});
