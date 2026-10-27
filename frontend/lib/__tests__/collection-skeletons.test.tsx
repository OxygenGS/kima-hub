import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionGridSkeleton, CollectionTracksSkeleton } from "@/features/library/components/CollectionGridSkeleton";

vi.mock("@/lib/i18n/language-context", () => ({
    useLanguage: () => ({ t: (value: string) => value }),
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

describe("Project UI 2.0: collection loading", () => {
    it("keeps the media grid stable and announces loading accessibly", async () => {
        await act(async () => root.render(<CollectionGridSkeleton />));
        expect(host.querySelectorAll("[data-turbo-skeleton-card]")).toHaveLength(8);
        const status = host.querySelector('[role="status"]');
        expect(status?.getAttribute("aria-busy")).toBe("true");
        expect(status?.textContent).toContain("Loading...");
        expect(host.querySelector('[aria-hidden="true"]')?.classList.contains("motion-reduce:animate-none")).toBe(true);
    });

    it("shows row-shaped placeholders rather than a full-screen spinner for tracks", async () => {
        await act(async () => root.render(<CollectionTracksSkeleton />));
        expect(host.querySelectorAll("[data-turbo-skeleton-track]")).toHaveLength(8);
        expect(host.querySelector('[role="status"]')?.getAttribute("aria-live")).toBe("polite");
    });
});
