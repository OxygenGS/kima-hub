import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
    default: ({ children, prefetch, ...props }: React.ComponentProps<"a"> & { prefetch?: boolean }) =>
        <a {...props}>{children}</a>,
}));
vi.mock("@/lib/i18n/language-context", () => ({
    useLanguage: () => ({ locale: "en", t: (text: string) => text }),
}));

import { DesktopNavigation } from "@/components/layout/DesktopNavigation";
import { AppearanceSection } from "@/features/settings/components/sections/AppearanceSection";
import { UiPreferencesBridge } from "@/components/providers/UiPreferencesBridge";
import { readUiPreferences, updateUiPreferences } from "../ui-preferences";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
    localStorage.clear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
    localStorage.clear();
    delete document.documentElement.dataset.textCase;
});

function mount() {
    act(() => root.render(<>
        <UiPreferencesBridge />
        <DesktopNavigation pathname="/browse/playlists" audiobookshelfEnabled={false} />
        <AppearanceSection />
    </>));
}

describe("v1.27 per-browser appearance controls", () => {
    it("retains the existing lowercase style and visible Browse link by default", () => {
        mount();
        expect(document.documentElement.dataset.textCase).toBe("lowercase");
        expect(readUiPreferences()).toEqual({ textCase: "lowercase", hideBrowse: false });
        expect(host.querySelector('a[href="/browse/playlists"]')).not.toBeNull();
        expect(host.querySelector('a[href="/collection"]')).not.toBeNull();
    });

    it("preserves stored artist casing and immediately hides only the Browse shortcut", () => {
        mount();
        const casing = host.querySelector("#text-capitalization") as HTMLSelectElement;
        act(() => {
            casing.value = "original";
            casing.dispatchEvent(new Event("change", { bubbles: true }));
        });
        expect(document.documentElement.dataset.textCase).toBe("original");
        expect(readUiPreferences().textCase).toBe("original");

        const browse = host.querySelector("#show-browse-nav") as HTMLInputElement;
        expect(browse.checked).toBe(true);
        act(() => browse.click());
        expect(readUiPreferences().hideBrowse).toBe(true);
        expect(host.querySelector('a[href="/browse/playlists"]')).toBeNull();
        expect(host.querySelector('a[href="/collection"]')).not.toBeNull();
        expect(host.querySelector('a[href="/flow"]')).not.toBeNull();

        act(() => browse.click());
        expect(readUiPreferences().hideBrowse).toBe(false);
        expect(host.querySelector('a[href="/browse/playlists"]')).not.toBeNull();
    });

    it("syncs another browser tab's preference and ignores unrecognized values", () => {
        mount();
        act(() => {
            localStorage.setItem("kima-hub-ui-preferences-v1",
                JSON.stringify({ textCase: "original", hideBrowse: true }));
            window.dispatchEvent(new Event("storage"));
        });
        expect(document.documentElement.dataset.textCase).toBe("original");
        expect(host.querySelector('a[href="/browse/playlists"]')).toBeNull();
        act(() => updateUiPreferences({ textCase: "invalid" as never, hideBrowse: false }));
        expect(readUiPreferences()).toEqual({ textCase: "original", hideBrowse: false });
    });

    it("ignores corrupt values and never changes library or server state", () => {
        localStorage.setItem("kima-hub-ui-preferences-v1",
            JSON.stringify({ textCase: "not-a-mode", hideBrowse: "yes" }));
        expect(readUiPreferences()).toEqual({ textCase: "lowercase", hideBrowse: false });
        mount();
        expect(document.documentElement.dataset.textCase).toBe("lowercase");
    });
});
