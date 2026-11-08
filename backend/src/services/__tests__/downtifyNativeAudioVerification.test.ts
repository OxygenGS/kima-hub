import { createHash } from "crypto";
import { promises as fs } from "fs";
import { tmpdir } from "os";
import * as path from "path";
import {
    verifyNativeTemporaryRecording,
    type ExpectedNativeRecording,
} from "../downtifyNativeAudioVerification";

const spotifyId = "0123456789ABCDEFGHIJKL";
const recording: ExpectedNativeRecording = {
    spotifyId, expectedSpotifyId: spotifyId,
    isrc: "USABC1234567", durationMs: 207000,
    title: "Sample Song", artist: "Example Artist",
    extension: ".flac",
};
const bytes = Buffer.concat([Buffer.from("fLaC"), Buffer.alloc(2048, 0x55)]);
const source = {
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
};
let dir: string;
let temp: string;
const deps = () => ({
    parse: jest.fn().mockResolvedValue({
        isrc: ["USABC1234567"], durationSeconds: 207.5,
        title: "Sample Song", artist: "Example Artist",
        artists: ["Example Artist"],
    }),
    decode: jest.fn().mockImplementation(async (chunks: AsyncIterable<Buffer>) => {
        let consumed = 0;
        for await (const chunk of chunks) consumed += chunk.length;
        return consumed === bytes.length;
    }),
});

beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(tmpdir(), "kima-verified-audio-"));
    temp = path.join(dir, ".kima-import-unique.part");
    await fs.writeFile(temp, bytes, { mode: 0o600 });
});
afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

