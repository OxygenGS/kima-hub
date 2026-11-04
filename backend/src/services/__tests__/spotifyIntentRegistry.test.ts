const mockCreate = jest.fn();
const mockFindUnique = jest.fn();

jest.mock("../../utils/db", () => ({
    prisma: {
        spotifyDownloadIntent: {
            create: (...args: unknown[]) => mockCreate(...args),
            findUnique: (...args: unknown[]) => mockFindUnique(...args),
        },
    },
}));

import { prepareSpotifyIntent } from "../spotifyIntentRegistry";

const ID = "0123456789ABCDEFGHIJKL";
const track = "https://open.spotify.com/track/" + ID;

beforeEach(() => {
    mockCreate.mockReset().mockResolvedValue({ id: "intent-1", status: "prepared" });
    mockFindUnique.mockReset().mockResolvedValue(null);
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
