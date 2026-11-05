import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";

const mockOverview = jest.fn();
const mockBoundQueue = jest.fn();
const mockPermissionUser = jest.fn();
const mockPrepareIntent = jest.fn();
const mockListSavedIntents = jest.fn();
const mockLibraryEvidence = jest.fn();
const mockDispatchCapability = jest.fn();
const mockDispatchRequest = jest.fn();
const mockReconciliationCapability = jest.fn();
const mockRemoteVerification = jest.fn();
const mockSourceFileCapability = jest.fn();
const mockSourceFileEvidence = jest.fn();
jest.mock("../../utils/db", () => ({
    prisma: { user: { findUnique: (...args: unknown[]) => mockPermissionUser(...args) } },
}));
jest.mock("../../services/unifiedDownloadOverview", () => ({
    MAX_DOWNLOAD_PAGE_SIZE: 100,
    MAX_DOWNLOAD_OFFSET: 1000,
    getUnifiedDownloadOverview: (...args: unknown[]) => mockOverview(...args),
}));
jest.mock("../../services/downtifyTrackDispatch", () => ({
    getDispatchCapability: (...args: unknown[]) => mockDispatchCapability(...args),
    dispatchPreparedSpotifyTrack: (...args: unknown[]) => mockDispatchRequest(...args),
}));
jest.mock("../../services/downtifyDispatchReconciliation", () => ({
    getReconciliationCapability: (...args: unknown[]) => mockReconciliationCapability(...args),
    verifyRemoteSpotifyIntent: (...args: unknown[]) => mockRemoteVerification(...args),
}));
jest.mock("../../services/downtifySourceFileEvidence", () => ({
    getSourceFileCapability: (...args: unknown[]) => mockSourceFileCapability(...args),
    inspectDowntifySourceFile: (...args: unknown[]) => mockSourceFileEvidence(...args),
}));
jest.mock("../../services/spotifyLibraryEvidence", () => ({
    checkSpotifyLibraryEvidence: (...args: unknown[]) => mockLibraryEvidence(...args),
}));
jest.mock("../../services/spotifyIntentRegistry", () => ({
    prepareSpotifyIntent: (...args: unknown[]) => mockPrepareIntent(...args),
    getSavedSpotifyIntents: (...args: unknown[]) => mockListSavedIntents(...args),
    MAX_SPOTIFY_INTENT_PAGE_SIZE: 50,
    MAX_SPOTIFY_INTENT_OFFSET: 1000,
}));
jest.mock("../../services/downtifyBoundQueue", () => ({
    getBoundDowntifyQueue: (...args: unknown[]) => mockBoundQueue(...args),
}));
jest.mock("../../utils/logger", () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../middleware/auth", () => ({
    requireMusicPermission: jest.requireActual("../../middleware/auth").requireMusicPermission,
    requireAuth: (req: Request, res: Response, next: NextFunction) => {
        const id = req.header("x-test-user");
        if (!id || !req.header("authorization")) {
            return res.status(401).json({ error: "Not authenticated" });
        }
        req.user = { id, role: "user" } as Request["user"];
        next();
    },
}));

import downloadManagerRoutes from "../downloadManager";

const app = express();
app.use(express.json());
app.use("/api/download-manager", downloadManagerRoutes);
const read = (user = "user-A", path = "/api/download-manager/jobs") =>
    request(app).get(path).set("Authorization", "Bearer synthetic-test-token").set("X-Test-User", user);

