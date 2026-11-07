/**
 * Isolated end-to-end *filesystem* canary for the native media path.
 *
 * This generates ORIGINAL FLAC audio with FFmpeg, parses real embedded
 * tags, decodes the complete file, hashes it, publishes with no overwrite,
 * and confirms a simulated Kima scanner DB receipt against actual bytes.
 *
 * The test never contacts Downtify, Proxmox, a NAS, the real music mount
 * or the production database. A real mounted-volume canary is still
 * required before a release or cutover.
 */
import { createHash } from "crypto";
import { spawnSync } from "child_process";
import { createReadStream, promises as fs } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import { prisma } from "../../utils/db";
import {
    ensureNativeImportDestination, nativeImportDestination,
} from "../downtifyNativeImportWorkspace";
import { publishNativeAudio } from "../downtifyAtomicPublisher";
import { verifyNativeTemporaryRecording } from "../downtifyNativeAudioVerification";
import {
    confirmNativeIndexed, recordNativePublished,
    type PinnedImportOwner,
} from "../downtifyNativeImportLedger";

jest.mock("../../utils/db", () => ({
    prisma: {
        downtifyNativeImport: {
            updateMany: jest.fn(), findFirst: jest.fn(),
        },
        track: { findUnique: jest.fn() },
    },
}));

const owner: PinnedImportOwner = {
    kimaUserId: "isolated-kima-owner",
    remoteServerId: "test-server-2026",
    remoteUserId: 9,
};
const spotifyId = "0123456789ABCDEFGHIJKL";
const token = "12345678-1234-1234-1234-123456789abc";
const jobId = "clvisolatedcanary1";
const isrc = "USABC1234567";
let scratch = "";
let musicRoot = "";
let original = "";
const importedFile = () => path.join(musicRoot, "Singles", "Downtify", "Test Artist",
    "Synthetic Track - " + spotifyId + ".flac");

function synthesize(destination: string, frequency: number): void {
    const result = spawnSync("/usr/bin/ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-nostdin",
        "-f", "lavfi", "-i", "sine=frequency=" + frequency + ":duration=2",
        "-metadata", "ISRC=" + isrc, "-c:a", "flac",
        "-y", destination,
    ], { timeout: 20000 });
    if (result.status !== 0 || result.error) {
        throw new Error("Synthetic audio generation unavailable");
    }
}

async function* chunks(file: string): AsyncGenerator<Buffer> {
    for await (const data of createReadStream(file, { highWaterMark: 8192 })) {
        if (!Buffer.isBuffer(data)) throw new Error("Unexpected non-binary audio");
        yield data;
    }
}

const update = prisma.downtifyNativeImport.updateMany as jest.Mock;
const readReceipt = prisma.downtifyNativeImport.findFirst as jest.Mock;
const readTrack = prisma.track.findUnique as jest.Mock;

beforeEach(async () => {
    jest.clearAllMocks();
    scratch = await fs.mkdtemp(path.join(tmpdir(), "kima-native-canary-"));
    musicRoot = path.join(scratch, "music");
    await fs.mkdir(musicRoot, { mode: 0o700 });
    original = path.join(scratch, "source.flac");
    synthesize(original, 440);
    update.mockResolvedValue({ count: 1 });
});
afterEach(async () => {
    if (scratch) await fs.rm(scratch, { recursive: true, force: true });
});

async function publish(file: string) {
    const relative = nativeImportDestination("Test Artist", "Synthetic Track",
        spotifyId, ".flac");
    if (!relative) throw new Error("Missing safe target");
    const setup = await ensureNativeImportDestination(musicRoot, relative);
    if (setup.state !== "ready") throw new Error("Cannot create safe destination");
    const raw = await fs.readFile(file);
    const result = await publishNativeAudio({
        musicRoot,
        relativeTarget: relative,
        expectedBytes: raw.length,
        chunks: chunks(file),
        verifyTempFile: async (tempPath, source) => {
            const checked = await verifyNativeTemporaryRecording(
                tempPath,
                {
                    spotifyId, expectedSpotifyId: spotifyId,
                    isrc, durationMs: 2000, extension: ".flac",
                },
                source,
            );
            return checked.verifiedForPublication;
        },
    });
    return { result, relative, hash: createHash("sha256").update(raw).digest("hex") };
}

