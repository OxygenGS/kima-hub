import { describe, it, expect } from "vitest";
import { canImportExternalPlaylist, getMusicPermissions } from "../music-permissions";

describe("getMusicPermissions", () => {
    it("hides acquisition controls when not signed in", () => {
        expect(getMusicPermissions(null)).toEqual({
            canRequestAlbums: false,
            canDownloadTracks: false,
        });
    });

    it("defaults missing regular-user permissions to false", () => {
        expect(getMusicPermissions({ role: "user" })).toEqual({
            canRequestAlbums: false,
            canDownloadTracks: false,
        });
    });

    it("keeps album and track rights independent", () => {
        expect(getMusicPermissions({
            role: "user", canRequestAlbums: true, canDownloadTracks: false,
        })).toEqual({ canRequestAlbums: true, canDownloadTracks: false });
        expect(getMusicPermissions({
            role: "user", canRequestAlbums: false, canDownloadTracks: true,
        })).toEqual({ canRequestAlbums: false, canDownloadTracks: true });
    });

    it("shows both acquisition controls to admins even with false flags", () => {
        expect(getMusicPermissions({
            role: "admin", canRequestAlbums: false, canDownloadTracks: false,
        })).toEqual({ canRequestAlbums: true, canDownloadTracks: true });
    });

    it("does not treat other roles as admin", () => {
        expect(getMusicPermissions({ role: "superadmin" })).toEqual({
            canRequestAlbums: false,
            canDownloadTracks: false,
        });
    });
    it("requires both independent rights to import external playlists", () => {
        for (const canRequestAlbums of [false, true]) {
            for (const canDownloadTracks of [false, true]) {
                expect(canImportExternalPlaylist({ canRequestAlbums, canDownloadTracks }))
                    .toBe(canRequestAlbums && canDownloadTracks);
            }
        }
    });

});