beforeEach(() => {
    mockSourceFileCapability.mockReset().mockReturnValue({
        state: "disabled", canCheck: false, singleTrackOnly: true,
    });
    mockSourceFileEvidence.mockReset().mockResolvedValue({
        state: "candidate_present_unverified", remotePhase: "downloaded",
        regularFileObserved: true, recordingVerified: false,
        audioDecoded: false, stableMountVerified: false,
        libraryImportVerified: false, filesChanged: false, retryAllowed: false,
    });
    mockReconciliationCapability.mockReset().mockReturnValue({
        state: "disabled", canCheck: false, singleTrackOnly: true,
    });
    mockRemoteVerification.mockReset().mockResolvedValue({
        state: "verified", remotePhase: "downloaded", remoteOwnershipVerified: true,
        libraryVerification: "not_checked", playbackVerified: false,
        filesChanged: false, retryAllowed: false,
    });
    mockDispatchCapability.mockReset().mockReturnValue({
        state: "disabled", canSubmit: false, singleTrackOnly: true,
    });
    mockDispatchRequest.mockReset().mockResolvedValue({
        state: "submitted", libraryVerified: false,
        downloadInKimaVerified: false, remotePostSent: true,
    });
    delete process.env.KIMA_SPOTIFY_INTENTS_ENABLED;
    mockLibraryEvidence.mockReset().mockResolvedValue({
        provider: "spotify", kind: "track", status: "recording_match_on_disk",
        evidence: "isrc_duration_and_file", recordingMatch: true,
        audioDecoded: false, albumEditionVerified: false,
        matchedTrackId: "track-on-disk", downloadStarted: false,
    });
    mockListSavedIntents.mockReset().mockResolvedValue({
        enabled: true, items: [], total: 0, displayed: 0,
        limit: 20, offset: 0, hasMore: false, isDownloadQueue: false,
    });
    mockPrepareIntent.mockReset().mockResolvedValue({
        id: "saved-intent-1", provider: "spotify", kind: "track",
        canonicalUrl: "https://open.spotify.com/track/0123456789ABCDEFGHIJKL",
        status: "prepared", alreadyPrepared: false,
        duplicateScope: "this_users_prepared_intents_only",
        libraryDuplicateCheck: "not_checked", submittedByThisRequest: false,
        downloadStartedByThisRequest: false, filesChangedByThisRequest: false,
    });
    mockPermissionUser.mockReset().mockResolvedValue({
        role: "user", canRequestAlbums: false, canDownloadTracks: true,
    });
    mockBoundQueue.mockReset().mockResolvedValue({
        state: "unbound", items: [], displayed: 0, hasMore: false,
    });
    mockOverview.mockReset().mockResolvedValue({
        items: [], total: 0, displayed: 0, limit: 50, offset: 0,
        hasMore: false, pageCounts: {
            queued: 0, processing: 0, downloaded: 0,
            failed: 0, cancelled: 0, unknown: 0,
        }, downtifyJobsIncluded: false,
    });
});

describe("read-only unified job feed", () => {
    it("does not query Kima jobs when unauthenticated", async () => {
        const res = await request(app).get("/api/download-manager/jobs");
        expect(res.status).toBe(401);
        expect(mockOverview).not.toHaveBeenCalled();
    });

    it("uses authenticated identity, ignoring a forged userId or admin claim", async () => {
        const response = await read("user-A", "/api/download-manager/jobs?userId=user-B&role=admin");
        expect(response.status).toBe(200);
        expect(mockOverview).toHaveBeenCalledWith("user-A", 50, 0);
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(response.body.downtifyJobsIncluded).toBe(false);
    });

    it("accepts strictly bounded page size and offset", async () => {
        const response = await read("user-C", "/api/download-manager/jobs?limit=100&offset=1000");
        expect(response.status).toBe(200);
        expect(mockOverview).toHaveBeenCalledWith("user-C", 100, 1000);
    });

    it.each([
        "?limit=0", "?limit=101", "?limit=-1", "?limit=1.5", "?limit=abc",
        "?offset=-1", "?offset=1001", "?offset=abc", "?limit[]=5",
    ])("rejects %s before touching the database", async (q) => {
        const response = await read("user-A", "/api/download-manager/jobs" + q);
        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: "Invalid pagination" });
        expect(mockOverview).not.toHaveBeenCalled();
    });

    it("returns a generic failure without leaking DB errors, paths or secrets", async () => {
        mockOverview.mockRejectedValue(new Error("secret=never-return /music/private/file.flac"));
        const response = await read();
        expect(response.status).toBe(500);
        expect(response.body).toEqual({ error: "Unable to load download overview" });
        expect(JSON.stringify(response.body)).not.toContain("never-return");
    });

    it("has no route for download creation, modification or cancellation", async () => {
        expect((await request(app).post("/api/download-manager/jobs").send({})).status).toBe(404);
        expect((await request(app).patch("/api/download-manager/jobs/any").send({})).status).toBe(404);
        expect((await request(app).delete("/api/download-manager/jobs/any")).status).toBe(404);
        expect(mockOverview).not.toHaveBeenCalled();
    });
});

