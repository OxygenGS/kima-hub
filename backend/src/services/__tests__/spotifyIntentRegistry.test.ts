const mockCreate = jest.fn();
const mockFindUnique = jest.fn();
const mockCount = jest.fn();
const mockFindMany = jest.fn();

jest.mock("../../utils/db", () => ({
    prisma: {
        spotifyDownloadIntent: {
            create: (...args: unknown[]) => mockCreate(...args),
            findUnique: (...args: unknown[]) => mockFindUnique(...args),
            count: (...args: unknown[]) => mockCount(...args),
            findMany: (...args: unknown[]) => mockFindMany(...args),
        },
    },
}));

import { prepareSpotifyIntent, getSavedSpotifyIntents } from "../spotifyIntentRegistry";

const ID = "0123456789ABCDEFGHIJKL";
const track = "https://open.spotify.com/track/" + ID;

beforeEach(() => {
    mockCreate.mockReset().mockResolvedValue({ id: "intent-1", status: "prepared" });
    mockFindUnique.mockReset().mockResolvedValue(null);
    mockCount.mockReset().mockResolvedValue(0);
    mockFindMany.mockReset().mockResolvedValue([]);
});

describe("owner-scoped durable Spotify preparation", () => {
    it("creates only a prepared intent under the server's authenticated Kima user", async () => {
        const response = await prepareSpotifyIntent("user-A", track + "?si=private-share");
        expect(mockCreate).toHaveBeenCalledTimes(1);
        expect(mockCreate).toHaveBeenCalledWith({
            data: {
                userId: "user-A",
                kind: "track",
                spotifyId: ID,
                canonicalUrl: track,
                status: "prepared",
            },
            select: { id: true, status: true },
        });
        expect(mockFindUnique).not.toHaveBeenCalled();
        expect(response).toEqual({
            id: "intent-1",
            provider: "spotify",
            kind: "track",
            canonicalUrl: track,
            status: "prepared",
            alreadyPrepared: false,
            duplicateScope: "this_users_prepared_intents_only",
            libraryDuplicateCheck: "not_checked",
            submittedByThisRequest: false,
            downloadStartedByThisRequest: false,
            filesChangedByThisRequest: false,
        });
        expect(JSON.stringify(response)).not.toContain("private-share");
    });

    it("handles simultaneous identical requests using the DB UNIQUE index", async () => {
        mockCreate.mockRejectedValue({ code: "P2002" });
        mockFindUnique.mockResolvedValue({ id: "existing-intent", status: "prepared" });

        const second = await prepareSpotifyIntent("user-A", "spotify:track:" + ID);
        expect(second).toMatchObject({
            id: "existing-intent", alreadyPrepared: true,
            status: "prepared", downloadStartedByThisRequest: false,
        });
        expect(mockFindUnique).toHaveBeenCalledWith({
            where: { userId_kind_spotifyId: {
                userId: "user-A", kind: "track", spotifyId: ID,
            } },
            select: { id: true, status: true },
        });
    });

    it("does not classify another account's identical song as its own intent", async () => {
        await prepareSpotifyIntent("user-A", track);
        await prepareSpotifyIntent("user-B", track);
        const calls = mockCreate.mock.calls.map(args => args[0].data.userId);
        expect(calls).toEqual(["user-A", "user-B"]);
    });

    it("keeps track, album and playlist identities distinct", async () => {
        await prepareSpotifyIntent("same-user", "spotify:track:" + ID);
        await prepareSpotifyIntent("same-user", "spotify:album:" + ID);
        await prepareSpotifyIntent("same-user", "spotify:playlist:" + ID);
        expect(mockCreate.mock.calls.map(args => args[0].data.kind))
            .toEqual(["track", "album", "playlist"]);
    });

    it("never overwrites an already-submitted intent or falsely claims a new download", async () => {
        mockCreate.mockRejectedValue({ code: "P2002" });
        mockFindUnique.mockResolvedValue({ id: "previous-intent", status: "submitted" });
        const result = await prepareSpotifyIntent("user-A", track);
        expect(result).toMatchObject({
            status: "submitted", alreadyPrepared: true,
            submittedByThisRequest: false,
            downloadStartedByThisRequest: false,
        });
        expect(result?.libraryDuplicateCheck).toBe("not_checked");
    });

    it("does not turn an unknown future state into a completed download", async () => {
        mockCreate.mockRejectedValue({ code: "P2002" });
        mockFindUnique.mockResolvedValue({ id: "future", status: "unexpected-future-state" });
        expect((await prepareSpotifyIntent("user-A", track))?.status).toBe("unknown");
    });

    it.each([null, {}, "spotify:artist:" + ID, "https://not-spotify.example/track/" + ID])(
        "rejects %p without writing or querying the DB", async (input) => {
            expect(await prepareSpotifyIntent("user-A", input)).toBeNull();
            expect(mockCreate).not.toHaveBeenCalled();
            expect(mockFindUnique).not.toHaveBeenCalled();
        },
    );

    it("rejects absent identity and propagates non-unique database errors", async () => {
        await expect(prepareSpotifyIntent("", track)).rejects.toThrow("Authenticated user ID required");
        mockCreate.mockRejectedValue(new Error("database not available"));
        await expect(prepareSpotifyIntent("user-A", track)).rejects.toThrow("database not available");
        expect(mockFindUnique).not.toHaveBeenCalled();
    });

    it("fails closed when a uniqueness conflict cannot be resolved", async () => {
        mockCreate.mockRejectedValue({ code: "P2002" });
        mockFindUnique.mockResolvedValue(null);
        await expect(prepareSpotifyIntent("user-A", track))
            .rejects.toThrow("Spotify intent vanished after uniqueness conflict");
    });
});

