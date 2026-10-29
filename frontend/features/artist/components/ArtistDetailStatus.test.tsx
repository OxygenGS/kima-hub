import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/language-context", () => ({
    useLanguage: () => ({ t: (key: string) => key }),
}));

import { translate } from "@/lib/i18n/translations";
import { ArtistDetailStatus } from "./ArtistDetailStatus";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
});

describe("progressive artist information status", () => {
    it("does not show a status after all details are ready", async () => {
        await act(async () => root.render(
            <ArtistDetailStatus loadingMore={false} moreDetailsFailed={false} onRetry={vi.fn()} />,
        ));
        expect(host.textContent).toBe("");
    });

    it("announces a partial artist overview without presenting it as an error", async () => {
        await act(async () => root.render(
            <ArtistDetailStatus loadingMore={true} moreDetailsFailed={false} onRetry={vi.fn()} />,
        ));
        expect(host.querySelector('[role="status"]')?.textContent)
            .toContain("Loading additional artist information...");
        expect(host.querySelector('[role="alert"]')).toBeNull();
        expect(host.querySelector("button")).toBeNull();
    });

    it("keeps the partial page usable and permits retry on enrichment failure", async () => {
        const retry = vi.fn();
        await act(async () => root.render(
            <ArtistDetailStatus loadingMore={false} moreDetailsFailed={true} onRetry={retry} />,
        ));
        expect(host.querySelector('[role="alert"]')?.textContent)
            .toContain("Additional artist information is unavailable.");
        const button = host.querySelector("button");
        expect(button?.textContent).toBe("Try again");
        await act(async () => button?.click());
        expect(retry).toHaveBeenCalledOnce();
    });

    it("has matching English and Dutch translations for both states", () => {
        expect(translate("nl", "Loading additional artist information..."))
            .toBe("Aanvullende artiestinformatie laden...");
        expect(translate("nl", "Additional artist information is unavailable."))
            .toBe("Aanvullende artiestinformatie is niet beschikbaar.");
    });
});
