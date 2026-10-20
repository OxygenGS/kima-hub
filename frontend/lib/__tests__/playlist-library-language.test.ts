import { describe, expect, it } from "vitest";
import { translate } from "../i18n/translations";

describe("playlist library UI translations", () => {
    it("provides real Dutch labels for creation, imports, visibility and navigation", () => {
        const labels = [
            "Your library",
            "Create your first playlist",
            "Start from scratch",
            "Import from Spotify or Deezer",
            "Import from M3U file",
            "Playlist name...",
            "Paste a playlist URL",
            "View Playlist",
            "No hidden playlists",
            "Unhide with the eye button.",
            "tracks matched",
        ];
        for (const label of labels) {
            expect(translate("en", label)).toBe(label);
            expect(translate("nl", label)).not.toBe(label);
        }
    });

    it("does not translate stored playlist names or service identifiers", () => {
        for (const externalName of ["Original Playlist – Café São Paulo", "Spotify", "Deezer", "M3U8"]) {
            expect(translate("nl", externalName)).toBe(externalName);
        }
    });
});
