import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ locale: "en" as "en" | "nl" }));
vi.mock("@/lib/i18n/language-context", () => ({
    useLanguage: () => ({ locale: state.locale, t: (value: string) => value }),
}));
vi.mock("@/components/layout/PageHeader", () => ({
    PageHeader: ({ title, description }: { title: string; description?: string }) =>
        <header><h1>{title}</h1><p>{description}</p></header>,
}));

import { SettingsLayout } from "@/features/settings/components/ui/SettingsLayout";
import { SETTINGS_ITEMS } from "@/features/settings/components/ui/SettingsNavigation";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
    state.locale = "en";
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
});

function renderSettings(
    activeSection: string,
    isAdmin: boolean,
    onChange = vi.fn(),
    children: React.ReactNode = <p>Panel content</p>,
) {
    return act(async () => root.render(
        <SettingsLayout
            sidebarItems={SETTINGS_ITEMS}
            isAdmin={isAdmin}
            activeSection={activeSection}
            onSectionChange={onChange}
            footer={<p data-testid="save-bar">Save bar stays available</p>}
        >
            {children}
        </SettingsLayout>,
    ));
}

describe("Settings Studio layout", () => {
    it("shows a grouped overview, hiding administrative links from members", async () => {
        await renderSettings("overview", false);
        expect(host.textContent).toContain("Your settings, at a glance");
        expect(host.textContent).toContain("Personal");
        expect(host.textContent).not.toContain("Manage people and access");
        expect(host.querySelector('option[value="users"]')).toBeNull();
        expect(host.querySelector('option[value="lidarr"]')).toBeNull();
        expect(host.querySelector('[data-testid="save-bar"]')).not.toBeNull();
        expect(host.querySelector('#settings-main > div[hidden]')).not.toBeNull();
    });

    it("renders admin categories and navigates via sidebar and mobile select", async () => {
        const onChange = vi.fn();
        await renderSettings("overview", true, onChange);
        const nav = host.querySelector('nav[aria-label="Settings navigation"]');
        const artwork = Array.from(nav?.querySelectorAll("button") ?? []).find(button => button.textContent?.includes("Artwork"));
        expect(artwork).toBeDefined();
        await act(async () => artwork?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
        expect(onChange).toHaveBeenCalledWith("artwork");

        const selector = host.querySelector("select") as HTMLSelectElement;
        expect(selector.querySelector('option[value="lidarr"]')).not.toBeNull();
        await act(async () => {
            selector.value = "lidarr";
            selector.dispatchEvent(new Event("change", { bubbles: true }));
        });
        expect(onChange).toHaveBeenCalledWith("lidarr");
    });

    it("keeps local forms mounted when switching between overview and sections", async () => {
        let mounted = 0;
        let unmounted = 0;
        function PersistentForm() {
            useEffect(() => {
                mounted += 1;
                return () => { unmounted += 1; };
            }, []);
            return <input aria-label="Example draft value" defaultValue="unfinished" />;
        }
        const child = <PersistentForm />;
        await renderSettings("account", true, vi.fn(), child);
        expect(mounted).toBe(1);
        await renderSettings("overview", true, vi.fn(), child);
        expect(mounted).toBe(1);
        expect(unmounted).toBe(0);
        expect((host.querySelector('input[aria-label="Example draft value"]') as HTMLInputElement)?.value).toBe("unfinished");
        await renderSettings("account", true, vi.fn(), child);
        expect(mounted).toBe(1);
        expect(unmounted).toBe(0);
    });

    it("switches category copy when the language changes", async () => {
        await renderSettings("overview", true);
        state.locale = "nl";
        await renderSettings("overview", true);
        expect(host.textContent).toContain("Jouw instellingen in één oogopslag");
        expect(host.querySelector('nav[aria-label="Navigatie instellingen"]')).not.toBeNull();
        expect(host.textContent).toContain("Muziekbibliotheek");
    });
});
