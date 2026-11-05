import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: mocks.auth }));
vi.mock("@/lib/api", () => ({ api: { get: mocks.get, post: mocks.post } }));
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
const kima = (name: string) => ({
    items: [{
        id: "k1", subject: name, engine: "soulseek", phase: "downloaded",
        progress: null, libraryVerification: "not_checked",
        createdAt: "2026-11-04T12:00:00.000Z",
    }],
    total: 1, displayed: 1, hasMore: false, downtifyJobsIncluded: false,
});
const remote = (name: string) => ({
    state: "ready",
    items: [{
        id: "d1", subject: name, engine: "downtify", phase: "processing",
        progress: 42.5, libraryVerification: "not_checked",
    }],
    displayed: 1, hasMore: false,
});
const mount = async () => {
    await act(async () => {
        root.render(<DownloadsPage />);
    });
};

beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockReturnValue({
        isAuthenticated: true, isLoading: false,
        user: { id: "first-user", role: "user" },
    });
    mocks.get.mockImplementation(async (path: string) => {
        if (path.startsWith("/download-manager/spotify/dispatch-capability")) {
            return { state: "disabled", canSubmit: false, singleTrackOnly: true };
        }
        if (path.startsWith("/download-manager/spotify/intents")) {
            return {
                enabled: false, items: [], total: 0,
                displayed: 0, hasMore: false, isDownloadQueue: false,
            };
        }
        return path.startsWith("/download-manager/downtify/jobs")
            ? remote("Downtify Track")
            : kima("Kima Track");
    });
    mocks.post.mockReset().mockResolvedValue({
        provider: "spotify", kind: "track",
        canonicalUrl: "https://open.spotify.com/track/0123456789ABCDEFGHIJKL",
        intentKey: "spotify:track:0123456789ABCDEFGHIJKL",
        duplicateCheck: "not_checked", downloadStarted: false,
        libraryVerification: "not_checked", submissionEnabled: false,
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
});

