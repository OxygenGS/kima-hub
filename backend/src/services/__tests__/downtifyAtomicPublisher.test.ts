import { createHash } from "crypto";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import { publishNativeAudio, safeNativeImportTarget } from "../downtifyAtomicPublisher";

const DEST = "Singles/Artist/01 - Song.flac";
const audio = Buffer.concat([Buffer.from("fLaC"), Buffer.alloc(1024, 0x33)]);
let root = "";

async function* stream(...chunks: Buffer[]): AsyncGenerator<Buffer> {
    for (const chunk of chunks) yield chunk;
}
function publish(bytes: Buffer = audio, relativeTarget = DEST) {
    return publishNativeAudio({
        musicRoot: root,
        relativeTarget,
        expectedBytes: bytes.length,
        chunks: stream(bytes.subarray(0, 100), bytes.subarray(100)),
    });
}
const target = () => path.join(root, "Singles", "Artist", "01 - Song.flac");
async function pending(): Promise<string[]> {
    return (await fs.readdir(path.dirname(target())))
        .filter(name => name.startsWith(".kima-import-"));
}

beforeEach(async () => {
    root = await fs.mkdtemp(path.join(tmpdir(), "kima-publisher-"));
    await fs.mkdir(path.join(root, "Singles", "Artist"), { recursive: true });
});
afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
});

describe("Native import no-overwrite publication (not wired to Kima)", () => {
    it("installs a fully written SHA-256 verified private temp file atomically", async () => {
        const result = await publish();
        expect(result).toEqual({
            state: "published",
            bytes: audio.length,
            sha256: createHash("sha256").update(audio).digest("hex"),
            libraryImportVerified: false,
            filesPublished: true,
            retryAllowed: false,
        });
        expect(await fs.readFile(target())).toEqual(audio);
        expect((await fs.stat(target())).mode & 0o777).toBe(0o600);
        expect(await pending()).toEqual([]);
    });

    it("does not overwrite an existing different recording with the same filename", async () => {
        const original = Buffer.alloc(audio.length, 0x41);
        await fs.writeFile(target(), original);
        const result = await publish();
        expect(result.state).toBe("destination_conflict");
        expect(result.filesPublished).toBe(false);
        expect(result.retryAllowed).toBe(false);
        expect(await fs.readFile(target())).toEqual(original);
        expect(await pending()).toEqual([]);
    });

    it("recognizes identical bytes only after hashing the entire existing file", async () => {
        await fs.writeFile(target(), audio);
        const result = await publish();
        expect(result.state).toBe("already_present_same_bytes");
        expect(result.filesPublished).toBe(false);
        expect(result.libraryImportVerified).toBe(false);
        expect(await fs.readFile(target())).toEqual(audio);
        expect(await pending()).toEqual([]);
    });

    it("rejects path traversal, absolute destinations, disallowed prefixes and symlinks", async () => {
        for (const name of [
            "/etc/passwd", "../Singles/Artist/file.flac",
            "Singles/../.env", "Downtify/Artist/Song.flac",
            "Singles/Artist/secret.txt", "Singles//song.mp3",
            "Singles/Artist/file\\evil.mp3", "Singles/Artist/file.flac/extra",
        ]) {
            expect(safeNativeImportTarget(name)).toBeNull();
            expect((await publish(audio, name)).state).toBe("unsafe_destination");
        }
        await fs.symlink(path.join(root, "Singles", "Artist"),
            path.join(root, "Singles", "Evil"));
        expect((await publish(audio, "Singles/Evil/Song.flac")).state)
            .toBe("unsafe_destination");
        expect(await pending()).toEqual([]);
    });

    it("refuses world-writable directories vulnerable to local name replacement", async () => {
        await fs.chmod(path.join(root, "Singles", "Artist"), 0o777);
        const result = await publish();
        expect(result.state).toBe("unsafe_destination");
        await expect(fs.stat(target())).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("does not create a directory or publish outside an existing reviewed tree", async () => {
        const result = await publish(audio, "Singles/NotApproved/01 - Song.flac");
        expect(result.state).toBe("unsafe_destination");
        await expect(fs.stat(path.join(root, "Singles", "NotApproved")))
            .rejects.toMatchObject({ code: "ENOENT" });
    });

    it("removes an incomplete temporary file without ever publishing it", async () => {
        const result = await publishNativeAudio({
            musicRoot: root, relativeTarget: DEST, expectedBytes: audio.length,
            chunks: stream(audio.subarray(0, 100)),
        });
        expect(result.state).toBe("incomplete_source");
        expect(result.filesPublished).toBe(false);
        await expect(fs.stat(target())).rejects.toMatchObject({ code: "ENOENT" });
        expect(await pending()).toEqual([]);
    });

    it("rejects a source that exceeds the claimed length without altering destination", async () => {
        const result = await publishNativeAudio({
            musicRoot: root, relativeTarget: DEST, expectedBytes: 64,
            chunks: stream(audio),
        });
        expect(result.state).toBe("incomplete_source");
        expect(result.filesPublished).toBe(false);
        await expect(fs.stat(target())).rejects.toMatchObject({ code: "ENOENT" });
        expect(await pending()).toEqual([]);
    });

    it("rejects over-limit source declarations without consuming their bytes", async () => {
        let read = false;
        async function* untrusted() { read = true; yield audio; }
        const result = await publishNativeAudio({
            musicRoot: root, relativeTarget: DEST,
            expectedBytes: 256 * 1024 * 1024 + 1,
            chunks: untrusted(),
        });
        expect(result.state).toBe("invalid_source");
        expect(read).toBe(false);
        expect(await pending()).toEqual([]);
    });

    it("does not follow an existing symlink when checking a potential duplicate", async () => {
        const outside = path.join(root, "outside.flac");
        await fs.writeFile(outside, audio);
        await fs.symlink(outside, target());
        const result = await publish();
        expect(["uncertain", "destination_conflict"]).toContain(result.state);
        expect(result.filesPublished).toBe(false);
        expect(result.retryAllowed).toBe(false);
        expect(await fs.readFile(outside)).toEqual(audio);
        expect(await pending()).toEqual([]);
    });

    it("only one of two simultaneous publishers can install a destination", async () => {
        const results = await Promise.all([publish(), publish()]);
        expect(results.filter(r => r.state === "published")).toHaveLength(1);
        // The loser may see the winning hardlink before its directory
        // fsync completes. A conservative "uncertain" result is correct:
        // never claim a durable duplicate until that is independently known.
        expect(results.filter(r => r.state === "already_present_same_bytes" ||
            r.state === "uncertain")).toHaveLength(1);
        expect(results.every(r => r.retryAllowed === false)).toBe(true);
        expect(await fs.readFile(target())).toEqual(audio);
        expect(await pending()).toEqual([]);
    });

    it("does not claim success if the stream errors mid-transfer", async () => {
        async function* failing(): AsyncGenerator<Buffer> {
            yield audio.subarray(0, 100);
            throw new Error("upstream transport failed with a private URL");
        }
        const result = await publishNativeAudio({
            musicRoot: root, relativeTarget: DEST,
            expectedBytes: audio.length, chunks: failing(),
        });
        expect(result.state).toBe("unavailable");
        expect(result.retryAllowed).toBe(false);
        expect(await pending()).toEqual([]);
        await expect(fs.stat(target())).rejects.toMatchObject({ code: "ENOENT" });
    });
});