describe("owner-bound Downtify read-only route", () => {
    it("requires authentication before remote lookup", async () => {
        const response = await request(app).get("/api/download-manager/downtify/jobs");
        expect(response.status).toBe(401);
        expect(mockBoundQueue).not.toHaveBeenCalled();
    });

    it("uses only the authenticated Kima user, never a query-supplied owner", async () => {
        const response = await read("my-kima-id", "/api/download-manager/downtify/jobs?userId=other&admin=true");
        expect(response.status).toBe(200);
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(mockBoundQueue).toHaveBeenCalledWith("my-kima-id");
        expect(response.body).toEqual({ state: "unbound", items: [], displayed: 0, hasMore: false });
    });

    it("does not return upstream errors or secrets", async () => {
        mockBoundQueue.mockRejectedValue(new Error("secret=private path=/music/personal"));
        const response = await read("my-kima-id", "/api/download-manager/downtify/jobs");
        expect(response.status).toBe(503);
        expect(response.body).toEqual({
            state: "unavailable", items: [], displayed: 0, hasMore: false,
        });
    });

    it("provides no create, cancel or delete actions", async () => {
        const endpoint = "/api/download-manager/downtify/jobs";
        expect((await request(app).post(endpoint).send({})).status).toBe(404);
        expect((await request(app).delete(endpoint)).status).toBe(404);
        expect((await request(app).patch(endpoint).send({})).status).toBe(404);
        expect(mockBoundQueue).not.toHaveBeenCalled();
    });
});


describe("Spotify link intake preview, no downloads submitted", () => {
    const id = "0123456789ABCDEFGHIJKL";
    const post = (body: object | string = { url: "https://open.spotify.com/track/" + id }) =>
        request(app).post("/api/download-manager/spotify/preview")
            .set("Authorization", "Bearer synthetic-test-token")
            .set("X-Test-User", "account-A").send(body);

    it("requires authentication before querying stored permissions", async () => {
        const response = await request(app).post("/api/download-manager/spotify/preview")
            .send({ url: "https://open.spotify.com/track/" + id });
        expect(response.status).toBe(401);
        expect(mockPermissionUser).not.toHaveBeenCalled();
        expect(mockBoundQueue).not.toHaveBeenCalled();
    });

    it("uses current database permissions, not client-provided claims", async () => {
        mockPermissionUser.mockResolvedValue({
            role: "user", canRequestAlbums: true, canDownloadTracks: false,
        });
        const response = await post({
            url: "https://open.spotify.com/track/" + id,
            canDownloadTracks: true, role: "admin", userId: "another-user",
        });
        expect(response.status).toBe(403);
        expect(response.body.permission).toBe("canDownloadTracks");
        expect(mockPermissionUser).toHaveBeenCalledWith({
            where: { id: "account-A" },
            select: { role: true, canRequestAlbums: true, canDownloadTracks: true },
        });
        expect(mockBoundQueue).not.toHaveBeenCalled();
    });

    it("allows an administrator but still validates their link", async () => {
        mockPermissionUser.mockResolvedValue({
            role: "admin", canRequestAlbums: false, canDownloadTracks: false,
        });
        const response = await post({ url: "https://open.spotify.com/album/" + id + "?si=share" });
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            provider: "spotify", kind: "album",
            canonicalUrl: "https://open.spotify.com/album/" + id,
            intentKey: "spotify:album:" + id,
            duplicateCheck: "not_checked",
            downloadStarted: false,
            libraryVerification: "not_checked",
            submissionEnabled: false,
        });
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(JSON.stringify(response.body)).not.toContain("share");
    });

    it("accepts a permitted listener but NEVER queues or checks any downloads", async () => {
        const response = await post();
        expect(response.status).toBe(200);
        expect(response.body.kind).toBe("track");
        expect(response.body.downloadStarted).toBe(false);
        expect(response.body.duplicateCheck).toBe("not_checked");
        expect(response.body.submissionEnabled).toBe(false);
        expect(mockBoundQueue).not.toHaveBeenCalled();
        expect(mockOverview).not.toHaveBeenCalled();
    });

    it.each([
        {}, { url: null }, { url: 123 }, { url: [] },
        { url: "https://spotify.example/track/" + id },
        { url: "http://open.spotify.com/track/" + id },
        { url: "https://open.spotify.com/artist/" + id },
        { url: "https://open.spotify.com/track/nope" },
        { url: "x".repeat(2400) },
    ])("rejects an unsupported input before any remote operation: %p", async (body) => {
        const response = await post(body);
        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            error: "Unsupported Spotify track, album or playlist link",
        });
        expect(JSON.stringify(response.body)).not.toContain("x".repeat(60));
        expect(mockBoundQueue).not.toHaveBeenCalled();
    });

    it("denies removed accounts and fails closed on permission-store errors", async () => {
        mockPermissionUser.mockResolvedValue(null);
        expect((await post()).status).toBe(401);
        mockPermissionUser.mockRejectedValue(new Error("private database failure"));
        const response = await post();
        expect(response.status).toBe(500);
        expect(JSON.stringify(response.body)).not.toContain("private database failure");
    });
});


