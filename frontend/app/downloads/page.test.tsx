import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: mocks.auth }));
vi.mock("@/lib/api", () => ({ api: { get: mocks.get } }));
vi.mock("@/lib/i18n/language-context", () => ({
    useLanguage: () => ({ locale: "nl", t: (key: string) => key }),
}));
vi.mock("@/components/layout/PageHeader", () => ({
    PageHeader: ({ title, description, actions }: {
        title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode;
    }) => <header><h1>{title}</h1><p>{description}</p>{actions}</header>,
}));
import DownloadsPage from "./page";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
const download = (subject = "Kima Track") => ({
    items: [{ id: "j1", subject, engine: "soulseek", phase: "downloaded",
        createdAt: "2026-11-04T12:00:00.000Z" }],
    total: 1, hasMore: false,
});
beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockReturnValue({ isAuthenticated: true, isLoading: false,
        user: { id: "account-A", role: "user" } });
    mocks.get.mockResolvedValue(download());
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
});
const mount = async () => act(async () => root.render(<DownloadsPage />));
describe("Download Manager without retired external importer", () => {
    it("renders only authenticated Kima jobs and never queries any remote provider", async () => {
        await mount();
        expect(host.textContent).toContain("Kima Track");
        expect(host.textContent).toContain("Soulseek");
        expect(host.querySelector('[aria-labelledby="kima-downloads-title"]')).not.toBeNull();
        expect(mocks.get).toHaveBeenCalledTimes(1);
        expect(mocks.get).toHaveBeenCalledWith("/download-manager/jobs?limit=50&offset=0");
        expect(host.textContent).not.toContain("Downtify");
    });
    it("does not retain another user's results after an account change", async () => {
        await mount();
        mocks.auth.mockReturnValue({ isAuthenticated: true, isLoading: false,
            user: { id: "account-B", role: "user" } });
        mocks.get.mockImplementation(() => new Promise(() => {}));
        await mount();
        expect(host.textContent).not.toContain("Kima Track");
    });
    it("hides content immediately after logout", async () => {
        await mount();
        mocks.auth.mockReturnValue({ isAuthenticated: false, isLoading: false, user: null });
        await mount();
        expect(host.textContent).not.toContain("Kima Track");
    });
    it("fails closed without leaking errors from the download API", async () => {
        mocks.get.mockRejectedValueOnce(new Error("private API key"));
        await mount();
        expect(host.textContent).toContain("Could not load Kima downloads.");
        expect(host.textContent).not.toContain("private API key");
    });
});
