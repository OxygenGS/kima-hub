import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
    api: { get: vi.fn(), post: vi.fn() },
}));
vi.mock("@/lib/i18n/language-context", () => ({
    useLanguage: () => ({ locale: "en", t: String }),
}));
vi.mock("@/components/ui/SectionHeader", () => ({
    SectionHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
}));

import { api } from "@/lib/api";
import { DowntifySection } from "./DowntifySection";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const none = {
    source: "none", configured: false, enabled: false,
    url: null, username: null, ownerMatches: false,
    tokenConfigured: false, spotifyIntentsEnabled: false,
    trackSubmissionEnabled: false, reconciliationEnabled: false,
    fileVerificationManagedInDocker: true,
};
const paired = {
    ...none, source: "database", configured: true,
    url: "http://downtify:8000/", username: "remote-owner",
    ownerMatches: true, tokenConfigured: true,
};
let host: HTMLDivElement;
let root: Root;
const mount = async () => {
    await act(async () => { root.render(<DowntifySection />); });
};
const button = (label: string) => [...host.querySelectorAll("button")]
    .find(x => x.textContent?.includes(label));
const click = async (label: string) => {
    const b = button(label);
    expect(b, "Missing button: " + label).toBeDefined();
    await act(async () => {
        b?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue(none);
    vi.mocked(api.post).mockResolvedValue({ state: "connected", identityVerified: true, version: "3.2.0" });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
});

describe("Downtify Settings section", () => {
    it("starts unpaired, loads admin status and does not call remote APIs automatically", async () => {
        await mount();
        expect(api.get).toHaveBeenCalledWith("/downtify-integration");
        expect(host.textContent).toContain("Pair Downtify account");
        expect(host.textContent).toContain("Test Downtify connection");
        expect(button("Pair Downtify account")?.disabled).toBe(true);
        expect(api.post).not.toHaveBeenCalled();
    });

    it("never prints saved tokens or unlocks a download after initial load", async () => {
        vi.mocked(api.get).mockResolvedValueOnce(paired);
        await mount();
        expect(host.textContent).toContain("remote-owner");
        expect(host.textContent).toContain("Save Spotify track requests");
        expect(host.textContent).toContain("Enable manual Downtify track submission");
        expect(host.textContent).toContain("Advanced audio and staging verification");
        const secret = host.querySelector<HTMLInputElement>("#downtify-token");
        expect(secret?.value).toBe("");
        expect(secret?.type).toBe("password");
        expect(button("Save Downtify settings")?.disabled).toBe(false);
        expect(api.post).not.toHaveBeenCalled();
    });

    it("probes the encrypted saved pairing without putting credentials in the browser", async () => {
        vi.mocked(api.get).mockResolvedValueOnce(paired);
        await mount();
        await click("Test Downtify connection");
        expect(api.post).toHaveBeenCalledWith("/downtify-integration/test", {});
        expect(host.textContent).toContain("Downtify connection verified.");
        expect(host.textContent).not.toContain("dtfy_");
    });

    it("does not override an operator's existing Docker-managed integration", async () => {
        vi.mocked(api.get).mockResolvedValueOnce({
            ...none, source: "environment", configured: true, enabled: true,
            tokenConfigured: true,
        });
        await mount();
        expect(host.textContent).toContain("already configured through Docker environment variables");
        expect(host.querySelector("#downtify-token")).toBeNull();
        expect(button("Pair Downtify account")).toBeUndefined();
        expect(api.post).not.toHaveBeenCalled();
    });

    it("hides controls if the pairing belongs to a different Kima administrator", async () => {
        vi.mocked(api.get).mockResolvedValueOnce({
            ...paired, ownerMatches: false,
        });
        await mount();
        expect(host.textContent).toContain("another Kima administrator");
        const enabled = host.querySelector<HTMLInputElement>("#downtify-enabled");
        expect(enabled?.disabled).toBe(true);
        expect(button("Save Downtify settings")?.disabled).toBe(true);
        expect(api.post).not.toHaveBeenCalled();
    });

    it("redacts API failures instead of displaying private upstream credentials", async () => {
        vi.mocked(api.get).mockRejectedValueOnce(new Error("dtfy_private_secret"));
        await mount();
        expect(host.querySelector('[role="alert"]')?.textContent)
            .toContain("Could not load Downtify settings.");
        expect(host.textContent).not.toContain("dtfy_private_secret");
    });
});