describe("Complete private-recording audio verification (dormant)", () => {
    it("requires matching complete SHA, exact ISRC, near duration, and full decode", async () => {
        const mock = deps();
        const result = await verifyNativeTemporaryRecording(temp, recording, source, mock);
        expect(result).toEqual({
            state: "verified", verifiedForPublication: true,
            libraryImportVerified: false, filesChanged: false,
        });
        expect(mock.parse).toHaveBeenCalledWith(temp);
        expect(mock.decode).toHaveBeenCalledTimes(1);
        expect(await fs.readFile(temp)).toEqual(bytes);
    });

    it("refuses mismatched Spotify identities before reading metadata", async () => {
        const mock = deps();
        const result = await verifyNativeTemporaryRecording(temp, {
            ...recording, expectedSpotifyId: "123456789ABCDEFGHIJKLM",
        }, source, mock);
        expect(result.state).toBe("invalid_expected");
        expect(mock.parse).not.toHaveBeenCalled();
        expect(mock.decode).not.toHaveBeenCalled();
    });

    it("never declares mismatched full-file bytes safe to publish", async () => {
        const mock = deps();
        const result = await verifyNativeTemporaryRecording(temp, recording, {
            ...source, sha256: "a".repeat(64),
        }, mock);
        expect(result.state).toBe("hash_mismatch");
        expect(mock.parse).not.toHaveBeenCalled();
    });

    it("rejects unknown audio formats despite a valid filename", async () => {
        await fs.writeFile(temp, Buffer.alloc(bytes.length), { mode: 0o600 });
        const mock = deps();
        const result = await verifyNativeTemporaryRecording(temp, recording, source, mock);
        expect(result.state).toBe("header_mismatch");
        expect(mock.parse).not.toHaveBeenCalled();
    });

    it("accepts stock Downtify audio without ISRC when Spotify title, credited artist and duration match", async () => {
        const noIsrc = deps();
        noIsrc.parse.mockResolvedValueOnce({
            isrc: null, durationSeconds: 207.5,
            title: "Sample Song", artist: "Example Artist",
        });
        const outcome = await verifyNativeTemporaryRecording(temp, recording, source, noIsrc);
        expect(outcome.state).toBe("verified");
        expect(outcome.verifiedForPublication).toBe(true);
        expect(noIsrc.decode).toHaveBeenCalledTimes(1);
        expect(await fs.readFile(temp)).toEqual(bytes);
    });

    it("does not bypass full-byte SHA verification when stock audio lacks ISRC", async () => {
        const mock = deps();
        mock.parse.mockResolvedValueOnce({
            isrc: null, durationSeconds: 207,
            title: "Sample Song", artist: "Example Artist",
        });
        const outcome = await verifyNativeTemporaryRecording(temp, recording, {
            ...source, sha256: "b".repeat(64),
        }, mock);
        expect(outcome.state).toBe("hash_mismatch");
        expect(outcome.verifiedForPublication).toBe(false);
        expect(mock.parse).not.toHaveBeenCalled();
        expect(mock.decode).not.toHaveBeenCalled();
    });

    it("does not treat a longer artist name as a credited artist match", async () => {
        const mock = deps();
        mock.parse.mockResolvedValueOnce({
            isrc: null, durationSeconds: 207,
            title: "Sample Song", artist: "Example Artist Quartet",
            artists: ["Example Artist Quartet"],
        });
        expect((await verifyNativeTemporaryRecording(temp, recording, source, mock)).state)
            .toBe("recording_needs_review");
        expect(mock.decode).not.toHaveBeenCalled();
    });

    it("still rejects a conflicting embedded ISRC even when title and artist agree", async () => {
        const wrong = deps();
        wrong.parse.mockResolvedValueOnce({
            isrc: ["USABC7654321"], durationSeconds: 207,
            title: "Sample Song", artist: "Example Artist",
        });
        expect((await verifyNativeTemporaryRecording(temp, recording, source, wrong)).state)
            .toBe("recording_needs_review");
        expect(wrong.decode).not.toHaveBeenCalled();
    });

    it("never falls back for bad or contradictory ISRC values", async () => {
        for (const tag of [["bad"], ["USABC1234567", "USABC7654321"], [123]]) {
            const mock = deps();
            mock.parse.mockResolvedValueOnce({
                isrc: tag, durationSeconds: 207,
                title: "Sample Song", artist: "Example Artist",
            });
            expect((await verifyNativeTemporaryRecording(temp, recording, source, mock)).state)
                .toBe("recording_needs_review");
            expect(mock.decode).not.toHaveBeenCalled();
        }
    });

    it("holds tagless or mismatched stock recordings for review", async () => {
        for (const tags of [
            { title: null, artist: "Example Artist", durationSeconds: 207 },
            { title: "Sample Song", artist: null, durationSeconds: 207 },
            { title: "Other Song", artist: "Example Artist", durationSeconds: 207 },
            { title: "Sample Song", artist: "Different Artist", durationSeconds: 207 },
            { title: "Sample Song", artist: "Example Artist", durationSeconds: 220 },
            { title: "Sample Song", artist: "Example Artist", durationSeconds: null },
        ]) {
            const mock = deps();
            mock.parse.mockResolvedValueOnce({ isrc: null, ...tags });
            expect((await verifyNativeTemporaryRecording(temp, recording, source, mock)).state)
                .toBe("recording_needs_review");
            expect(mock.decode).not.toHaveBeenCalled();
        }
    });

    it("accepts a matching credited artist without ISRC even when a different main artist is listed", async () => {
        const mock = deps();
        mock.parse.mockResolvedValueOnce({
            isrc: null, durationSeconds: 207,
            title: " sample   SONG ",
            artist: "Another Artist", artists: ["Example Artist", "Another Artist"],
        });
        expect((await verifyNativeTemporaryRecording(temp, recording, source, mock)).state)
            .toBe("verified");
    });

    it("supports missing provider ISRC only if remaining metadata matches exactly", async () => {
        const mock = deps();
        mock.parse.mockResolvedValueOnce({
            isrc: null, durationSeconds: 207,
            title: "Sample Song", artist: "Example Artist",
        });
        expect((await verifyNativeTemporaryRecording(temp, {
            ...recording, isrc: null,
        }, source, mock)).state).toBe("verified");
    });

    it("holds a duration mismatch for review, even with matching ISRC", async () => {
        const mock = deps();
        mock.parse.mockResolvedValueOnce({
            isrc: ["USABC1234567"], durationSeconds: 241,
        });
        expect((await verifyNativeTemporaryRecording(temp, recording, source, mock)).state)
            .toBe("recording_needs_review");
    });

    it("rejects an audio decoder failure without touching the file", async () => {
        const mock = deps();
        mock.decode.mockResolvedValueOnce(false);
        expect((await verifyNativeTemporaryRecording(temp, recording, source, mock)).state)
            .toBe("decode_failed");
        expect(await fs.readFile(temp)).toEqual(bytes);
    });

    it("rejects a file changed during decode even if the test decoder succeeds", async () => {
        const mock = deps();
        mock.decode.mockImplementationOnce(async (chunks: AsyncIterable<Buffer>) => {
            for await (const _chunk of chunks) { /* read full recording */ }
            await fs.utimes(temp, new Date(2000, 0, 1), new Date(2000, 0, 1));
            return true;
        });
        expect((await verifyNativeTemporaryRecording(temp, recording, source, mock)).state)
            .toBe("file_changed");
    });

    it("rejects a symlink without following it to a different recording", async () => {
        const real = path.join(dir, "original.flac");
        await fs.rename(temp, real);
        await fs.symlink(real, temp);
        const mock = deps();
        expect((await verifyNativeTemporaryRecording(temp, recording, source, mock)).state)
            .toBe("unavailable");
        expect(mock.parse).not.toHaveBeenCalled();
        expect(await fs.readFile(real)).toEqual(bytes);
    });

    it("fails closed for files with broadly writable permissions", async () => {
        await fs.chmod(temp, 0o644);
        expect((await verifyNativeTemporaryRecording(temp, recording, source, deps())).state)
            .toBe("file_changed");
    });

    it("never returns an internal path, checksum or Spotify ID to the UI", async () => {
        const result = await verifyNativeTemporaryRecording(temp, recording, source, deps());
        const serialized = JSON.stringify(result);
        expect(serialized).not.toContain(temp);
        expect(serialized).not.toContain(source.sha256);
        expect(serialized).not.toContain(spotifyId);
    });
});
