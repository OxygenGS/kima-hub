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
const nativeOff = {
    state: "paused", enabled: false, baselineReady: false,
    awaitingImport: 0, needsReview: 0, legacyHostVerified: false,
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
    await act(async () => { b?.click(); });
};
const choose = async (value: "off" | "queue" | "requests" | "downloads") => {
    const radio = host.querySelector<HTMLInputElement>(
        'input[type="radio"][name="downtify-usage"][value="' + value + '"]'
    );
    expect(radio, "Missing mode: " + value).not.toBeNull();
    await act(async () => { radio?.click(); });
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation(async (url) =>
        url === "/downtify-integration/native-import" ? nativeOff : none);
    vi.mocked(api.post).mockResolvedValue({ state: "connected", identityVerified: true, version: "3.2.0" });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
});

describe("Simple Downtify Settings section", () => {
    it("shows one-time pairing only before a connection exists, never sends automatic requests", async () => {
        await mount();
        expect(api.get).toHaveBeenCalledWith("/downtify-integration");
        expect(host.textContent).toContain("Connect Downtify");
        expect(host.textContent).toContain("Pair Downtify account");
        expect(button("Pair Downtify account")?.disabled).toBe(true);
        expect(host.querySelector("#downtify-token")).not.toBeNull();
        expect(host.querySelector('[name="downtify-usage"]')).toBeNull();
        expect(api.post).not.toHaveBeenCalled();
    });

    it("shows a linked account and simple choices but hides the stored connection form", async () => {
        vi.mocked(api.get).mockResolvedValueOnce(paired);
        await mount();
        expect(host.textContent).toContain("Downtify account linked");
        expect(host.textContent).toContain("remote-owner");
        expect(host.textContent).toContain("Features paused");
        expect(host.textContent).toContain("What do you want to do with Downtify?");
        expect(host.querySelector<HTMLInputElement>('input[value="off"]')?.checked).toBe(true);
        expect(host.querySelector("#downtify-token")).toBeNull();
        expect(host.textContent).not.toContain("dtfy_");
        expect(button("Save choice")?.disabled).toBe(true);
        expect(api.post).not.toHaveBeenCalled();
    });

    it("tests the stored encrypted device without exposing it in any browser payload", async () => {
        vi.mocked(api.get).mockResolvedValueOnce(paired);
        await mount();
        await click("Test connection");
        expect(api.post).toHaveBeenCalledWith("/downtify-integration/test", {});
        expect(host.textContent).toContain("Downtify connection verified.");
        expect(host.textContent).not.toContain("dtfy_");
    });

    it("reveals token replacement only after the operator chooses to change connection", async () => {
        vi.mocked(api.get).mockResolvedValueOnce(paired);
        await mount();
        expect(host.querySelector("#downtify-url")).toBeNull();
        await click("Change connection");
        expect(host.querySelector<HTMLInputElement>("#downtify-token")?.value).toBe("");
        expect(host.querySelector<HTMLInputElement>("#downtify-token")?.type).toBe("password");
        expect(button("Replace Downtify pairing")?.disabled).toBe(true);
        await click("Close connection settings");
        expect(host.querySelector("#downtify-token")).toBeNull();
    });

    it("does not send any change until Save choice is pressed", async () => {
        vi.mocked(api.get).mockResolvedValueOnce(paired);
        await mount();
        await choose("queue");
        expect(host.textContent).toContain("Unsaved changes");
        expect(api.post).not.toHaveBeenCalled();
        expect(button("Save choice")?.disabled).toBe(false);
        vi.mocked(api.post).mockResolvedValueOnce({ ...paired, enabled: true });
        await click("Save choice");
        expect(api.post).toHaveBeenCalledWith("/downtify-integration/controls", {
            enabled: true, spotifyIntentsEnabled: false,
            trackSubmissionEnabled: false, reconciliationEnabled: false,
            acknowledgeTrackSubmission: false,
        });
        expect(host.textContent).toContain("Downtify settings saved.");
        expect(button("Save choice")?.disabled).toBe(true);
    });

    it("maps Spotify requests to request storage without enabling downloads", async () => {
        vi.mocked(api.get).mockResolvedValueOnce(paired);
        await mount();
        await choose("requests");
        vi.mocked(api.post).mockResolvedValueOnce({
            ...paired, enabled: true, spotifyIntentsEnabled: true,
        });
        await click("Save choice");
        expect(api.post).toHaveBeenCalledWith("/downtify-integration/controls", {
            enabled: true, spotifyIntentsEnabled: true,
            trackSubmissionEnabled: false, reconciliationEnabled: false,
            acknowledgeTrackSubmission: false,
        });
    });

    it("requires fresh confirmation before permitting manual downloads", async () => {
        vi.mocked(api.get).mockResolvedValueOnce(paired);
        await mount();
        await choose("downloads");
        expect(button("Save choice")?.disabled).toBe(true);
        expect(api.post).not.toHaveBeenCalled();
        const consent = host.querySelector<HTMLInputElement>("#downtify-dispatch-ack");
        expect(consent?.checked).toBe(false);
        await act(async () => { consent?.click(); });
        expect(button("Save choice")?.disabled).toBe(false);
        vi.mocked(api.post).mockResolvedValueOnce({
            ...paired, enabled: true, spotifyIntentsEnabled: true,
            trackSubmissionEnabled: true,
        });
        await click("Save choice");
        expect(api.post).toHaveBeenCalledWith("/downtify-integration/controls", {
            enabled: true, spotifyIntentsEnabled: true,
            trackSubmissionEnabled: true, reconciliationEnabled: false,
            acknowledgeTrackSubmission: true,
        });
    });

    it("keeps completed-job checks an explicit advanced opt-in", async () => {
        vi.mocked(api.get).mockResolvedValueOnce(paired);
        await mount();
        await choose("requests");
        await click("More options");
        const toggle = host.querySelector<HTMLInputElement>("#downtify-reconciliation");
        expect(toggle?.checked).toBe(false);
        expect(toggle?.disabled).toBe(false);
        await act(async () => { toggle?.click(); });
        expect(toggle?.checked).toBe(true);
        await choose("off");
        expect(host.querySelector<HTMLInputElement>("#downtify-reconciliation")?.checked).toBe(false);
        expect(api.post).not.toHaveBeenCalled();
    });

    it("leaves a Docker-managed integration completely untouched", async () => {
        vi.mocked(api.get).mockResolvedValueOnce({
            ...none, source: "environment", configured: true, enabled: true,
            tokenConfigured: true,
        });
        await mount();
        expect(host.textContent).toContain("already configured through Docker environment variables");
        expect(host.querySelector("#downtify-token")).toBeNull();
        expect(host.querySelector('[name="downtify-usage"]')).toBeNull();
        expect(api.post).not.toHaveBeenCalled();
    });

    it("does not expose controls or replacement to another Kima administrator", async () => {
        vi.mocked(api.get).mockResolvedValueOnce({
            ...paired, ownerMatches: false,
        });
        await mount();
        expect(host.textContent).toContain("another Kima administrator");
        expect(button("Change connection")).toBeUndefined();
        expect(host.querySelector("#downtify-token")).toBeNull();
        const radio = host.querySelector<HTMLInputElement>('input[value="queue"]');
        expect(radio?.disabled).toBe(true);
        expect(button("Save choice")?.disabled).toBe(true);
        expect(api.post).not.toHaveBeenCalled();
    });

    it("does not probe native import automatically and keeps the old importer active", async () => {
        vi.mocked(api.get).mockResolvedValueOnce({
            ...paired, enabled: true,
        });
        await mount();
        expect(host.textContent).toContain("Automatic library import");
        expect(host.textContent).toContain("Automatically add downloaded music");
        const toggle = host.querySelector<HTMLInputElement>("#downtify-native-auto-import");
        expect(toggle?.checked).toBe(false);
        expect(toggle?.disabled).toBe(true);
        expect(button("Test direct audio transfer")?.disabled).toBe(false);
        expect(api.get).toHaveBeenCalledTimes(2);
        expect(api.post).not.toHaveBeenCalled();
    });

    it("reports a safe original audio probe without enabling import or exposing credentials", async () => {
        vi.mocked(api.get).mockImplementation(async (url) => {
            if (url === "/downtify-integration") return { ...paired, enabled: true };
            if (url === "/downtify-integration/native-import") return nativeOff;
            if (url === "/downtify-integration/import-readiness") {
                return {
                    state: "original_stream_verified",
                    originalStreamChecked: true,
                    autoImportAvailable: false,
                    importerCutoverAuthorized: false,
                    filesChanged: false,
                };
            }
            return none;
        });
        await mount();
        await click("Test direct audio transfer");
        expect(api.get).toHaveBeenCalledWith("/downtify-integration/import-readiness");
        expect(host.textContent).toContain("Original audio transfer is reachable");
        expect(host.textContent).toContain("Automatic importing is not enabled yet");
        expect(api.post).not.toHaveBeenCalled();
        expect(host.textContent).not.toContain("dtfy_");
    });

    it("refuses a native import probe when Downtify features are disabled", async () => {
        vi.mocked(api.get).mockResolvedValueOnce(paired);
        await mount();
        expect(button("Test direct audio transfer")?.disabled).toBe(true);
        expect(api.get).toHaveBeenCalledTimes(1);
    });

    it("keeps native importing OFF until the operator confirms the one-time cutover", async () => {
        vi.mocked(api.get).mockResolvedValueOnce({ ...paired, enabled: true });
        await mount();
        const toggle = host.querySelector<HTMLInputElement>("#downtify-native-auto-import");
        expect(toggle?.checked).toBe(false);
        expect(toggle?.disabled).toBe(true);
        expect(host.textContent).toContain("I have stopped any old importer");
        expect(api.post).not.toHaveBeenCalled();
        const consent = host.querySelector<HTMLInputElement>("#downtify-native-cutover-ack");
        await act(async () => { consent?.click(); });
        expect(toggle?.disabled).toBe(false);
        expect(api.post).not.toHaveBeenCalled();
    });

    it("enables one-switch import with exactly one explicit confirmation, never silently", async () => {
        vi.mocked(api.get).mockResolvedValueOnce({ ...paired, enabled: true });
        await mount();
        const consent = host.querySelector<HTMLInputElement>("#downtify-native-cutover-ack");
        await act(async () => { consent?.click(); });
        const toggle = host.querySelector<HTMLInputElement>("#downtify-native-auto-import");
        vi.mocked(api.post).mockResolvedValueOnce({
            ...nativeOff, state: "enabled", enabled: true, baselineReady: true,
        });
        await act(async () => { toggle?.click(); });
        expect(api.post).toHaveBeenCalledWith("/downtify-integration/native-import", {
            enabled: true, acknowledgeSingleWriter: true,
        });
        expect(host.textContent).toContain("Automatic importing enabled.");
        expect(host.querySelector<HTMLInputElement>("#downtify-native-auto-import")?.checked).toBe(true);
        expect(host.textContent).not.toContain("dtfy_");
    });

    it("pauses a running native importer with one click and no new confirmation", async () => {
        vi.mocked(api.get).mockImplementation(async (url) => {
            if (url === "/downtify-integration") return { ...paired, enabled: true };
            if (url === "/downtify-integration/native-import") {
                return { ...nativeOff, state: "enabled", enabled: true, baselineReady: true };
            }
            return none;
        });
        await mount();
        const toggle = host.querySelector<HTMLInputElement>("#downtify-native-auto-import");
        expect(toggle?.checked).toBe(true);
        expect(toggle?.disabled).toBe(false);
        vi.mocked(api.post).mockResolvedValueOnce({ ...nativeOff, baselineReady: true });
        await act(async () => { toggle?.click(); });
        expect(api.post).toHaveBeenCalledWith("/downtify-integration/native-import", {
            enabled: false, acknowledgeSingleWriter: false,
        });
        expect(host.querySelector<HTMLInputElement>("#downtify-native-auto-import")?.checked).toBe(false);
    });

    it("keeps native import strictly unavailable to a different Kima administrator", async () => {
        vi.mocked(api.get).mockResolvedValueOnce({
            ...paired, ownerMatches: false,
        });
        await mount();
        expect(host.querySelector<HTMLInputElement>("#downtify-native-auto-import")?.disabled).toBe(true);
        expect(host.querySelector("#downtify-native-cutover-ack")).toBeNull();
        expect(api.get).not.toHaveBeenCalledWith("/downtify-integration/native-import");
    });

    it("redacts failures instead of displaying private remote tokens or errors", async () => {
        vi.mocked(api.get).mockRejectedValueOnce(new Error("dtfy_private_secret"));
        await mount();
        expect(host.querySelector('[role="alert"]')?.textContent)
            .toContain("Could not load Downtify settings.");
        expect(host.textContent).not.toContain("dtfy_private_secret");
    });
});