describe("staged Spotify preparation — durable owner-scoped intents only", () => {
    const link = "https://open.spotify.com/track/0123456789ABCDEFGHIJKL";
    const postIntent = (body: object = { url: link }, account = "user-A") =>
        request(app).post("/api/download-manager/spotify/intents")
            .set("Authorization", "Bearer synthetic-test-token")
            .set("X-Test-User", account).send(body);

    it("is disabled by default and cannot create intents", async () => {
        const response = await postIntent();
        expect(response.status).toBe(404);
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(mockPrepareIntent).not.toHaveBeenCalled();
        expect(mockPermissionUser).not.toHaveBeenCalled();
    });

    it("requires Kima authentication even when optional intake is enabled", async () => {
        process.env.KIMA_SPOTIFY_INTENTS_ENABLED = "true";
        const response = await request(app).post("/api/download-manager/spotify/intents")
            .send({ url: link });
        expect(response.status).toBe(401);
        expect(mockPrepareIntent).not.toHaveBeenCalled();
    });

    it("uses stored download permission, never forged admin/user flags", async () => {
        process.env.KIMA_SPOTIFY_INTENTS_ENABLED = "true";
        mockPermissionUser.mockResolvedValue({
            role: "user", canRequestAlbums: true, canDownloadTracks: false,
        });
        const response = await postIntent({ url: link, role: "admin", userId: "victim" });
        expect(response.status).toBe(403);
        expect(mockPrepareIntent).not.toHaveBeenCalled();
        expect(mockPermissionUser).toHaveBeenCalledWith({
            where: { id: "user-A" },
            select: { role: true, canRequestAlbums: true, canDownloadTracks: true },
        });
    });

    it("creates a prepared-only intent as the signed-in account", async () => {
        process.env.KIMA_SPOTIFY_INTENTS_ENABLED = "true";
        const response = await postIntent({ url: link, userId: "different-user" });
        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
            status: "prepared", alreadyPrepared: false,
            duplicateScope: "this_users_prepared_intents_only",
            libraryDuplicateCheck: "not_checked",
            submittedByThisRequest: false,
            downloadStartedByThisRequest: false,
            filesChangedByThisRequest: false,
        });
        expect(mockPrepareIntent).toHaveBeenCalledWith("user-A", link);
        expect(mockBoundQueue).not.toHaveBeenCalled();
    });

    it("returns an existing intent without another preparation", async () => {
        process.env.KIMA_SPOTIFY_INTENTS_ENABLED = "true";
        mockPrepareIntent.mockResolvedValue({
            id: "existing", provider: "spotify", kind: "track",
            status: "prepared", alreadyPrepared: true,
            libraryDuplicateCheck: "not_checked",
            submittedByThisRequest: false,
        });
        const response = await postIntent();
        expect(response.status).toBe(200);
        expect(response.body.id).toBe("existing");
        expect(response.body.alreadyPrepared).toBe(true);
        expect(mockPrepareIntent).toHaveBeenCalledTimes(1);
    });

    it("rejects invalid links, not silently treated as saved tasks", async () => {
        process.env.KIMA_SPOTIFY_INTENTS_ENABLED = "true";
        mockPrepareIntent.mockResolvedValue(null);
        const response = await postIntent({ url: "http://evil.example/" });
        expect(response.status).toBe(400);
        expect(response.body.error).toBe("Unsupported Spotify track, album or playlist link");
    });

    it("does not leak database errors or private file paths", async () => {
        process.env.KIMA_SPOTIFY_INTENTS_ENABLED = "true";
        mockPrepareIntent.mockRejectedValue(new Error("secret database /music/private"));
        const response = await postIntent();
        expect(response.status).toBe(503);
        expect(response.body).toEqual({ error: "Unable to prepare Spotify request" });
        expect(JSON.stringify(response.body)).not.toContain("/music/private");
    });
});