describe("prepared Spotify request owner-scoped feed", () => {
    const date = new Date("2026-11-04T20:00:00.000Z");
    const record = (values: Record<string, unknown> = {}) => ({
        id: "prepared-1",
        kind: "track",
        spotifyId: ID,
        canonicalUrl: track,
        status: "prepared",
        createdAt: date,
        ...values,
    });

    it("filters both count and selection by authenticated owner, even for admins", async () => {
        mockCount.mockResolvedValue(2);
        mockFindMany.mockResolvedValue([record()]);
        const result = await getSavedSpotifyIntents("owner-1", 15, 5);
        expect(mockCount).toHaveBeenCalledWith({ where: { userId: "owner-1" } });
        expect(mockFindMany).toHaveBeenCalledWith({
            where: { userId: "owner-1" },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: 5, take: 15,
            select: {
                id: true, kind: true, spotifyId: true,
                canonicalUrl: true, status: true, createdAt: true,
            },
        });
        expect(result).toMatchObject({
            enabled: true, total: 2, displayed: 1,
            limit: 15, offset: 5, hasMore: false,
            isDownloadQueue: false,
        });
        expect(result.items[0]).toEqual({
            id: "prepared-1", provider: "spotify",
            kind: "track", canonicalUrl: track,
            requestState: "prepared",
            createdAt: date.toISOString(),
            libraryDuplicateCheck: "not_checked",
            engineStatus: "not_checked",
        });
    });

    it("does not expose any other user metadata or private service fields", async () => {
        mockCount.mockResolvedValue(1);
        mockFindMany.mockResolvedValue([record({
            userId: "another-account",
            rawError: "token=hidden",
            metadata: { path: "/music/private/userB.flac" },
        })]);
        const result = await getSavedSpotifyIntents("owner-1");
        expect(JSON.stringify(result)).not.toContain("another-account");
        expect(JSON.stringify(result)).not.toContain("hidden");
        expect(JSON.stringify(result)).not.toContain("/music/");
    });

    it("fails closed on a stored URL that does not match the persisted Spotify id", async () => {
        mockCount.mockResolvedValue(1);
        mockFindMany.mockResolvedValue([record({
            spotifyId: "9999999999999999999999",
            canonicalUrl: "https://attacker.example/path",
            status: "future-status",
        })]);
        const result = await getSavedSpotifyIntents("owner-1");
        expect(result.items[0]).toMatchObject({
            canonicalUrl: null,
            kind: "unknown",
            requestState: "unknown",
            engineStatus: "not_checked",
        });
        expect(JSON.stringify(result)).not.toContain("attacker.example");
    });

    it("bounds pagination before any Prisma access", async () => {
        for (const args of [
            ["", 20, 0], ["owner", 0, 0], ["owner", 51, 0],
            ["owner", 20, -1], ["owner", 20, 1001], ["owner", 0.5, 0],
            ["owner", 20, Number.NaN],
        ] as const) {
            await expect(getSavedSpotifyIntents(args[0], args[1], args[2])).rejects.toThrow("Invalid Spotify intent listing");
        }
        expect(mockCount).not.toHaveBeenCalled();
        expect(mockFindMany).not.toHaveBeenCalled();
    });

    it("reports when a page is incomplete without calling it a download queue", async () => {
        mockCount.mockResolvedValue(25);
        mockFindMany.mockResolvedValue([record()]);
        const result = await getSavedSpotifyIntents("owner", 20, 0);
        expect(result.hasMore).toBe(true);
        expect(result.isDownloadQueue).toBe(false);
        expect(result.items[0].libraryDuplicateCheck).toBe("not_checked");
    });
});
