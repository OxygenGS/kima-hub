import type { AxiosInstance } from "axios";
const mockFindFirst = jest.fn();
const mockUpdateMany = jest.fn();
const mockEvidence = jest.fn();

jest.mock("../../utils/db", () => ({
    prisma: {
        spotifyDownloadIntent: {
            findFirst: (...args: unknown[]) => mockFindFirst(...args),
            updateMany: (...args: unknown[]) => mockUpdateMany(...args),
        },
    },
}));
jest.mock("../spotifyLibraryEvidence", () => ({
    checkSpotifyLibraryEvidence: (...args: unknown[]) => mockEvidence(...args),
}));

import { dispatchPreparedSpotifyTrack, getDispatchCapability } from "../downtifyTrackDispatch";

const ID = "0123456789ABCDEFGHIJKL";
const URL = "https://open.spotify.com/track/" + ID;
const SERVER_ID = "cf12b3c4f530731551690cc62b1365a1";
const TOKEN = "dtfy_synthetic_device_token_test_1234567890";
const intent = {
    id: "intent-abc123", kind: "track", spotifyId: ID,
    canonicalUrl: URL, status: "prepared",
};
const settings = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
    KIMA_SPOTIFY_INTENTS_ENABLED: "true",
    KIMA_DOWNTIFY_TRACK_SUBMISSION_ENABLED: "true",
    KIMA_DOWNTIFY_ENABLED: "true",
    KIMA_DOWNTIFY_URL: "http://downtify:8000",
    KIMA_DOWNTIFY_DEVICE_TOKEN: TOKEN,
    KIMA_DOWNTIFY_OWNER_KIMA_USER_ID: "owner-1",
    KIMA_DOWNTIFY_EXPECTED_USERNAME: "remote-owner",
    KIMA_DOWNTIFY_EXPECTED_USER_ID: "9",
    KIMA_DOWNTIFY_EXPECTED_SERVER_ID: SERVER_ID,
    ...overrides,
});
const info = {
    server_id: SERVER_ID, product: "Downtify", api_version: 1,
    require_sign_in: true,
};
const auth = {
    signed_in: true, via: "device", auth_disabled: false,
    user: { id: 9, username: "remote-owner", role: "admin" },
};
const song = {
    song_id: ID, name: "Track from Spotify", source: "spotify",
    url: URL, artists: ["Artist"], album_name: "Test Album",
    duration: 183, explicit: false, year: 2024,
    dangerous_path: "/music/private.flac", raw_error: "secret", cover_url: "http://localhost/secrets",
};
const api = (queue: unknown = [], resolved: unknown = song, result: unknown = { count: 1, job_ids: [ID] }) => {
    const get = jest.fn(async (url: string) => {
        const parsed = new globalThis.URL(url);
        if (parsed.pathname === "/api/server/info") return { data: info };
        if (parsed.pathname === "/api/auth/status") return { data: auth };
        if (parsed.pathname === "/api/queue") return { data: queue };
        if (parsed.pathname === "/api/song/url") return { data: resolved };
        throw new Error("unexpected " + parsed.pathname);
    });
    const post = jest.fn(async () => ({ data: result }));
    return { get, post } as unknown as Pick<AxiosInstance, "get" | "post">;
};
const run = (http = api(), env = settings()) =>
    dispatchPreparedSpotifyTrack("owner-1", intent.id, true, env, http);

beforeEach(() => {
    jest.clearAllMocks();
    mockFindFirst.mockResolvedValue(intent);
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockEvidence.mockResolvedValue({ status: "no_verified_match", recordingMatch: false });
});

describe("Downtify track submission capability", () => {
    it("is disabled by default, even if a device token happens to be configured", () => {
        expect(getDispatchCapability("owner-1", settings({
            KIMA_DOWNTIFY_TRACK_SUBMISSION_ENABLED: "",
        }))).toEqual({ state: "disabled", canSubmit: false, singleTrackOnly: true });
        expect(getDispatchCapability("owner-1", settings({
            KIMA_SPOTIFY_INTENTS_ENABLED: "",
        })).canSubmit).toBe(false);
    });
    it("requires operator-pinned Kima, server and numeric Downtify account identity", () => {
        expect(getDispatchCapability("other-user", settings()).state).toBe("unbound");
        expect(getDispatchCapability("owner-1", settings({
            KIMA_DOWNTIFY_EXPECTED_USER_ID: "",
        })).state).toBe("misconfigured");
        expect(getDispatchCapability("owner-1", settings({
            KIMA_DOWNTIFY_EXPECTED_SERVER_ID: "",
        })).state).toBe("misconfigured");
        expect(getDispatchCapability("owner-1", settings()).canSubmit).toBe(true);
        expect(JSON.stringify(getDispatchCapability("owner-1", settings()))).not.toContain(TOKEN);
        expect(JSON.stringify(getDispatchCapability("owner-1", settings()))).not.toContain("remote-owner");
    });
});

