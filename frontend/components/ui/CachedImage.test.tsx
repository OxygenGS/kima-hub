import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ seen: [] as Array<Record<string, unknown>> }));
vi.mock("next/image", () => ({
    default: (props: Record<string, unknown>) => {
        mocks.seen.push(props);
        return null;
    },
}));

import { CachedImage } from "./CachedImage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
    mocks.seen.length = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
});

async function render(props: React.ComponentProps<typeof CachedImage>) {
    await act(async () => root.render(<CachedImage {...props} />));
    return mocks.seen.at(-1)!;
}

describe("responsive protected album covers", () => {
    it("offers sharp sizes without changing the authenticated cover identity or token", async () => {
        const source = "/api/library/cover-art?url=https%3A%2F%2Fexample.org%2Fcover.jpg&size=300&token=secret-test";
        const image = await render({ src: source, alt: "Album", fill: true, sizes: "200px" });
        expect(typeof image.loader).toBe("function");
        expect(image.unoptimized).toBeUndefined();
        const loader = image.loader as (args: { src: string; width: number; quality?: number }) => string;
        expect(loader({ src: source, width: 512 })).toBe(
            "/api/library/cover-art?url=https%3A%2F%2Fexample.org%2Fcover.jpg&size=512&token=secret-test"
        );
        expect(loader({ src: source, width: 3840 })).toContain("size=2048&token=secret-test");
    });

    it("supports cover-ID URLs whose size follows the private token", async () => {
        const source = "/api/library/cover-art/album1?token=private&size=256";
        const image = await render({ src: source, alt: "Album", width: 128, height: 128 });
        const loader = image.loader as (args: { src: string; width: number }) => string;
        expect(loader({ src: source, width: 384 })).toBe("/api/library/cover-art/album1?token=private&size=384");
    });

    it("keeps podcast and other non-cover sources unoptimized", async () => {
        const image = await render({ src: "/api/podcasts/cover/episode?size=256", alt: "Podcast", fill: true, sizes: "150px" });
        expect(image.unoptimized).toBe(true);
        expect(image.loader).toBeUndefined();
    });

    it("does not generate arbitrary full-width candidates when fill sizes are absent", async () => {
        const image = await render({ src: "/api/library/cover-art/album1?size=200", alt: "Album", fill: true });
        expect(image.unoptimized).toBe(true);
        expect(image.loader).toBeUndefined();
    });

    it("keeps unmodified URLs without a size parameter and the lazy-loading default", async () => {
        const image = await render({ src: "/api/library/cover-art/album1?token=private", alt: "Album", width: 150, height: 150 });
        expect(image.unoptimized).toBe(true);
        expect(image.loading).toBe("lazy");
    });
});