describe("first Unified Download Manager page", () => {
    it("shows separately scoped Kima and Downtify rows without suggesting an indexed import", async () => {
        await mount();
        expect(host.querySelector("h1")?.textContent).toBe("Download Manager");
        expect(host.querySelector('[aria-labelledby="kima-downloads-title"]')?.textContent).toContain("Kima Track");
        expect(host.querySelector('[aria-labelledby="downtify-downloads-title"]')?.textContent).toContain("Downtify Track");
        expect(host.textContent).toContain("Download complete (index not checked)");
        expect(host.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("42.5");
        expect(host.querySelector('button[aria-label="Refresh download status"]')).not.toBeNull();
        expect(mocks.get).toHaveBeenCalledWith("/download-manager/jobs?limit=50&offset=0");
        expect(mocks.get).toHaveBeenCalledWith("/download-manager/downtify/jobs");
        expect(host.querySelector('button[type="submit"]')).toBeNull();
    });

    it("does not invent Downtify rows for an unbound account", async () => {
        mocks.get.mockImplementation(async (path: string) =>
            path.includes("/downtify/")
                ? { state: "unbound", items: [], displayed: 0, hasMore: false }
                : kima("Personal Kima Track"));
        await mount();
        expect(host.textContent).toContain("No Downtify account is linked to this user.");
        expect(host.textContent).toContain("Personal Kima Track");
        expect(host.textContent).not.toContain("Downtify Track");
    });

    it("shows a working engine when the other endpoint fails", async () => {
        mocks.get.mockImplementation(async (path: string) => {
            if (path.includes("/downtify/")) throw new Error("secret remote URL");
            return kima("Working Kima Track");
        });
        await mount();
        expect(host.textContent).toContain("Working Kima Track");
        expect(host.textContent).toContain("Could not load Downtify status.");
        expect(host.textContent).not.toContain("secret remote URL");
    });

    it("removes previous user's rows as soon as the authenticated account changes", async () => {
        await mount();
        expect(host.textContent).toContain("Kima Track");
        expect(host.textContent).toContain("Downtify Track");

        // Delayed new user's API responses must never display the old user's data.
        mocks.auth.mockReturnValue({
            isAuthenticated: true, isLoading: false,
            user: { id: "second-user", role: "user" },
        });
        mocks.get.mockImplementation(() => new Promise(() => {}));
        await mount();
        expect(host.textContent).not.toContain("Kima Track");
        expect(host.textContent).not.toContain("Downtify Track");
        expect(host.textContent).toContain("Loading...");
    });

    it("hides all rows immediately when the session ends", async () => {
        await mount();
        mocks.auth.mockReturnValue({ isAuthenticated: false, isLoading: false, user: null });
        await mount();
        expect(host.querySelector("h1")).toBeNull();
        expect(host.textContent).not.toContain("Kima Track");
    });
});


async function enterSpotifyLink(value: string) {
    const input = host.querySelector<HTMLInputElement>("#spotify-intake-link");
    expect(input).not.toBeNull();
    await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, "value"
        )?.set;
        setter?.call(input, value);
        input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

describe("Spotify link preview — no download or import actions", () => {
    const link = "https://open.spotify.com/track/0123456789ABCDEFGHIJKL";

    it("hides link intake from listeners without track download permission", async () => {
        await mount();
        expect(host.querySelector("#spotify-intake-link")).toBeNull();
        expect(mocks.post).not.toHaveBeenCalled();
    });

    it("shows a non-downloading link preview form to permitted users", async () => {
        mocks.auth.mockReturnValue({
            isAuthenticated: true, isLoading: false,
            user: { id: "first-user", role: "user", canDownloadTracks: true },
        });
        await mount();
        expect(host.textContent).toContain("Check Spotify link");
        expect(host.textContent).toContain("Track submission requires an explicitly configured Downtify connection.");
        expect(host.querySelector("#spotify-intake-link")).not.toBeNull();
        expect(host.querySelector('button[type="submit"]')?.hasAttribute("disabled")).toBe(true);
        expect(mocks.post).not.toHaveBeenCalled();
    });

    it("validates a link through only the dedicated preview endpoint", async () => {
        mocks.auth.mockReturnValue({
            isAuthenticated: true, isLoading: false,
            user: { id: "first-user", role: "user", canDownloadTracks: true },
        });
        await mount();
        await enterSpotifyLink(link);
        await act(async () => {
            host.querySelector("form")?.dispatchEvent(new Event("submit", {
                bubbles: true, cancelable: true,
            }));
        });
        expect(mocks.post).toHaveBeenCalledWith("/download-manager/spotify/preview", { url: link });
        expect(mocks.post).toHaveBeenCalledTimes(1);
        expect(host.textContent).toContain("Valid Spotify link");
        expect(host.textContent).toContain("No download started.");
    });

    it("clears a permitted user's preview when account or rights change", async () => {
        mocks.auth.mockReturnValue({
            isAuthenticated: true, isLoading: false,
            user: { id: "first-user", role: "admin" },
        });
        await mount();
        expect(host.querySelector("#spotify-intake-link")).not.toBeNull();
        mocks.auth.mockReturnValue({
            isAuthenticated: true, isLoading: false,
            user: { id: "next-user", role: "user", canDownloadTracks: false },
        });
        await mount();
        expect(host.querySelector("#spotify-intake-link")).toBeNull();
    });

    it("does not echo error internals if the validation endpoint fails", async () => {
        mocks.auth.mockReturnValue({
            isAuthenticated: true, isLoading: false,
            user: { id: "first-user", role: "admin" },
        });
        mocks.post.mockRejectedValue(new Error("hidden-device-token: never-render"));
        await mount();
        await enterSpotifyLink(link);
        await act(async () => {
            host.querySelector("form")?.dispatchEvent(new Event("submit", {
                bubbles: true, cancelable: true,
            }));
        });
        expect(host.textContent).toContain("Could not validate this Spotify link.");
        expect(host.textContent).not.toContain("hidden-device-token");
    });
});

const savedIntents = (items: unknown[] = [], enabled = true) => ({
    enabled, items, total: items.length,
    displayed: items.length, hasMore: false, isDownloadQueue: false,
});
const savedTrack = {
    id: "saved-1", kind: "track",
    canonicalUrl: "https://open.spotify.com/track/0123456789ABCDEFGHIJKL",
    requestState: "prepared",
    libraryDuplicateCheck: "not_checked", engineStatus: "not_checked",
    createdAt: "2026-11-04T20:00:00.000Z",
};
const authorizeSpotifyPreview = () => mocks.auth.mockReturnValue({
    isAuthenticated: true, isLoading: false,
    user: { id: "first-user", role: "user", canDownloadTracks: true },
});
const clickButtonContaining = async (label: string) => {
    const button = Array.from(host.querySelectorAll("button"))
        .find((node) => node.textContent?.includes(label));
    expect(button).not.toBeUndefined();
    await act(async () => {
        button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
};

describe("owner-scoped prepared Spotify request UI", () => {
    const link = "https://open.spotify.com/track/0123456789ABCDEFGHIJKL";

    it("displays a disabled feature without offering a Save action", async () => {
        authorizeSpotifyPreview();
        await mount();
        expect(host.textContent).toContain("Saving requests is disabled on this server.");
        await enterSpotifyLink(link);
        await act(async () => {
            host.querySelector("form")?.dispatchEvent(
                new Event("submit", { bubbles: true, cancelable: true }),
            );
        });
        expect(host.textContent).toContain("Valid Spotify link");
        expect(host.textContent).not.toContain("Save prepared request (no download)");
        expect(mocks.post).toHaveBeenCalledTimes(1);
    });

    it("renders owner-provided prepared items as non-downloading requests", async () => {
        authorizeSpotifyPreview();
        const original = mocks.get.getMockImplementation();
        mocks.get.mockImplementation(async (path: string) =>
            path.includes("/spotify/intents")
                ? savedIntents([savedTrack])
                : original?.(path),
        );
        await mount();
        expect(host.textContent).toContain("Saved Spotify requests");
        expect(host.textContent).toContain("Prepared only — not sent for download");
        expect(host.textContent).toContain(link);
        expect(host.textContent).toContain("Prepared requests do not confirm a library match");
        expect(mocks.post).not.toHaveBeenCalled();
    });

    it("saves a prepared request only after preview and backend opt-in", async () => {
        authorizeSpotifyPreview();
        let saved = false;
        const original = mocks.get.getMockImplementation();
        mocks.get.mockImplementation(async (path: string) =>
            path.includes("/spotify/intents")
                ? savedIntents(saved ? [savedTrack] : [])
                : original?.(path),
        );
        const preview = await mocks.post.getMockImplementation()?.("/download-manager/spotify/preview", { url: link });
        mocks.post.mockImplementation(async (path: string) => {
            if (path.endsWith("/spotify/intents")) {
                saved = true;
                return {
                    id: "saved-1", alreadyPrepared: false,
                    submittedByThisRequest: false,
                    downloadStartedByThisRequest: false,
                    filesChangedByThisRequest: false,
                };
            }
            return preview;
        });
        await mount();
        expect(host.textContent).toContain("No prepared Spotify requests yet.");
        await enterSpotifyLink(link);
        await act(async () => {
            host.querySelector("form")?.dispatchEvent(
                new Event("submit", { bubbles: true, cancelable: true }),
            );
        });
        expect(host.textContent).toContain("Valid Spotify link");
        expect(mocks.post).toHaveBeenCalledTimes(1);
        await clickButtonContaining("Save prepared request (no download)");
        expect(mocks.post).toHaveBeenCalledWith(
            "/download-manager/spotify/intents", { url: link },
        );
        expect(mocks.post).toHaveBeenCalledTimes(2);
        expect(host.textContent).toContain("Request saved. No download started.");
        expect(host.textContent).toContain("Prepared only — not sent for download");
        expect(host.textContent).not.toContain("Download queued");
        expect(mocks.get).toHaveBeenCalledWith("/download-manager/spotify/intents?limit=20&offset=0");
    });

    it("explains that an identical saved request does not start another download", async () => {
        authorizeSpotifyPreview();
        const original = mocks.get.getMockImplementation();
        mocks.get.mockImplementation(async (path: string) =>
            path.includes("/spotify/intents")
                ? savedIntents([savedTrack])
                : original?.(path),
        );
        const preview = await mocks.post.getMockImplementation()?.("/download-manager/spotify/preview", { url: link });
        mocks.post.mockImplementation(async (path: string) =>
            path.endsWith("/spotify/intents")
                ? { id: "saved-1", alreadyPrepared: true,
                    downloadStartedByThisRequest: false, submittedByThisRequest: false,
                    filesChangedByThisRequest: false }
                : preview,
        );
        await mount();
        await enterSpotifyLink(link);
        await act(async () => {
            host.querySelector("form")?.dispatchEvent(
                new Event("submit", { bubbles: true, cancelable: true }),
            );
        });
        await clickButtonContaining("Save prepared request (no download)");
        expect(host.textContent).toContain("Request already saved. No new download started.");
    });

    it("never leaks a failed save response or offers saved rows to a new account", async () => {
        authorizeSpotifyPreview();
        const original = mocks.get.getMockImplementation();
        mocks.get.mockImplementation(async (path: string) =>
            path.includes("/spotify/intents") ? savedIntents([savedTrack]) : original?.(path),
        );
        const preview = await mocks.post.getMockImplementation()?.("/download-manager/spotify/preview", { url: link });
        mocks.post.mockImplementation(async (path: string) => {
            if (path.endsWith("/spotify/intents")) throw new Error("private database /music/userB/key");
            return preview;
        });
        await mount();
        await enterSpotifyLink(link);
        await act(async () => {
            host.querySelector("form")?.dispatchEvent(
                new Event("submit", { bubbles: true, cancelable: true }),
            );
        });
        await clickButtonContaining("Save prepared request (no download)");
        expect(host.textContent).toContain("Could not save the prepared request.");
        expect(host.textContent).not.toContain("private database");
        mocks.auth.mockReturnValue({
            isAuthenticated: true, isLoading: false,
            user: { id: "other-user", role: "user", canDownloadTracks: true },
        });
        mocks.get.mockImplementation(() => new Promise(() => {}));
        await mount();
        expect(host.textContent).not.toContain("Prepared only — not sent for download");
        expect(host.textContent).not.toContain("Could not save the prepared request.");
    });
});

describe("explicit Spotify local recording evidence", () => {
    const link = "https://open.spotify.com/track/0123456789ABCDEFGHIJKL";
    const authorize = () => mocks.auth.mockReturnValue({
        isAuthenticated: true, isLoading: false,
        user: { id: "first-user", role: "user", canDownloadTracks: true },
    });
    const preview = async () => {
        await enterSpotifyLink(link);
        await act(async () => {
            host.querySelector("form")?.dispatchEvent(new Event(
                "submit", { bubbles: true, cancelable: true }
            ));
        });
    };

    it("does not automatically contact Spotify or examine local files on preview", async () => {
        authorize();
        await mount();
        await preview();
        expect(host.textContent).toContain("Check local recording");
        expect(mocks.post).toHaveBeenCalledTimes(1);
        expect(mocks.post).not.toHaveBeenCalledWith(
            "/download-manager/spotify/check-library", expect.anything()
        );
    });

    it("reports a proof-backed local recording match without falsely claiming decoded audio", async () => {
        authorize();
        const original = await mocks.post.getMockImplementation()?.(
            "/download-manager/spotify/preview", { url: link }
        );
        mocks.post.mockImplementation(async (path: string) =>
            path.endsWith("/spotify/check-library")
                ? {
                    provider: "spotify", kind: "track",
                    status: "recording_match_on_disk", evidence: "isrc_duration_and_file",
                    recordingMatch: true, audioDecoded: false,
                    albumEditionVerified: false, matchedTrackId: "own-library-track",
                    downloadStarted: false,
                }
                : original
        );
        await mount();
        await preview();
        await clickButtonContaining("Check local recording");
        expect(mocks.post).toHaveBeenCalledWith(
            "/download-manager/spotify/check-library", { url: link }
        );
        expect(host.textContent).toContain(
            "Recording match found in indexed local file (audio not decoded)."
        );
        expect(host.textContent).not.toContain("Audio decoded successfully");
    });

    it("does not turn missing metadata into proof that a track is absent", async () => {
        authorize();
        const original = await mocks.post.getMockImplementation()?.(
            "/download-manager/spotify/preview", { url: link }
        );
        mocks.post.mockImplementation(async (path: string) =>
            path.endsWith("/spotify/check-library")
                ? {
                    status: "metadata_unavailable", recordingMatch: false,
                    evidence: "not_proven", matchedTrackId: null,
                    audioDecoded: false, albumEditionVerified: false,
                    downloadStarted: false,
                }
                : original
        );
        await mount();
        await preview();
        await clickButtonContaining("Check local recording");
        expect(host.textContent).toContain(
            "Spotify metadata is unavailable. Local presence is unknown."
        );
    });

    it("does not leak filesystem or Spotify errors to the browser", async () => {
        authorize();
        const original = await mocks.post.getMockImplementation()?.(
            "/download-manager/spotify/preview", { url: link }
        );
        mocks.post.mockImplementation(async (path: string) => {
            if (path.endsWith("/spotify/check-library")) {
                throw new Error("private mount /music/secret-track.flac");
            }
            return original;
        });
        await mount();
        await preview();
        await clickButtonContaining("Check local recording");
        expect(host.textContent).toContain("Library check failed. Presence remains unknown.");
        expect(host.textContent).not.toContain("secret-track.flac");
    });

    it("clears recording evidence after the signed-in user changes", async () => {
        authorize();
        const original = await mocks.post.getMockImplementation()?.(
            "/download-manager/spotify/preview", { url: link }
        );
        mocks.post.mockImplementation(async (path: string) =>
            path.endsWith("/spotify/check-library")
                ? {
                    status: "recording_match_on_disk", evidence: "isrc_duration_and_file",
                    recordingMatch: true, audioDecoded: false,
                    albumEditionVerified: false, matchedTrackId: "own-library-track",
                    downloadStarted: false,
                }
                : original
        );
        await mount();
        await preview();
        await clickButtonContaining("Check local recording");
        expect(host.textContent).toContain("Recording match found in indexed local file");
        mocks.auth.mockReturnValue({
            isAuthenticated: true, isLoading: false,
            user: { id: "next-user", role: "user", canDownloadTracks: false },
        });
        await mount();
        expect(host.textContent).not.toContain("Recording match found in indexed local file");
        expect(host.querySelector("#spotify-intake-link")).toBeNull();
    });
});

describe("gated one-track Downtify submission UI", () => {
    const link = "https://open.spotify.com/track/0123456789ABCDEFGHIJKL";
    const setup = (checkStatus = "no_verified_match") => {
        authorizeSpotifyPreview();
        const oldGet = mocks.get.getMockImplementation();
        mocks.get.mockImplementation(async (path: string) => {
            if (path.includes("dispatch-capability")) {
                return { state: "available", canSubmit: true, singleTrackOnly: true };
            }
            if (path.includes("/spotify/intents")) return savedIntents([savedTrack]);
            return oldGet?.(path);
        });
        const oldPost = mocks.post.getMockImplementation();
        mocks.post.mockImplementation(async (path: string, data?: unknown) => {
            if (path.includes("spotify/check-library")) {
                return {
                    provider: "spotify", kind: "track", status: checkStatus,
                    recordingMatch: checkStatus === "recording_match_on_disk",
                    evidence: checkStatus === "recording_match_on_disk"
                        ? "isrc_duration_and_file" : "not_proven",
                    matchedTrackId: checkStatus === "recording_match_on_disk" ? "local-track" : null,
                    audioDecoded: false, albumEditionVerified: false,
                    downloadStarted: false,
                };
            }
            if (path.endsWith("/submit")) {
                return {
                    state: "submitted", remotePostSent: true,
                    libraryVerified: false, downloadInKimaVerified: false,
                };
            }
            return oldPost?.(path, data);
        });
    };
    const previewAndCheck = async () => {
        await enterSpotifyLink(link);
        await act(async () => {
            host.querySelector("form")?.dispatchEvent(new Event(
                "submit", { bubbles: true, cancelable: true }
            ));
        });
        await clickButtonContaining("Check local recording");
    };

    it("does not show a Downtify Submit button when disabled, unprepared or unverified", async () => {
        authorizeSpotifyPreview();
        await mount();
        await enterSpotifyLink(link);
        await act(async () => {
            host.querySelector("form")?.dispatchEvent(new Event(
                "submit", { bubbles: true, cancelable: true }
            ));
        });
        expect(host.textContent).not.toContain("Submit track to Downtify");
        expect(mocks.post).not.toHaveBeenCalledWith(
            expect.stringContaining("/submit"), expect.anything()
        );
    });

    it("prevents sending when matching local ISRC+file evidence exists", async () => {
        setup("recording_match_on_disk");
        await mount();
        await previewAndCheck();
        expect(host.textContent).toContain("Recording match found in indexed local file");
        expect(host.textContent).not.toContain("Submit track to Downtify");
        expect(mocks.post).not.toHaveBeenCalledWith(
            expect.stringContaining("/submit"), expect.anything()
        );
    });

    it("requires explicit duplicate-risk consent and submits only one stored track ID", async () => {
        setup();
        await mount();
        await previewAndCheck();
        expect(host.textContent).toContain("No verified match was found");
        const button = Array.from(host.querySelectorAll("button"))
            .find(node => node.textContent?.includes("Submit track to Downtify"));
        expect(button).not.toBeUndefined();
        expect(button?.hasAttribute("disabled")).toBe(true);
        expect(mocks.post).not.toHaveBeenCalledWith(
            expect.stringContaining("/submit"), expect.anything()
        );
        await act(async () => {
            host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
        });
        await clickButtonContaining("Submit track to Downtify");
        expect(mocks.post).toHaveBeenCalledWith(
            "/download-manager/spotify/intents/saved-1/submit",
            { acknowledgeUnverified: true }
        );
        expect(host.textContent).toContain("Downtify accepted the track.");
        expect(host.textContent).toContain("Library import is not yet verified.");
        expect(host.textContent).not.toContain("Submit track to Downtify");
        const calls = mocks.post.mock.calls.filter((c: unknown[]) => String(c[0]).endsWith("/submit"));
        expect(calls).toHaveLength(1);
    });

    it("does not allow a second submission after a response with uncertain status", async () => {
        setup();
        const original = mocks.post.getMockImplementation();
        mocks.post.mockImplementation(async (path: string, body?: unknown) =>
            path.endsWith("/submit")
                ? { state: "dispatch_unknown", remotePostSent: true,
                    libraryVerified: false, downloadInKimaVerified: false }
                : original?.(path, body)
        );
        await mount();
        await previewAndCheck();
        await act(async () => {
            host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
        });
        await clickButtonContaining("Submit track to Downtify");
        expect(host.textContent).toContain("Submission is uncertain. Do not resend");
        expect(host.textContent).not.toContain("Submit track to Downtify");
        const calls = mocks.post.mock.calls.filter((c: unknown[]) => String(c[0]).endsWith("/submit"));
        expect(calls).toHaveLength(1);
    });

    it("does not echo failed submission internals or keep a previous account's consent", async () => {
        setup();
        const original = mocks.post.getMockImplementation();
        mocks.post.mockImplementation(async (path: string, body?: unknown) => {
            if (path.endsWith("/submit")) throw new Error("private token /music/secret");
            return original?.(path, body);
        });
        await mount();
        await previewAndCheck();
        await act(async () => {
            host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
        });
        await clickButtonContaining("Submit track to Downtify");
        expect(host.textContent).toContain("Submission could not be verified.");
        expect(host.textContent).not.toContain("private token");
        mocks.auth.mockReturnValue({
            isAuthenticated: true, isLoading: false,
            user: { id: "new-user", role: "user", canDownloadTracks: true },
        });
        mocks.get.mockImplementation(() => new Promise(() => {}));
        await mount();
        expect(host.textContent).not.toContain("Submission could not be verified.");
        expect(host.querySelector('input[type="checkbox"]')).toBeNull();
    });
});