describe("Real-audio native import filesystem canary", () => {
    it("writes exactly once, verifies real FLAC decode+tags and waits for scanner receipt", async () => {
        const { result, relative, hash } = await publish(original);
        const originalBytes = await fs.readFile(original);
        expect(result.state).toBe("published");
        expect(result.bytes).toBe(originalBytes.length);
        expect(result.sha256).toBe(hash);
        expect(result.libraryImportVerified).toBe(false);
        expect(result.retryAllowed).toBe(false);
        expect(await fs.readFile(importedFile())).toEqual(originalBytes);

        expect(await recordNativePublished(owner, jobId, token, {
            expectedBytes: result.bytes,
            fullSha256: hash,
            relativeTarget: relative,
            remoteLibraryTrackId: "t0123456789abcdef",
        })).toBe(true);
        expect(update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                status: "published_pending_scan",
                outputRelativePath: relative,
                fullSha256: hash,
            }),
        }));
        readReceipt.mockResolvedValue({
            outputRelativePath: relative,
            expectedBytes: originalBytes.length,
            fullSha256: hash,
        });
        readTrack.mockResolvedValue({
            id: "local-indexed-track",
            fileSize: originalBytes.length,
            missingSince: null, corrupt: false,
            album: { location: "LIBRARY" },
        });

        const receipt = await confirmNativeIndexed(owner, jobId, token, musicRoot);
        expect(receipt).toEqual({
            state: "imported", indexedTrackId: "local-indexed-track",
        });
        expect(update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                status: "imported", indexedTrackId: "local-indexed-track",
            }),
        }));
        expect((await fs.readdir(path.dirname(importedFile())))
            .filter(name => name.startsWith(".kima-import-"))).toEqual([]);
    });

    it("does not rewrite or replace an existing identical recording", async () => {
        const first = await publish(original);
        expect(first.result.state).toBe("published");
        const before = await fs.stat(importedFile());
        const second = await publish(original);
        expect(second.result.state).toBe("already_present_same_bytes");
        expect(second.result.filesPublished).toBe(false);
        const after = await fs.stat(importedFile());
        expect(after.ino).toBe(before.ino);
        expect(after.size).toBe(before.size);
        expect((await fs.readdir(path.dirname(importedFile())))
            .filter(name => name.startsWith(".kima-import-"))).toEqual([]);
    });

    it("never overwrites the first copy with different but decodable audio", async () => {
        const first = await publish(original);
        expect(first.result.state).toBe("published");
        const existing = await fs.readFile(importedFile());
        const other = path.join(scratch, "different.flac");
        synthesize(other, 880);
        const conflict = await publish(other);
        expect(conflict.result.state).toBe("destination_conflict");
        expect(conflict.result.filesPublished).toBe(false);
        expect(conflict.result.retryAllowed).toBe(false);
        expect(await fs.readFile(importedFile())).toEqual(existing);
    });

    it("holds the verified publication when its physical DAS file goes missing", async () => {
        const first = await publish(original);
        expect(first.result.state).toBe("published");
        readReceipt.mockResolvedValue({
            outputRelativePath: first.relative,
            expectedBytes: first.result.bytes,
            fullSha256: first.hash,
        });
        readTrack.mockResolvedValue({
            id: "local-indexed-track", fileSize: first.result.bytes,
            missingSince: null, corrupt: false,
            album: { location: "LIBRARY" },
        });
        await fs.unlink(importedFile());
        const result = await confirmNativeIndexed(owner, jobId, token, musicRoot);
        expect(result.state).toBe("not_verified");
        expect(update).not.toHaveBeenCalled();
    });

    it("refuses a missing music mount instead of creating another local root", async () => {
        await fs.rm(musicRoot, { recursive: true, force: true });
        const relative = nativeImportDestination("Test Artist", "Synthetic Track",
            spotifyId, ".flac");
        expect(relative).not.toBeNull();
        const prep = await ensureNativeImportDestination(musicRoot, relative!);
        expect(prep.state).toBe("storage_unavailable");
        await expect(fs.stat(musicRoot)).rejects.toMatchObject({
            code: "ENOENT",
        });
    });
});
