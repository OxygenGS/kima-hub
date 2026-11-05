import type { AxiosInstance } from "axios";

const mockFindFirst = jest.fn();
const mockUpdateMany = jest.fn();
jest.mock("../../utils/db", () => ({
    prisma: {
        spotifyDownloadIntent: {
            findFirst: (...args: unknown[]) => mockFindFirst(...args),
            updateMany: (...args: unknown[]) => mockUpdateMany(...args),
        },
    },
}));

import {
    getReconciliationCapability, verifyRemoteSpotifyIntent,
    inspectOwnedDowntifyFileCandidate,
} from "../downtifyDispatchReconciliation";

const ID = "0123456789ABCDEFGHIJKL";
const URL = "https://open.spotify.com/track/" + ID;
const SERVER_ID = "cf12b3c4f530731551690cc62b1365a1";
const TOKEN = "dtfy_synthetic_device_token_test_1234567890";
const saved = {
    kind: "track", spotifyId: ID, remoteSongId: ID,
    canonicalUrl: URL, status: "dispatch_unknown",
};
const settings = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
    KIMA_SPOTIFY_INTENTS_ENABLED: "true",
    KIMA_DOWNTIFY_RECONCILIATION_ENABLED: "true",
    KIMA_DOWNTIFY_TRACK_SUBMISSION_ENABLED: "false",
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
const entry = (userIds: unknown, status: string, songId = ID) => ({
    user_ids: userIds, status,
    song: { song_id: songId, source: "spotify", name: "Secret song", path: "/music/private" },
    private_info: "secret-token",
});
function api(queue: unknown = [entry([9], "queued")], server: unknown = info, account: unknown = auth) {
    const get = jest.fn(async (url: string) => {
        const path = new globalThis.URL(url).pathname;
        if (path === "/api/server/info") return { data: server };
        if (path === "/api/auth/status") return { data: account };
        if (path === "/api/queue") return { data: queue };
        throw new Error("Unexpected Downtify route");
    });
    return { get } as unknown as Pick<AxiosInstance, "get">;
}
const run = (http = api(), env = settings(), userId = "owner-1") =>
    verifyRemoteSpotifyIntent(userId, "intent-abc123", env, http);

beforeEach(() => {
    jest.clearAllMocks();
    mockFindFirst.mockResolvedValue(saved);
});

