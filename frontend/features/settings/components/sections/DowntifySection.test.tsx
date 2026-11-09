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
    awaitingImport: 0, processing: 0, awaitingScan: 0,
    imported: 0, needsReview: 0, storageReady: true,
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
        expect(button("Check Downtify setup")?.disabled).toBe(false);
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
                    serverVerified: true, accountVerified: true,
                    musicRootAccessible: true, originalStreamChecked: true,
                    autoImportAvailable: false,
                    importerCutoverAuthorized: false,
                    filesChanged: false,
                };
            }
            return none;
        });
        await mount();
        await click("Check Downtify setup");
        expect(api.get).toHaveBeenCalledWith("/downtify-integration/import-readiness");
        expect(host.textContent).toContain("Original audio transfer is reachable");
        expect(host.textContent).toContain("This check does not import music.");
        const checklist = host.querySelector('[aria-label="Read-only setup checks"]');
        expect(checklist).not.toBeNull();
        expect(checklist?.textContent).toContain("Downtify server identity");
        expect(checklist?.textContent).toContain("Paired Downtify account");
        expect(checklist?.textContent).toContain("Music directory access");
        expect(checklist?.textContent).toContain("Original audio sample");
        expect(host.textContent).toContain("Music folder access does not prove that the correct disk is mounted.");
        expect(checklist?.querySelectorAll("li")).toHaveLength(4);
        expect([...checklist!.querySelectorAll("li")].every(row =>
            row.textContent?.includes("Verified"))).toBe(true);
        expect(api.post).not.toHaveBeenCalled();
        expect(host.textContent).not.toContain("dtfy_");
    });

    it("explains an untested audio sample without treating setup as a failure or starting imports", async () => {
        vi.mocked(api.get).mockImplementation(async (url) => {
            if (url === "/downtify-integration") return { ...paired, enabled: true };
            if (url === "/downtify-integration/native-import") return nativeOff;
            if (url === "/downtify-integration/import-readiness") return {
                state: "no_completed_track", serverVerified: true,
                accountVerified: true, musicRootAccessible: true,
                originalStreamChecked: false, autoImportAvailable: false,
                importerCutoverAuthorized: false, filesChanged: false,
                privatePath: "/private/music", deviceToken: "dtfy_private_secret",
            };
            return none;
        });
        await mount();
        await click("Check Downtify setup");
        const checklist = host.querySelector('[aria-label="Read-only setup checks"]');
        expect(checklist).not.toBeNull();
        expect(host.textContent).toContain("No completed download is available to test");
        expect(checklist?.querySelectorAll("li")).toHaveLength(4);
        expect([...checklist!.querySelectorAll("li")].map(row => row.textContent))
            .toEqual([
                expect.stringContaining("Music directory accessVerified"),
                expect.stringContaining("Downtify server identityVerified"),
                expect.stringContaining("Paired Downtify accountVerified"),
                expect.stringContaining("Original audio sampleNot verified"),
            ]);
        expect(host.textContent).not.toContain("dtfy_private_secret");
        expect(host.textContent).not.toContain("/private/music");
        expect(api.post).not.toHaveBeenCalled();
        expect(host.querySelector<HTMLInputElement>("#downtify-native-auto-import")?.checked)
            .toBe(false);
    });

    it("keeps the setup report private when a read-only probe fails", async () => {
        vi.mocked(api.get).mockImplementation(async (url) => {
            if (url === "/downtify-integration") return { ...paired, enabled: true };
            if (url === "/downtify-integration/native-import") return nativeOff;
            if (url === "/downtify-integration/import-readiness") {
                throw new Error("private source dtfy_private_secret /some/host/path");
            }
            return none;
        });
        await mount();
        await click("Check Downtify setup");
        expect(host.textContent).toContain("Cannot check Downtify right now.");
        expect(host.querySelector('[aria-label="Read-only setup checks"]')).toBeNull();
        expect(host.textContent).not.toContain("dtfy_private_secret");
        expect(host.textContent).not.toContain("/some/host/path");
        expect(api.post).not.toHaveBeenCalled();
    });

    it("clears previous setup results before changing the paired connection", async () => {
        vi.mocked(api.get).mockImplementation(async (url) => {
            if (url === "/downtify-integration") return { ...paired, enabled: true };
            if (url === "/downtify-integration/native-import") return nativeOff;
            if (url === "/downtify-integration/import-readiness") return {
                state: "no_completed_track", serverVerified: true,
                accountVerified: true, musicRootAccessible: true,
                originalStreamChecked: false, autoImportAvailable: false,
                importerCutoverAuthorized: false, filesChanged: false,
            };
            return none;
        });
        await mount();
        await click("Check Downtify setup");
        expect(host.querySelector('[aria-label="Read-only setup checks"]')).not.toBeNull();
        await click("Change connection");
        expect(host.querySelector('[aria-label="Read-only setup checks"]')).toBeNull();
        expect(host.textContent).not.toContain("No completed download is available to test");
        expect(api.post).not.toHaveBeenCalled();
    });

    it("refuses a native import probe when Downtify features are disabled", async () => {
        vi.mocked(api.get).mockResolvedValueOnce(paired);
        await mount();
        expect(button("Check Downtify setup")?.disabled).toBe(true);
        expect(api.get).toHaveBeenCalledTimes(1);
    });

    it("shows distinct owner-scoped import stages without treating indexing as an error", async () => {
        const progress = {
            ...nativeOff, state: "enabled", enabled: true, baselineReady: true,
            awaitingImport: 3, processing: 1, awaitingScan: 4,
            imported: 8, needsReview: 2,
        };
        vi.mocked(api.get).mockImplementation(async (url) =>
            url === "/downtify-integration" ? { ...paired, enabled: true } : progress);
        await mount();
        const activity = host.querySelector('dl[aria-label="Downtify import activity"]');
        expect(activity).not.toBeNull();
        const displayed = [...activity!.querySelectorAll("div")].map(item => [
            item.querySelector("dt")?.textContent, item.querySelector("dd")?.textContent,
        ]);
        expect(displayed).toEqual([
            ["Waiting", "3"],
            ["Claimed / unresolved", "1"],
            ["Waiting for library scan", "4"],
            ["Added to library", "8"],
            ["Needs review", "2"],
        ]);
        expect(host.textContent).toContain("Claimed downloads may still be processing");
        expect(api.get).toHaveBeenCalledTimes(2);
        expect(api.post).not.toHaveBeenCalled();
    });

    it("refreshes import counts only after the owner requests it without starting remote work", async () => {
        let reads = 0;
        vi.mocked(api.get).mockImplementation(async (url) => {
            if (url === "/downtify-integration") return { ...paired, enabled: true };
            if (url === "/downtify-integration/native-import") {
                reads++;
                return { ...nativeOff, awaitingImport: reads, imported: reads - 1 };
            }
            throw new Error("Unexpected remote call: " + url);
        });
        await mount();
        expect(reads).toBe(1);
        expect(host.querySelector('dl[aria-label="Downtify import activity"]')?.textContent)
            .toContain("Waiting1");
        await click("Refresh import status");
        expect(reads).toBe(2);
        expect(host.querySelector('dl[aria-label="Downtify import activity"]')?.textContent)
            .toContain("Waiting2");
        expect(host.querySelector('dl[aria-label="Downtify import activity"]')?.textContent)
            .toContain("Added to library1");
        expect(api.post).not.toHaveBeenCalled();
        expect(api.get).not.toHaveBeenCalledWith("/downtify-integration/import-readiness");
    });

    it("redacts a failed status refresh without replacing previously confirmed counts", async () => {
        let reads = 0;
        vi.mocked(api.get).mockImplementation(async (url) => {
            if (url === "/downtify-integration") return { ...paired, enabled: true };
            if (url === "/downtify-integration/native-import") {
                reads++;
                if (reads === 1) return { ...nativeOff, imported: 9 };
                throw new Error("dtfy_private_secret /private/music");
            }
            return none;
        });
        await mount();
        await click("Refresh import status");
        expect(host.querySelector('[role="alert"]')?.textContent)
            .toContain("Could not refresh import status.");
        expect(host.querySelector('dl[aria-label="Downtify import activity"]')?.textContent)
            .toContain("Added to library9");
        expect(host.textContent).not.toContain("dtfy_private_secret");
        expect(host.textContent).not.toContain("/private/music");
        expect(api.post).not.toHaveBeenCalled();
    });

    it("keeps native importing OFF until the administrator confirms storage and single-writer safety", async () => {
        vi.mocked(api.get).mockResolvedValueOnce({ ...paired, enabled: true });
        await mount();
        const toggle = host.querySelector<HTMLInputElement>("#downtify-native-auto-import");
        expect(toggle?.checked).toBe(false);
        expect(toggle?.disabled).toBe(true);
        expect(host.textContent).toContain("New installation: no previous importer to stop.");
        expect(host.textContent).toContain("I verified the music storage is mounted and writable");
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

    it("explains incomplete Downtify source snapshots without revealing upstream details", async () => {
        vi.mocked(api.get).mockResolvedValueOnce({ ...paired, enabled: true });
        await mount();
        const consent = host.querySelector<HTMLInputElement>("#downtify-native-cutover-ack");
        await act(async () => { consent?.click(); });
        vi.mocked(api.post).mockRejectedValueOnce({
            response: { data: { state: "source_unavailable", privateToken: "dtfy_private_secret" } },
        });
        await act(async () => {
            host.querySelector<HTMLInputElement>("#downtify-native-auto-import")?.click();
        });
        expect(host.querySelector('[role="alert"]')?.textContent)
            .toContain("Downtify cannot provide a complete initial snapshot");
        expect(host.querySelector<HTMLInputElement>("#downtify-native-auto-import")?.checked)
            .toBe(false);
        expect(host.textContent).not.toContain("dtfy_private_secret");
    });

    it("explains storage configuration failures on any deployment without disclosing paths", async () => {
        vi.mocked(api.get).mockResolvedValueOnce({ ...paired, enabled: true });
        await mount();
        const consent = host.querySelector<HTMLInputElement>("#downtify-native-cutover-ack");
        await act(async () => { consent?.click(); });
        vi.mocked(api.post).mockRejectedValueOnce({
            response: { data: { state: "storage_unavailable", path: "/private/music" } },
        });
        await act(async () => {
            host.querySelector<HTMLInputElement>("#downtify-native-auto-import")?.click();
        });
        expect(host.querySelector('[role="alert"]')?.textContent)
            .toContain("Kima cannot verify the music storage.");
        expect(host.textContent).not.toContain("/private/music");
    });

    it("explains the missing music disk without disclosing private paths", async () => {
        vi.mocked(api.get).mockImplementation(async (url) => {
            if (url === "/downtify-integration") return { ...paired, enabled:true };
            if (url === "/downtify-integration/native-import") return {
                ...nativeOff, state:"enabled",enabled:true,
                baselineReady:true,storageReady:false,
            };
            return none;
        });
        await mount();
        expect(host.textContent).toContain(
            "Music storage is unavailable. Automatic importing is paused until the correct disk returns."
        );
        expect(host.textContent).toContain(
            "Automatic import is paused because the verified music storage is unavailable."
        );
        expect(host.querySelector('[role="alert"]')?.textContent)
            .toContain("Music storage is unavailable");
        expect(api.post).not.toHaveBeenCalled();
    });

    it("warns about a missing existing music volume even while importing is paused", async () => {
        vi.mocked(api.get).mockImplementation(async (url) => {
            if (url === "/downtify-integration") return { ...paired, enabled: true };
            if (url === "/downtify-integration/native-import") return {
                ...nativeOff, baselineReady: true, storageReady: false,
            };
            return none;
        });
        await mount();
        expect(host.querySelector('[role="alert"]')?.textContent)
            .toContain("Music storage is unavailable.");
        expect(api.post).not.toHaveBeenCalled();
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

    it("only offers metadata-only recovery for an enabled owner with review items", async () => {
        vi.mocked(api.get).mockImplementation(async (url: string) => {
            if (url === "/downtify-integration") return { ...paired,enabled:true };
            if (url === "/downtify-integration/native-import") return {
                ...nativeOff,state:"enabled",enabled:true,baselineReady:true,
                needsReview:1,storageReady:true,
            };
            return {};
        });
        vi.mocked(api.post).mockResolvedValueOnce({state:"requeued"});
        await mount();
        expect(button("Retry one safely unwritten Spotify lookup")).not.toBeUndefined();
        expect(api.post).not.toHaveBeenCalled();
        await click("Retry one safely unwritten Spotify lookup");
        expect(api.post).toHaveBeenCalledWith(
            "/downtify-integration/native-import/retry-identity",
            {acknowledgeSafeRetry:true},
        );
        expect(host.textContent).toContain(
            "One verified unwritten Spotify lookup was released for safe retry."
        );
    });

    it("does not offer a safe retry when no review exists or music storage is missing", async () => {
        vi.mocked(api.get).mockImplementation(async (url: string) =>
            url === "/downtify-integration" ? {...paired,enabled:true} : {
                ...nativeOff,state:"enabled",enabled:true,baselineReady:true,
                needsReview:1,storageReady:false,
            });
        await mount();
        expect(button("Retry one safely unwritten Spotify lookup")).toBeUndefined();
        expect(api.post).not.toHaveBeenCalled();
    });

    it("keeps native import strictly unavailable to a different Kima administrator", async () => {
        vi.mocked(api.get).mockResolvedValueOnce({
            ...paired, ownerMatches: false,
        });
        await mount();
        expect(host.querySelector<HTMLInputElement>("#downtify-native-auto-import")?.disabled).toBe(true);
        expect(host.querySelector("#downtify-native-cutover-ack")).toBeNull();
        expect(button("Refresh import status")).toBeUndefined();
        expect(host.querySelector('dl[aria-label="Downtify import activity"]')).toBeNull();
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
