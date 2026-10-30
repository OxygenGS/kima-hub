import path from "path";
import { soulseekDownloadDestination } from "../soulseekDestination";

describe("Soulseek import destination", () => {
    const base = path.join("/music", "Singles", "Kima Downloads");

    it("isolates normal manual and background downloads from the music root", () => {
        expect(soulseekDownloadDestination("/music", "Tones and I", "The Kids Are Coming", "Dance Monkey.flac"))
            .toBe(path.join(base, "Tones and I", "The Kids Are Coming", "Dance Monkey.flac"));
    });

    it("normalizes malicious remote directory names without escaping the import root", () => {
        for (const malicious of ["../../private", "../..", "..\\..", "/", "\\", "", "..", ".", "\u0000"]) {
            const destination = soulseekDownloadDestination("/music", malicious, malicious, malicious);
            expect(destination.startsWith(base + path.sep)).toBe(true);
            expect(path.relative(base, destination).split(path.sep)).toHaveLength(3);
            expect(path.relative(base, destination).split(path.sep).every(x => x !== ".." && x !== ".")).toBe(true);
        }
    });

    it("preserves Unicode artist names while replacing Windows and P2P separators", () => {
        const dest = soulseekDownloadDestination("/music", "Björk", "Homogenic", "04 - Jóga?.flac");
        expect(dest).toContain("Björk");
        expect(dest.endsWith("04 - Jóga_.flac")).toBe(true);
    });

    it("does not let empty or hidden filenames become a directory", () => {
        expect(soulseekDownloadDestination("/music", ".", "", ".."))
            .toBe(path.join(base, "Unknown Artist", "Unknown Album", "track.mp3"));
    });
});