describe("default-off manual Downtify reconciliation", () => {
    it("keeps read-only checks independently gated from the write flag", async () => {
        const http = api();
        expect(getReconciliationCapability("owner-1", settings())).toEqual({
            state: "available", canCheck: true, singleTrackOnly: true,
        });
        expect(getReconciliationCapability("owner-1", settings({
            KIMA_DOWNTIFY_RECONCILIATION_ENABLED: "false",
        })).canCheck).toBe(false);
        expect(getReconciliationCapability("owner-1", settings({
            KIMA_SPOTIFY_INTENTS_ENABLED: "false",
        })).canCheck).toBe(false);
        expect((await run(http, settings({
            KIMA_DOWNTIFY_RECONCILIATION_ENABLED: "",
        }))).state).toBe("disabled");
        expect((await run(http, settings(), "other-user")).state).toBe("unbound");
        expect(mockFindFirst).not.toHaveBeenCalled();
        expect(http.get).not.toHaveBeenCalled();
        expect(JSON.stringify(getReconciliationCapability("owner-1", settings()))).not.toContain(TOKEN);
    });

    it("requires pinned numeric account identity and persistent server ID", async () => {
        const http = api();
        for (const overrides of [
            { KIMA_DOWNTIFY_EXPECTED_USER_ID: "" },
            { KIMA_DOWNTIFY_EXPECTED_SERVER_ID: "" },
            { KIMA_DOWNTIFY_EXPECTED_USERNAME: "" },
            { KIMA_DOWNTIFY_DEVICE_TOKEN: "not-a-device-token" },
        ]) {
            expect((await run(http, settings(overrides))).state).toBe("misconfigured");
        }
        expect(http.get).not.toHaveBeenCalled();
        expect(mockFindFirst).not.toHaveBeenCalled();
    });

    it("never reads another user's intent, including when userId is forged", async () => {
        const http = api();
        mockFindFirst.mockResolvedValue(null);
        expect((await run(http)).state).toBe("not_found");
        expect(mockFindFirst).toHaveBeenCalledWith({
            where: { id: "intent-abc123", userId: "owner-1" },
            select: {
                kind: true, spotifyId: true, canonicalUrl: true,
                status: true, remoteSongId: true,
            },
        });
        expect(http.get).not.toHaveBeenCalled();
    });

    it("refuses prepared, unsupported or corrupt saved identities before remote reads", async () => {
        const http = api();
        for (const altered of [
            { status: "prepared" },
            { status: "failed" },
            { kind: "album" },
            { spotifyId: "not-the-same-song" },
            { remoteSongId: "different-song" },
            { canonicalUrl: "http://internal/" },
        ]) {
            mockFindFirst.mockResolvedValueOnce({ ...saved, ...altered });
            const result = await run(http);
            expect(["not_attempted", "invalid_intent"]).toContain(result.state);
        }
        expect(http.get).not.toHaveBeenCalled();
        expect(mockUpdateMany).not.toHaveBeenCalled();
    });

    it("never sends a token to a server with the wrong public identity", async () => {
        const http = api([], { ...info, server_id: "different-server-id" });
        const result = await run(http);
        expect(result.state).toBe("incompatible");
        expect(http.get).toHaveBeenCalledTimes(1);
        const opts = (http.get as jest.Mock).mock.calls[0][1];
        expect(opts.headers.Authorization).toBeUndefined();
        expect(JSON.stringify(result)).not.toContain(TOKEN);
    });

    it("rejects an admin pairing that belongs to a different numeric account", async () => {
        const http = api([], info, {
            ...auth, user: { id: 19, username: "remote-owner", role: "admin" },
        });
        expect((await run(http)).state).toBe("unauthorized");
        expect(http.get).toHaveBeenCalledTimes(2);
    });

    it("attributes only exact numeric owner membership and the original Spotify ID", async () => {
        const remote = api([
            entry([77], "done"), entry(["9"], "done"),
            entry([9], "downloading", "OTHER123456789012345678"),
        ]);
        const result = await run(remote);
        expect(result.state).toBe("no_verified_job");
        expect(result.remoteOwnershipVerified).toBe(false);
        expect(result.retryAllowed).toBe(false);
        expect(remote.get).toHaveBeenCalledTimes(3);
    });

    it.each([
        ["queued", "queued"], ["downloading", "processing"],
        ["done", "downloaded"], ["error", "failed"],
        ["new-server-status", "unknown"],
    ])("reports remote %s conservatively as %s, never as an imported track", async (remoteStatus, phase) => {
        const result = await run(api([entry([9], remoteStatus)]));
        expect(result).toEqual({
            state: "verified", remotePhase: phase, remoteOwnershipVerified: true,
            libraryVerification: "not_checked", playbackVerified: false,
            filesChanged: false, retryAllowed: false,
        });
        expect(mockUpdateMany).not.toHaveBeenCalled();
    });

    it("does not pick an arbitrary match when multiple owned rows share a remote song ID", async () => {
        const result = await run(api([entry([9], "done"), entry([9], "queued")]));
        expect(result.state).toBe("ambiguous");
        expect(result.remoteOwnershipVerified).toBe(false);
        expect(result.remotePhase).toBe("not_checked");
    });

    it("treats absent, malformed or oversized queue data as non-proof", async () => {
        expect((await run(api([]))).state).toBe("no_verified_job");
        expect((await run(api({ jobs: [] }))).state).toBe("incompatible");
        expect((await run(api(Array.from({ length: 5001 }, () => ({}))))).state).toBe("incompatible");
    });

    it("does not leak provider errors and cannot write or retry failed requests", async () => {
        const http = api();
        (http.get as jest.Mock).mockRejectedValue(new Error("device token secret /music/private.flac"));
        const result = await run(http);
        expect(result.state).toBe("unavailable");
        expect(result.retryAllowed).toBe(false);
        expect(JSON.stringify(result)).not.toContain("secret");
        expect(JSON.stringify(result)).not.toContain("/music");
        expect(mockUpdateMany).not.toHaveBeenCalled();
    });
});

describe("D5 private filename handoff never widens public D3 evidence", () => {
    it("returns a filename internally only for an owned, completed track", async () => {
        const completed = { ...entry([9], "done"), filename: "Artist/Album/Song.flac" };
        const http = api([completed, { ...entry([29], "done"), filename: "/private.flac" }]);
        const candidate = await inspectOwnedDowntifyFileCandidate(
            "owner-1", "intent-abc123", settings(), http,
        );
        expect(candidate.verification).toMatchObject({
            state: "verified", remotePhase: "downloaded",
            remoteOwnershipVerified: true, filesChanged: false,
        });
        expect(candidate.filename).toBe("Artist/Album/Song.flac");
        const publicResult = await run(http);
        expect(JSON.stringify(publicResult)).not.toContain("Artist/Album");
        expect(JSON.stringify(publicResult)).not.toContain("private.flac");
        expect(mockUpdateMany).not.toHaveBeenCalled();
    });

    it("never hands out a filename for another remote owner, non-done, or ambiguous job", async () => {
        const wrongUser = await inspectOwnedDowntifyFileCandidate(
            "owner-1", "intent-abc123", settings(),
            api([{ ...entry([99], "done"), filename: "secret.flac" }]),
        );
        expect(wrongUser.verification.state).toBe("no_verified_job");
        expect(wrongUser.filename).toBeNull();

        const queued = await inspectOwnedDowntifyFileCandidate(
            "owner-1", "intent-abc123", settings(),
            api([{ ...entry([9], "queued"), filename: "secret.flac" }]),
        );
        expect(queued.verification.remotePhase).toBe("queued");
        expect(queued.filename).toBeNull();

        const ambiguous = await inspectOwnedDowntifyFileCandidate(
            "owner-1", "intent-abc123", settings(),
            api([
                { ...entry([9], "done"), filename: "one.flac" },
                { ...entry([9], "done"), filename: "two.flac" },
            ]),
        );
        expect(ambiguous.verification.state).toBe("ambiguous");
        expect(ambiguous.filename).toBeNull();
    });
});
