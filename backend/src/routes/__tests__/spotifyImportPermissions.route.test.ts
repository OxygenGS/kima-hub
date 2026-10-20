/**
 * Regression: a signed-in listener cannot use the playlist acquisition endpoints
 * when either permission is disabled. Requests are rejected by the real
 * persisted-permissions middleware before any import worker or file upload.
 */
const mockPermissionUser = jest.fn();
const mockQuickImport = jest.fn();
const mockStartImport = jest.fn();
const mockM3UImport = jest.fn();

jest.mock("../../utils/db", () => ({
    prisma: {
        user: { findUnique: (...args: unknown[]) => mockPermissionUser(...args) },
    },
}));
jest.mock("../../utils/logger", () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../middleware/auth", () => ({
    requireAuthOrToken: (req: any, _res: any, next: any) => {
        req.user = { id: "listener-permissions-test", username: "listener", role: "user" };
        next();
    },
    requireMusicPermission: jest.requireActual("../../middleware/auth").requireMusicPermission,
}));
jest.mock("../../services/spotify", () => ({ spotifyService: {} }));
jest.mock("../../services/spotifyImport", () => ({
    spotifyImportService: {
        quickImport: (...args: unknown[]) => mockQuickImport(...args),
        startImport: (...args: unknown[]) => mockStartImport(...args),
        importFromM3U: (...args: unknown[]) => mockM3UImport(...args),
    },
    getImportJob: jest.fn(),
}));
jest.mock("../../services/deezer", () => ({ deezerService: {} }));
jest.mock("../../utils/playlistLogger", () => ({
    readSessionLog: jest.fn(),
    getSessionLogPath: jest.fn(),
}));

import express from "express";
import request from "supertest";
import spotifyRouter from "../spotify";

const app = express();
app.use(express.json());
app.use("/spotify", spotifyRouter);

beforeEach(() => {
    mockPermissionUser.mockReset();
    mockPermissionUser.mockResolvedValue({
        role: "user", canRequestAlbums: false, canDownloadTracks: false,
    });
    mockQuickImport.mockReset();
    mockStartImport.mockReset();
    mockM3UImport.mockReset();
});

describe("playlist import permission enforcement", () => {
    const submitters = [
        {
            name: "quick import",
            submit: () => request(app).post("/spotify/import/quick").send({
                url: "https://open.spotify.com/playlist/example",
            }),
        },
        {
            name: "normal import",
            submit: () => request(app).post("/spotify/import").send({
                spotifyPlaylistId: "example", playlistName: "Example", albumMbidsToDownload: [],
            }),
        },
        {
            name: "M3U import",
            submit: () => request(app).post("/spotify/import/m3u")
                .field("playlistName", "Example")
                .attach("file", Buffer.from("#EXTM3U\\n"), "example.m3u"),
        },
    ];

    for (const { name, submit } of submitters) {
        it.each([
            { canRequestAlbums: false, canDownloadTracks: false, denied: "canRequestAlbums" },
            { canRequestAlbums: false, canDownloadTracks: true, denied: "canRequestAlbums" },
            { canRequestAlbums: true, canDownloadTracks: false, denied: "canDownloadTracks" },
        ])(`${name} rejects $denied when restricted`, async (rights) => {
            mockPermissionUser.mockResolvedValue({ role: "user", ...rights });
            const response = await submit();

            expect(response.status).toBe(403);
            expect(response.body.permission).toBe(rights.denied);
            expect(mockPermissionUser).toHaveBeenCalledWith({
                where: { id: "listener-permissions-test" },
                select: { role: true, canRequestAlbums: true, canDownloadTracks: true },
            });
            expect(mockQuickImport).not.toHaveBeenCalled();
            expect(mockStartImport).not.toHaveBeenCalled();
            expect(mockM3UImport).not.toHaveBeenCalled();
        });
    }

    it("does not grant import rights when the user row was deleted", async () => {
        mockPermissionUser.mockResolvedValue(null);
        const response = await submitters[2].submit();
        expect(response.status).toBe(401);
        expect(mockM3UImport).not.toHaveBeenCalled();
    });
});
