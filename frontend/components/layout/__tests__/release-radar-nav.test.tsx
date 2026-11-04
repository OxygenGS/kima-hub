import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/releases" }));
vi.mock("next/link", () => ({
    default: (p: { href: string; children: React.ReactNode; "aria-current"?: string }) =>
        <a href={p.href} aria-current={p["aria-current"]}>{p.children}</a>,
}));
vi.mock("@/lib/i18n/language-context", () => ({
    useLanguage: () => ({ locale: "nl", t: (text: string) => text }),
}));
vi.mock("@/lib/branding-context", () => ({
    useBranding: () => ({ branding: { name: "Chillverse" } }),
}));
vi.mock("@/lib/auth-context", () => ({
    useAuth: () => ({ logout: vi.fn(async () => {}) }),
}));
vi.mock("@/lib/api", () => ({ api: { scanLibrary: vi.fn(async () => {}) } }));
vi.mock("@/lib/notify", () => ({ notify: { error: vi.fn() } }));
vi.mock("@/lib/version", () => ({ APP_VERSION: "1.17.0" }));
vi.mock("@/components/ui/KimaMark", () => ({ KimaMark: () => null }));
vi.mock("@/components/whats-new/WhatsNewGate", () => ({ openWhatsNew: vi.fn() }));

import { DesktopNavigation, isNavigationActive } from "../DesktopNavigation";
import { MobileSidebar } from "../MobileSidebar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

describe("release radar navigation", () => {
    it("offers the already existing page in desktop Explore navigation", async () => {
        await act(async () => root.render(
            <DesktopNavigation pathname="/releases" audiobookshelfEnabled={true} />
        ));
        const link = host.querySelector('a[href="/releases"]');
        expect(link?.textContent).toContain("Release Radar");
        expect(link?.getAttribute("aria-current")).toBe("page");
        expect(isNavigationActive("/releases/a", "/releases")).toBe(true);
        expect(isNavigationActive("/releases-old", "/releases")).toBe(false);
    });

    it("offers the same page on mobile while keeping customized branding", async () => {
        await act(async () => root.render(<MobileSidebar isOpen={true} onClose={vi.fn()} />));
        const link = host.querySelector('a[href="/releases"]');
        expect(link?.textContent).toContain("Release Radar");
        expect(link?.getAttribute("aria-current")).toBe("page");
        expect(host.textContent).toContain("Chillverse");
    });
});
