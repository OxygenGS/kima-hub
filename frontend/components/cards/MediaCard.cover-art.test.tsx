import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Music2 } from "lucide-react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/ui/CachedImage", () => ({
    CachedImage: ({ src, onError }: { src: string; onError?: () => void }) =>
        <button type="button" data-src={src} onClick={onError} />,
}));
import { CoverArt } from "./MediaCard";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function render(urls: string[]) {
    await act(async () => root.render(<CoverArt key={urls.join(",")} imageUrl={urls} title="Album" sizes="200px" FallbackIcon={Music2} />));
}
const imgs = () => [...host.querySelectorAll<HTMLButtonElement>("[data-src]")];
describe("multi-cover layout", () => {
    it("deduplicates images and fits a two-cover row", async () => {
        await render(["a.jpg", "a.jpg", "b.jpg"]);
        expect(imgs().map(x => x.dataset.src)).toEqual(["a.jpg", "b.jpg"]);
        expect(host.querySelector("[data-cover-count]")?.getAttribute("data-cover-count")).toBe("2");
    });
    it("uses a tall first cell for three covers", async () => {
        await render(["a.jpg", "b.jpg", "c.jpg"]);
        expect(host.querySelector("[data-cover-cell]")?.className).toContain("row-span-2");
    });
    it("reflows as covers fail and eventually falls back to an icon", async () => {
        await render(["a.jpg", "b.jpg"]);
        await act(async () => imgs()[0].click());
        expect(imgs()).toHaveLength(1);
        await act(async () => imgs()[0].click());
        expect(imgs()).toHaveLength(0);
        expect(host.querySelector("svg")).not.toBeNull();
    });
});