describe("atomic, conservative and explicitly user-owned remote submission", () => {
    it("does not query DB or contact the remote API when disabled/unbound", async () => {
        const http = api();
        expect((await run(http, settings({
            KIMA_DOWNTIFY_TRACK_SUBMISSION_ENABLED: "",
        }))).state).toBe("disabled");
        expect((await dispatchPreparedSpotifyTrack("other-user", intent.id, true, settings(), http)).state)
            .toBe("unbound");
        expect(mockFindFirst).not.toHaveBeenCalled();
        expect(mockEvidence).not.toHaveBeenCalled();
        expect(http.get).not.toHaveBeenCalled();
        expect(http.post).not.toHaveBeenCalled();
    });

    it("looks up only the authenticated user's own stored intent", async () => {
        const http = api();
        mockFindFirst.mockResolvedValue(null);
        expect((await run(http)).state).toBe("not_found");
        expect(mockFindFirst).toHaveBeenCalledWith({
            where: { id: intent.id, userId: "owner-1" },
            select: {
                id: true, kind: true, spotifyId: true,
                canonicalUrl: true, status: true,
            },
        });
        expect(http.get).not.toHaveBeenCalled();
    });

    it("prevents re-submission from non-prepared or mismatched old intents", async () => {
        const http = api();
        mockFindFirst.mockResolvedValue({ ...intent, status: "dispatch_unknown" });
        expect((await run(http)).state).toBe("already_attempted");
        mockFindFirst.mockResolvedValue({ ...intent, kind: "playlist" });
        expect((await run(http)).state).toBe("unsupported");
        mockFindFirst.mockResolvedValue({ ...intent, spotifyId: "9999999999999999999999" });
        expect((await run(http)).state).toBe("invalid_intent");
        expect(http.post).not.toHaveBeenCalled();
    });

    it("requires affirmative acknowledgement of incomplete library evidence", async () => {
        const http = api();
        const result = await dispatchPreparedSpotifyTrack("owner-1", intent.id, false, settings(), http);
        expect(result.state).toBe("confirmation_required");
        expect(mockEvidence).not.toHaveBeenCalled();
        expect(http.get).not.toHaveBeenCalled();
    });

    it("blocks proven local files, missing mounts and unavailable metadata before remote calls", async () => {
        const http = api();
        mockEvidence.mockResolvedValue({ status: "recording_match_on_disk", recordingMatch: true });
        expect((await run(http)).state).toBe("library_present");
        mockEvidence.mockResolvedValue({ status: "catalog_recording_unverified" });
        expect((await run(http)).state).toBe("needs_library_review");
        mockEvidence.mockResolvedValue({ status: "metadata_unavailable" });
        expect((await run(http)).state).toBe("needs_library_review");
        mockEvidence.mockRejectedValue(new Error("private /music/secret"));
        expect((await run(http)).state).toBe("needs_library_review");
        expect(http.get).not.toHaveBeenCalled();
        expect(http.post).not.toHaveBeenCalled();
        expect(mockUpdateMany).not.toHaveBeenCalled();
    });

    it("verifies exact server identity BEFORE sending any bearer token", async () => {
        const http = api();
        (http.get as jest.Mock).mockResolvedValue({ data: { ...info, server_id: "different-server-id" } });
        expect((await run(http)).state).toBe("remote_incompatible");
        expect(http.get).toHaveBeenCalledTimes(1);
        const call = (http.get as jest.Mock).mock.calls[0];
        expect(call[1].headers.Authorization).toBeUndefined();
        expect(http.post).not.toHaveBeenCalled();
    });

    it("refuses remote token for wrong numeric account even if it is an admin", async () => {
        const http = api();
        const original = (http.get as jest.Mock).getMockImplementation();
        (http.get as jest.Mock).mockImplementation(async (url: string) =>
            url.includes("/api/auth/status")
                ? { data: { ...auth, user: { id: 10, username: "remote-owner", role: "admin" } } }
                : original?.(url));
        expect((await run(http)).state).toBe("remote_unauthorized");
        expect(http.get).toHaveBeenCalledTimes(2);
        expect(http.post).not.toHaveBeenCalled();
    });

    it("does not confuse an admin-visible other user's job with ownership", async () => {
        const queue = [{ song: { song_id: ID }, status: "queued", user_ids: [10] }];
        const http = api(queue);
        const result = await run(http);
        expect(result.state).toBe("submitted");
        expect(http.post).toHaveBeenCalledTimes(1);
    });

    it("adopts an already owned remote queue job without posting again", async () => {
        const queue = [{ song: { song_id: ID }, status: "downloading", user_ids: [9, 10] }];
        const http = api(queue);
        const result = await run(http);
        expect(result.state).toBe("already_in_remote_queue");
        expect(result.remotePostSent).toBe(false);
        expect(http.post).not.toHaveBeenCalled();
        expect(mockUpdateMany).toHaveBeenCalledWith({
            where: { id: intent.id, userId: "owner-1", status: "dispatching" },
            data: { status: "submitted" },
        });
    });

    it("blocks an already owned failed remote job for human review", async () => {
        const queue = [{ song: { song_id: ID }, status: "error", user_ids: [9] }];
        const http = api(queue);
        expect((await run(http)).state).toBe("remote_has_failed_job");
        expect(http.post).not.toHaveBeenCalled();
        expect(mockUpdateMany).not.toHaveBeenCalled();
    });

    it("validates remote resolved song ID, source, URL, title and artists", async () => {
        for (const malformed of [
            { ...song, song_id: "9999999999999999999999" },
            { ...song, source: "youtube" },
            { ...song, url: "http://localhost/private" },
            { ...song, artists: [] },
            { ...song, name: "\nBad" },
            [{ ...song }],
        ]) {
            const http = api([], malformed);
            expect((await run(http)).state).toBe("remote_incompatible");
            expect(http.post).not.toHaveBeenCalled();
            expect(mockUpdateMany).not.toHaveBeenCalled();
        }
    });

    it("submits one sanitized song after a successful atomic claim", async () => {
        const http = api();
        const result = await run(http);
        expect(result).toEqual({
            state: "submitted", libraryVerified: false,
            downloadInKimaVerified: false, remotePostSent: true,
        });
        expect(mockUpdateMany).toHaveBeenNthCalledWith(1, {
            where: { id: intent.id, userId: "owner-1", status: "prepared" },
            data: {
                status: "dispatching", remoteSongId: ID,
                dispatchStartedAt: expect.any(Date),
            },
        });
        expect(mockUpdateMany).toHaveBeenNthCalledWith(2, {
            where: { id: intent.id, userId: "owner-1", status: "dispatching" },
            data: { status: "submitted" },
        });
        expect(http.post).toHaveBeenCalledTimes(1);
        const call = (http.post as jest.Mock).mock.calls[0];
        expect(call[0]).toBe("http://downtify:8000/api/download/batch");
        expect(call[1]).toMatchObject({
            generate_m3u: false,
            songs: [{
                song_id: ID, name: "Track from Spotify",
                source: "spotify", url: URL,
                artists: ["Artist"], duration: 183, album_name: "Test Album",
            }],
        });
        expect(call[1].songs).toHaveLength(1);
        const payload = JSON.stringify(call[1]);
        expect(payload).not.toContain("dangerous_path");
        expect(payload).not.toContain("/music/private");
        expect(payload).not.toContain("localhost/secrets");
        expect(payload).not.toContain("secret");
        expect(call[2].headers.Authorization).toBe("Bearer " + TOKEN);
        expect(call[2].maxRedirects).toBe(0);
        expect(call[2].proxy).toBe(false);
    });

    it("does not POST when another request won the unique DB claim", async () => {
        mockUpdateMany.mockResolvedValue({ count: 0 });
        const http = api();
        expect((await run(http)).state).toBe("already_claimed");
        expect(http.post).not.toHaveBeenCalled();
    });

    it("never retries on lost remote response or malformed success acknowledgement", async () => {
        const http = api();
        (http.post as jest.Mock).mockRejectedValue(new Error("connection reset after queue accepted"));
        const response = await run(http);
        expect(response.state).toBe("dispatch_unknown");
        expect(response.remotePostSent).toBe(true);
        expect(mockUpdateMany).toHaveBeenLastCalledWith({
            where: { id: intent.id, userId: "owner-1", status: "dispatching" },
            data: { status: "dispatch_unknown" },
        });
        expect(http.post).toHaveBeenCalledTimes(1);
        jest.clearAllMocks();
        mockFindFirst.mockResolvedValue({ ...intent, status: "dispatch_unknown" });
        expect((await run(http)).state).toBe("already_attempted");
        expect(http.post).not.toHaveBeenCalled();

        mockFindFirst.mockResolvedValue(intent);
        const invalid = api([], song, { count: 1, job_ids: ["other-id"] });
        expect((await run(invalid)).state).toBe("dispatch_unknown");
        expect(invalid.post).toHaveBeenCalledTimes(1);
    });

    it("does not treat server errors or API outages as permission to dispatch", async () => {
        const http = api();
        (http.get as jest.Mock).mockRejectedValue(new Error("upstream unavailable, token=secret"));
        const result = await run(http);
        expect(result.state).toBe("remote_unavailable");
        expect(JSON.stringify(result)).not.toContain("secret");
        expect(http.post).not.toHaveBeenCalled();
    });
});