describe("saved Spotify preparation listing", () => {
    const readSaved = (url = "/api/download-manager/spotify/intents", account = "owner-A") =>
        request(app).get(url).set("Authorization", "Bearer synthetic-test-token")
            .set("X-Test-User", account);

    it("requires login even when the feature is disabled", async () => {
        const response = await request(app).get("/api/download-manager/spotify/intents");
        expect(response.status).toBe(401);
        expect(mockListSavedIntents).not.toHaveBeenCalled();
    });

    it("returns disabled capability without database or rights lookup if OFF", async () => {
        const response = await readSaved();
        expect(response.status).toBe(200);
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(response.body).toEqual({
            enabled: false, items: [], displayed: 0, total: 0,
            limit: 20, offset: 0, hasMore: false, isDownloadQueue: false,
        });
        expect(mockListSavedIntents).not.toHaveBeenCalled();
        expect(mockPermissionUser).not.toHaveBeenCalled();
    });

    it("checks database download permission and refuses unauthorized users", async () => {
        process.env.KIMA_SPOTIFY_INTENTS_ENABLED = "true";
        mockPermissionUser.mockResolvedValue({
            role: "user", canRequestAlbums: false, canDownloadTracks: false,
        });
        const response = await readSaved("/api/download-manager/spotify/intents?userId=other");
        expect(response.status).toBe(403);
        expect(mockListSavedIntents).not.toHaveBeenCalled();
    });

    it("uses only the signed-in owner even with forged query userId and role", async () => {
        process.env.KIMA_SPOTIFY_INTENTS_ENABLED = "true";
        const response = await readSaved("/api/download-manager/spotify/intents?limit=12&offset=3&userId=victim&role=admin", "owner-A");
        expect(response.status).toBe(200);
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(mockListSavedIntents).toHaveBeenCalledWith("owner-A", 12, 3);
    });

    it.each([
        "?limit=0", "?limit=51", "?limit=-1", "?limit=1.25",
        "?limit=invalid", "?limit[]=1", "?offset=-1", "?offset=1001",
        "?offset[]=3",
    ])("rejects %s without querying saved requests", async (qs) => {
        process.env.KIMA_SPOTIFY_INTENTS_ENABLED = "true";
        const response = await readSaved("/api/download-manager/spotify/intents" + qs);
        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: "Invalid pagination" });
        expect(mockListSavedIntents).not.toHaveBeenCalled();
    });

    it("does not return database errors or private URLs", async () => {
        process.env.KIMA_SPOTIFY_INTENTS_ENABLED = "true";
        mockListSavedIntents.mockRejectedValue(new Error("private /music/userB/key"));
        const response = await readSaved();
        expect(response.status).toBe(503);
        expect(response.body).toEqual({ error: "Unable to load prepared requests" });
    });

    it("never exposes update, cancel, delete or engine submission routes", async () => {
        process.env.KIMA_SPOTIFY_INTENTS_ENABLED = "true";
        expect((await request(app).patch("/api/download-manager/spotify/intents/x")).status).toBe(404);
        expect((await request(app).delete("/api/download-manager/spotify/intents/x")).status).toBe(404);
        expect(mockListSavedIntents).not.toHaveBeenCalled();
    });
});

describe("read-only Spotify ISRC/on-disk library verification", () => {
    const link = "https://open.spotify.com/track/0123456789ABCDEFGHIJKL";
    const post = (body: object = { url: link }) => request(app)
        .post("/api/download-manager/spotify/check-library")
        .set("Authorization", "Bearer synthetic-test-token")
        .set("X-Test-User", "current-user").send(body);

    it("requires a signed-in Kima user before any Spotify lookup", async () => {
        const response = await request(app)
            .post("/api/download-manager/spotify/check-library").send({ url: link });
        expect(response.status).toBe(401);
        expect(mockLibraryEvidence).not.toHaveBeenCalled();
    });

    it("requires persisted track-download permission, not forged request flags", async () => {
        mockPermissionUser.mockResolvedValue({
            role: "user", canRequestAlbums: true, canDownloadTracks: false,
        });
        const result = await post({ url: link, userId: "victim", role: "admin", canDownloadTracks: true });
        expect(result.status).toBe(403);
        expect(mockLibraryEvidence).not.toHaveBeenCalled();
        expect(mockPermissionUser).toHaveBeenCalledWith({
            where: { id: "current-user" },
            select: { role: true, canRequestAlbums: true, canDownloadTracks: true },
        });
    });

    it("returns only the conservative recording evidence on explicit request", async () => {
        const response = await post({ url: link, userId: "ignored" });
        expect(response.status).toBe(200);
        expect(mockLibraryEvidence).toHaveBeenCalledWith(link);
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(response.body).toEqual({
            provider: "spotify", kind: "track", status: "recording_match_on_disk",
            evidence: "isrc_duration_and_file", recordingMatch: true,
            audioDecoded: false, albumEditionVerified: false,
            matchedTrackId: "track-on-disk", downloadStarted: false,
        });
        expect(mockPrepareIntent).not.toHaveBeenCalled();
        expect(mockBoundQueue).not.toHaveBeenCalled();
    });

    it("does not convert a missing Spotify metadata response into proof of absence", async () => {
        mockLibraryEvidence.mockResolvedValue({
            provider: "spotify", kind: "track", status: "metadata_unavailable",
            evidence: "not_proven", recordingMatch: false,
            audioDecoded: false, albumEditionVerified: false,
            matchedTrackId: null, downloadStarted: false,
        });
        const response = await post();
        expect(response.status).toBe(200);
        expect(response.body.status).toBe("metadata_unavailable");
        expect(response.body.recordingMatch).toBe(false);
    });

    it("returns a generic error on a provider outage rather than leaking its source", async () => {
        mockLibraryEvidence.mockRejectedValue(new Error("secret Spotify bearer /music/private.flac"));
        const response = await post();
        expect(response.status).toBe(503);
        expect(response.body).toEqual({ error: "Library verification unavailable" });
        expect(JSON.stringify(response.body)).not.toContain("private");
    });

    it("rejects an invalid link and does not create a download request", async () => {
        mockLibraryEvidence.mockResolvedValue(null);
        const response = await post({ url: "https://wrong-spotify.example/item" });
        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: "Unsupported Spotify link" });
        expect(mockPrepareIntent).not.toHaveBeenCalled();
    });

    it("has no delete, download or engine submission endpoint on the verification route", async () => {
        expect((await request(app).delete("/api/download-manager/spotify/check-library")).status).toBe(404);
        expect((await request(app).put("/api/download-manager/spotify/check-library").send({})).status).toBe(404);
        expect(mockLibraryEvidence).not.toHaveBeenCalled();
    });
});


