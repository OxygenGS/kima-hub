import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Disc3, Play } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaCard } from "@/components/cards/MediaCard";

vi.mock("next/link", () => ({
    default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
vi.mock("@/components/ui/CachedImage", () => ({ CachedImage: () => null }));
vi.mock("@/lib/i18n/language-context", () => ({
    useLanguage: () => ({ locale: "en" }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("Turbo media card navigation intent", () => {
    it("prefetches a touch on the link, not an embedded Play button", async () => {
        const prefetch = vi.fn();
        await act(async () => root.render(
            <MediaCard
                href="/album/album-1"
                title="Album"
                type="album"
                fallbackIcon={Disc3}
                onPrefetch={prefetch}
                action={{ icon: Play, label: "Play", onClick: vi.fn() }}
            />
        ));
        const link = host.querySelector("a");
        const playButton = host.querySelector("button");
        expect(link).not.toBeNull();
        expect(playButton).not.toBeNull();
        await act(async () => {
            playButton!.dispatchEvent(new Event("touchstart", { bubbles: true }));
        });
        expect(prefetch).not.toHaveBeenCalled();
        await act(async () => {
            link!.dispatchEvent(new Event("touchstart", { bubbles: true }));
        });
        expect(prefetch).toHaveBeenCalledTimes(1);
        expect(link!.className).toContain("focus-visible:ring-2");
    });
});
