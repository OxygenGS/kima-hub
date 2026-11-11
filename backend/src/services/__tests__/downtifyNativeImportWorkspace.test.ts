import { promises as fs } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import {
    ensureNativeImportDestination,
    nativeImportDestination,
} from "../downtifyNativeImportWorkspace";

const spotify = "0123456789ABCDEFGHIJKL";
let root = "";
beforeEach(async () => {
    root = await fs.mkdtemp(path.join(tmpdir(), "kima-native-workspace-"));
});
afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
});

describe("Native import destination is automatic, isolated and path-safe", () => {
    it("makes a deterministic single-track target without operator paths", () => {
        expect(nativeImportDestination("Artist", "A Song", spotify, ".flac"))
            .toBe("Singles/Downtify/Artist/A Song - " + spotify + ".flac");
    });
    it("normalizes untrusted artist/title characters and forbids path escapes", () => {
        const result = nativeImportDestination("../../secret", "../Album:Song", spotify, ".mp3");
        expect(result).toMatch(/^Singles\/Downtify\//);
        expect(result).not.toContain("..");
        expect(result).not.toContain("\\");
        expect(nativeImportDestination("Artist", "Song", "invalid", ".flac")).toBeNull();
        expect(nativeImportDestination("Artist", "Song", spotify, ".exe")).toBeNull();
    });
    it("creates only the Kima Singles/Downtify destination directories", async () => {
        const rel = nativeImportDestination("Artist", "Song", spotify, ".flac")!;
        const first = await ensureNativeImportDestination(root, rel);
        expect(first).toEqual({ state: "ready", relativeTarget: rel });
        const second = await ensureNativeImportDestination(root, rel);
        expect(second.state).toBe("ready");
        expect((await fs.stat(path.join(root, "Singles", "Downtify", "Artist"))).isDirectory())
            .toBe(true);
        await expect(fs.stat(path.join(root, "Music"))).rejects.toMatchObject({
            code: "ENOENT",
        });
    });
    it("refuses a symlinked artist directory without writing through it", async () => {
        await fs.mkdir(path.join(root, "Singles", "Downtify"), { recursive: true });
        const outside = await fs.mkdtemp(path.join(tmpdir(), "kima-external-"));
        try {
            await fs.symlink(outside, path.join(root, "Singles", "Downtify", "Artist"));
            const rel = nativeImportDestination("Artist", "Song", spotify, ".flac")!;
            expect((await ensureNativeImportDestination(root, rel)).state)
                .toBe("unsafe_destination");
            expect(await fs.readdir(outside)).toEqual([]);
        } finally {
            await fs.rm(outside, { recursive: true, force: true });
        }
    });
    it("never creates directories inside a world/group writable music root", async () => {
        await fs.chmod(root, 0o777);
        const rel = nativeImportDestination("Artist", "Song", spotify, ".flac")!;
        expect((await ensureNativeImportDestination(root, rel)).state)
            .toBe("unsafe_destination");
        await expect(fs.stat(path.join(root, "Singles"))).rejects.toMatchObject({
            code: "ENOENT",
        });
    });
    it("does not accept unexpected relative paths from users or the remote API", async () => {
        for(const rel of [
            "Singles/Other/Artist/song.flac",
            "Singles/Downtify/Artist/../../.env",
            "/etc/passwd", "Singles/Downtify/song.flac",
        ]) {
            expect((await ensureNativeImportDestination(root, rel)).state)
                .toBe("unsafe_destination");
        }
    });
});