describe("pinned, default-off single-track Downtify submission route", () => {
    const id = "intent-abc123";
    const post = (body: object = { acknowledgeUnverified: true }, owner = "owner-1") =>
        request(app).post("/api/download-manager/spotify/intents/" + id + "/submit")
            .set("Authorization", "Bearer synthetic-test-token")
            .set("X-Test-User", owner)
            .send(body);
    const capability = (owner = "owner-1") => request(app)
        .get("/api/download-manager/spotify/dispatch-capability")
        .set("Authorization", "Bearer synthetic-test-token")
        .set("X-Test-User", owner);

    it("requires a Kima session for capability and submission", async () => {
        expect((await request(app).get("/api/download-manager/spotify/dispatch-capability")).status).toBe(401);
        expect((await request(app).post("/api/download-manager/spotify/intents/" + id + "/submit").send({})).status).toBe(401);
        expect(mockDispatchCapability).not.toHaveBeenCalled();
        expect(mockDispatchRequest).not.toHaveBeenCalled();
    });

    it("is disabled by default and cannot reach a remote engine", async () => {
        const status = await capability();
        expect(status.status).toBe(200);
        expect(status.headers["cache-control"]).toBe("no-store");
        expect(status.body).toEqual({ state: "disabled", canSubmit: false, singleTrackOnly: true });
        const response = await post();
        expect(response.status).toBe(404);
        expect(response.body.error).toBe("Downtify submission not available");
        expect(mockDispatchRequest).not.toHaveBeenCalled();
    });

    it("denies the latest DB permissions even for a forged admin request", async () => {
        mockPermissionUser.mockResolvedValue({
            role: "user", canRequestAlbums: true, canDownloadTracks: false,
        });
        const response = await post({
            acknowledgeUnverified: true, role: "admin",
            userId: "victim", remoteBase: "http://evil.example", deviceToken: "secret",
        });
        expect(response.status).toBe(403);
        expect(mockDispatchRequest).not.toHaveBeenCalled();
        expect(mockDispatchCapability).not.toHaveBeenCalled();
    });

    it("ignores client-supplied users, remote URLs, tokens and song objects", async () => {
        mockDispatchCapability.mockReturnValue({ state: "available", canSubmit: true, singleTrackOnly: true });
        const res = await post({
            acknowledgeUnverified: true, userId: "victim",
            downtifyUserId: 77, server: "https://evil.example",
            song: { song_id: "wrong" },
        });
        expect(res.status).toBe(202);
        expect(mockDispatchRequest).toHaveBeenCalledWith("owner-1", id, true);
        expect(JSON.stringify(res.body)).not.toContain("evil.example");
        expect(JSON.stringify(res.body)).not.toContain("victim");
        expect(res.headers["cache-control"]).toBe("no-store");
    });

    it("requires explicit real boolean acknowledgement, never a string truthy value", async () => {
        mockDispatchCapability.mockReturnValue({ state: "available", canSubmit: true, singleTrackOnly: true });
        mockDispatchRequest.mockResolvedValue({
            state: "confirmation_required", libraryVerified: false,
            downloadInKimaVerified: false, remotePostSent: false,
        });
        const response = await post({ acknowledgeUnverified: "true" });
        expect(response.status).toBe(400);
        expect(mockDispatchRequest).toHaveBeenCalledWith("owner-1", id, false);
    });

    it("returns conservative states without retries for remote timeouts or local matches", async () => {
        mockDispatchCapability.mockReturnValue({ state: "available", canSubmit: true, singleTrackOnly: true });
        for (const [state, status] of [
            ["dispatch_unknown", 202],
            ["library_present", 409],
            ["needs_library_review", 409],
            ["already_attempted", 409],
            ["already_claimed", 409],
            ["remote_unavailable", 503],
            ["remote_unauthorized", 503],
            ["remote_incompatible", 503],
            ["already_in_remote_queue", 200],
        ] as const) {
            mockDispatchRequest.mockResolvedValue({
                state, libraryVerified: false,
                downloadInKimaVerified: false, remotePostSent: false,
            });
            const response = await post();
            expect(response.status).toBe(status);
            expect(response.body.state).toBe(state);
        }
    });

    it("redacts unexpected database errors and never authorizes an automatic retry", async () => {
        mockDispatchCapability.mockReturnValue({ state: "available", canSubmit: true, singleTrackOnly: true });
        mockDispatchRequest.mockRejectedValue(new Error("/music/private secret device token"));
        const response = await post();
        expect(response.status).toBe(503);
        expect(response.body.error).toContain("do not retry automatically");
        expect(JSON.stringify(response.body)).not.toContain("private");
        expect(JSON.stringify(response.body)).not.toContain("token");
    });

    it("has no cancel/delete/queue clear actions", async () => {
        expect((await request(app).delete("/api/download-manager/spotify/intents/" + id + "/submit")).status).toBe(404);
        expect((await request(app).patch("/api/download-manager/spotify/intents/" + id + "/submit").send({})).status).toBe(404);
        expect(mockDispatchRequest).not.toHaveBeenCalled();
    });
});


