import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "@/components/layout/Sidebar";
import { translate } from "@/lib/i18n/translations";

const state = vi.hoisted(() => ({
    pathname: "/", mobile: false,
    createPlaylist: vi.fn(), push: vi.fn(), invalidate: vi.fn(), error: vi.fn(),
    playlists: [
        { id: "visible", name: "Evening collection", trackCount: 4 },
        { id: "hidden", name: "Hidden collection", trackCount: 3, isHidden: true },
    ],
}));
vi.mock("next/link", () => ({
    default: ({ children, prefetch, ...props }: React.ComponentProps<"a"> & { prefetch?: boolean }) => <a {...props} data-prefetch={String(prefetch)}>{children}</a>,
}));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname, useRouter: () => ({ push: state.push }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("@/lib/features-context", () => ({ useFeatures: () => ({ audiobookshelfEnabled: false }) }));
vi.mock("@/lib/i18n/language-context", () => ({ useLanguage: () => ({ locale: "nl", t: (key: string) => translate("nl", key) }) }));
vi.mock("@/hooks/useMediaQuery", () => ({ useIsMobile: () => state.mobile, useIsTablet: () => false }));
vi.mock("@/hooks/useQueries", () => ({ queryKeys: { playlists: () => ["playlists"] } }));
vi.mock("@tanstack/react-query", () => ({
    useQuery: () => ({ data: state.playlists, isLoading: false }),
    useQueryClient: () => ({ invalidateQueries: state.invalidate }),
}));
vi.mock("@/lib/api", () => ({ api: { createPlaylist: state.createPlaylist, getPlaylists: vi.fn() } }));
vi.mock("@/lib/notify", () => ({ notify: { error: state.error } }));
vi.mock("@/components/layout/MobileSidebar", () => ({ MobileSidebar: ({ isOpen }: { isOpen: boolean }) => <div data-mobile-open={String(isOpen)} /> }));
vi.mock("@/components/ui/Button", () => ({
    Button: ({ children, variant, size, ...props }: React.ComponentProps<"button"> & { variant?: string; size?: string }) => <button {...props} data-variant={variant} data-size={size}>{children}</button>,
}));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
    vi.clearAllMocks(); state.pathname = "/"; state.mobile = false;
    state.createPlaylist.mockResolvedValue({ id: "new-list" });
    state.invalidate.mockResolvedValue(undefined);
    host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

function clickCreate() {
    const button = host.querySelector(`button[aria-label="${translate("nl", "Create playlist")}"]`) as HTMLButtonElement;
    act(() => button.click());
}

describe("redesigned sidebar keeps playlist and drawer behavior", () => {
    it("preserves hidden-playlist filtering, routes and translated metadata", () => {
        act(() => root.render(<Sidebar />));
        expect(host.textContent).toContain("Evening collection");
        expect(host.textContent).not.toContain("Hidden collection");
        expect(host.textContent).toContain("4 nummers");
        expect(host.querySelector('a[href="/playlist/visible"]')).not.toBeNull();
    });
    it("creates a playlist from the keyboard and refreshes the original cache", async () => {
        act(() => root.render(<Sidebar />)); clickCreate();
        const input = host.querySelector("input") as HTMLInputElement;
        act(() => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "  New playlist  ");
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
        expect(state.createPlaylist).toHaveBeenCalledWith("New playlist");
        expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ["playlists"] });
        expect(state.push).toHaveBeenCalledWith("/playlist/new-list");
    });
    it("rejects empty names and closes the editor with Escape", async () => {
        act(() => root.render(<Sidebar />)); clickCreate();
        const input = host.querySelector("input") as HTMLInputElement;
        await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
        expect(state.createPlaylist).not.toHaveBeenCalled();
        act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
        expect(host.querySelector("input")).toBeNull();
    });
    it("keeps the existing mobile drawer event instead of rendering desktop navigation", () => {
        state.mobile = true; act(() => root.render(<Sidebar />));
        expect(host.querySelector("aside")).toBeNull();
        act(() => window.dispatchEvent(new Event("toggle-mobile-menu")));
        expect(host.querySelector('[data-mobile-open="true"]')).not.toBeNull();
    });
});