describe("D3 explicitly requested owner-only read-only remote verification", () => {
    const path = "/api/download-manager/spotify/intents/intent-abc123/remote-status";
    const cap = "/api/download-manager/spotify/reconciliation-capability";

    it("rejects unauthenticated capability and verification requests", async () => {
        expect((await request(app).get(cap)).status).toBe(401);
        expect((await request(app).get(path)).status).toBe(401);
        expect(mockReconciliationCapability).not.toHaveBeenCalled();
        expect(mockRemoteVerification).not.toHaveBeenCalled();
    });

    it("requires the latest persisted track-download permission", async () => {
        mockPermissionUser.mockResolvedValue({
            role: "user", canRequestAlbums: true, canDownloadTracks: false,
        });
        const result = await read("owner-1", path + "?userId=victim&role=admin");
        expect(result.status).toBe(403);
        expect(mockReconciliationCapability).not.toHaveBeenCalled();
        expect(mockRemoteVerification).not.toHaveBeenCalled();
    });

    it("is disabled by default and never queries the remote engine", async () => {
        const status = await read("owner-1", cap);
        expect(status.status).toBe(200);
        expect(status.body).toEqual({
            state: "disabled", canCheck: false, singleTrackOnly: true,
        });
        const result = await read("owner-1", path);
        expect(result.status).toBe(404);
        expect(result.headers["cache-control"]).toBe("no-store");
        expect(mockRemoteVerification).not.toHaveBeenCalled();
    });

    it("uses only authenticated identity and returns non-playable proof with no raw paths", async () => {
        mockReconciliationCapability.mockReturnValue({
            state: "available", canCheck: true, singleTrackOnly: true,
        });
        const result = await read("owner-1", path + "?userId=victim&token=ignored");
        expect(result.status).toBe(200);
        expect(result.headers["cache-control"]).toBe("no-store");
        expect(mockRemoteVerification).toHaveBeenCalledWith("owner-1", "intent-abc123");
        expect(result.body).toEqual({
            state: "verified", remotePhase: "downloaded",
            remoteOwnershipVerified: true, libraryVerification: "not_checked",
            playbackVerified: false, filesChanged: false, retryAllowed: false,
        });
        expect(JSON.stringify(result.body)).not.toContain("victim");
    });

    it("denies missing owned intent and redacts internal errors", async () => {
        mockReconciliationCapability.mockReturnValue({
            state: "available", canCheck: true, singleTrackOnly: true,
        });
        mockRemoteVerification.mockResolvedValueOnce({
            state: "not_found", remotePhase: "not_checked",
            remoteOwnershipVerified: false, libraryVerification: "not_checked",
            playbackVerified: false, filesChanged: false, retryAllowed: false,
        });
        expect((await read("owner-1", path)).status).toBe(404);
        mockRemoteVerification.mockRejectedValueOnce(new Error("secret=token path=/music/private"));
        const result = await read("owner-1", path);
        expect(result.status).toBe(503);
        expect(JSON.stringify(result.body)).not.toContain("private");
        expect(JSON.stringify(result.body)).not.toContain("secret");
    });

    it("exposes no mutation, retry, cancel or queue-clear route", async () => {
        expect((await request(app).post(path).send({})).status).toBe(404);
        expect((await request(app).patch(path).send({})).status).toBe(404);
        expect((await request(app).delete(path)).status).toBe(404);
        expect(mockRemoteVerification).not.toHaveBeenCalled();
    });
});

describe("D5 explicit, owner-only, read-only staged source file evidence", () => {
    const path = "/api/download-manager/spotify/intents/intent-abc123/source-file";
    const cap = "/api/download-manager/spotify/source-file-capability";

    it("requires a signed-in user before reading any capability or source evidence", async () => {
        expect((await request(app).get(cap)).status).toBe(401);
        expect((await request(app).get(path)).status).toBe(401);
        expect(mockSourceFileCapability).not.toHaveBeenCalled();
        expect(mockSourceFileEvidence).not.toHaveBeenCalled();
    });

    it("denies revoked persisted download rights regardless of forged query parameters", async () => {
        mockPermissionUser.mockResolvedValue({
            role: "user", canRequestAlbums: false, canDownloadTracks: false,
        });
        const result = await read("owner-1", path + "?userId=victim&role=admin");
        expect(result.status).toBe(403);
        expect(mockSourceFileCapability).not.toHaveBeenCalled();
        expect(mockSourceFileEvidence).not.toHaveBeenCalled();
    });

    it("does not read staging when disabled by default", async () => {
        const capRes = await read("owner-1", cap);
        expect(capRes.status).toBe(200);
        expect(capRes.body).toEqual({ state: "disabled", canCheck: false, singleTrackOnly: true });
        const res = await read("owner-1", path);
        expect(res.status).toBe(404);
        expect(res.headers["cache-control"]).toBe("no-store");
        expect(mockSourceFileEvidence).not.toHaveBeenCalled();
    });

    it("ignores client-supplied remote credentials, filenames and other users", async () => {
        mockSourceFileCapability.mockReturnValue({
            state: "available", canCheck: true, singleTrackOnly: true,
        });
        const res = await read(
            "owner-1", path + "?userId=other&filename=/etc/passwd&token=secret",
        );
        expect(res.status).toBe(200);
        expect(mockSourceFileEvidence).toHaveBeenCalledWith("owner-1", "intent-abc123");
        expect(res.body).toMatchObject({
            state: "candidate_present_unverified", regularFileObserved: true,
            recordingVerified: false, audioDecoded: false,
            libraryImportVerified: false, filesChanged: false, retryAllowed: false,
        });
        expect(JSON.stringify(res.body)).not.toContain("etc/passwd");
        expect(JSON.stringify(res.body)).not.toContain("secret");
        expect(JSON.stringify(res.body)).not.toContain("other");
    });

    it("treats missing owned requests as missing without leaking remote files", async () => {
        mockSourceFileCapability.mockReturnValue({
            state: "available", canCheck: true, singleTrackOnly: true,
        });
        mockSourceFileEvidence.mockResolvedValueOnce({
            state: "not_found", remotePhase: "not_checked",
            regularFileObserved: false, recordingVerified: false,
            audioDecoded: false, stableMountVerified: false,
            libraryImportVerified: false, filesChanged: false, retryAllowed: false,
        });
        const result = await read("owner-1", path);
        expect(result.status).toBe(404);
        expect(result.body.regularFileObserved).toBe(false);
    });

    it("redacts private filesystem errors and has no mutating HTTP methods", async () => {
        mockSourceFileCapability.mockReturnValue({
            state: "available", canCheck: true, singleTrackOnly: true,
        });
        mockSourceFileEvidence.mockRejectedValueOnce(new Error("secret /staging/private.flac"));
        const result = await read("owner-1", path);
        expect(result.status).toBe(503);
        expect(JSON.stringify(result.body)).not.toContain("secret");
        expect(JSON.stringify(result.body)).not.toContain("/staging");
        expect((await request(app).post(path).send({})).status).toBe(404);
        expect((await request(app).patch(path).send({})).status).toBe(404);
        expect((await request(app).delete(path)).status).toBe(404);
    });
});
