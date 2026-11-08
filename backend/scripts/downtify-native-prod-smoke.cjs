#!/usr/bin/env node
"use strict";

/**
 * Production-compiled isolated Downtify audio canary.
 * Runs under a normal Node 24 process WITHOUT the Jest music-metadata mock.
 * Uses one synthetic FLAC and a private temporary /music stand-in. Does not
 * read, modify, mount or contact the actual Kima music library or Downtify.
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const { verifyNativeTemporaryRecording } = require("../dist/services/downtifyNativeAudioVerification.js");
const { publishNativeAudio } = require("../dist/services/downtifyAtomicPublisher.js");
const { nativeImportDestination, ensureNativeImportDestination } =
    require("../dist/services/downtifyNativeImportWorkspace.js");
const { initializeNativeMusicVolume, verifyNativeMusicVolume } =
    require("../dist/services/downtifyNativeMountProof.js");

const spotifyId = "0123456789ABCDEFGHIJKL";
const isrc = "USABC1234567";
let scratch = "";

async function main() {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "kima-native-prod-canary-"));
    const root = path.join(scratch, "music");
    const original = path.join(scratch, "original.flac");
    fs.mkdirSync(root, { mode: 0o700 });
    const volumeProof = await initializeNativeMusicVolume(root);
    if (!volumeProof || !await verifyNativeMusicVolume(root, volumeProof)) {
        throw new Error("Production-compiled music volume proof failed to initialize");
    }
    const ffmpeg = spawnSync("/usr/bin/ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-nostdin",
        "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
        "-metadata", "ISRC=" + isrc,
        "-c:a", "flac", "-y", original,
    ], { timeout: 20000 });
    if (ffmpeg.status !== 0 || ffmpeg.error) {
        throw new Error("FFmpeg cannot generate synthetic source: " +
            (ffmpeg.error ? String(ffmpeg.error.message) :
                "exit " + ffmpeg.status + ": " +
                String(ffmpeg.stderr || "").slice(0, 350)));
    }
    fs.chmodSync(original, 0o600);
    const bytes = fs.readFileSync(original);
    const expected = {
        spotifyId, expectedSpotifyId: spotifyId,
        isrc, durationMs: 2000,
        title: "Full Audio Canary", artist: "Synthetic Artist",
        extension: ".flac",
    };
    const source = {
        bytes: bytes.length,
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    };

    // Crucially this invokes the production-compiled default metadata
    // importer: if an ESM-only music-metadata update breaks CJS runtime,
    // this smoke test fails even if all mocked Jest tests are green.
    const checked = await verifyNativeTemporaryRecording(original, expected, source);
    if (checked.state !== "verified" || !checked.verifiedForPublication) {
        throw new Error("Compiled production FLAC verification failed: " + checked.state);
    }
    const wrong = await verifyNativeTemporaryRecording(original, {
        ...expected, isrc: "USZZZ1234567",
    }, source);
    if (wrong.state !== "recording_needs_review" || wrong.verifiedForPublication) {
        throw new Error("Wrong recording ISRC was not rejected");
    }

    // Real Downtify normally tags title and artist but not ISRC.
    // Verify that production-compiled music-metadata accepts that format
    // only with matching Spotify title + artist + duration.
    const stock = path.join(scratch, "stock-downtify-no-isrc.flac");
    const stockFfmpeg = spawnSync("/usr/bin/ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-nostdin",
        "-f", "lavfi", "-i", "sine=frequency=330:duration=2",
        "-metadata", "title=Full Audio Canary",
        "-metadata", "artist=Synthetic Artist",
        "-c:a", "flac", "-y", stock,
    ], { timeout: 20000 });
    if (stockFfmpeg.status !== 0 || stockFfmpeg.error) {
        throw new Error("Could not generate no-ISRC staging audio");
    }
    fs.chmodSync(stock, 0o600);
    const stockBytes = fs.readFileSync(stock);
    const stockSource = {
        bytes: stockBytes.length,
        sha256: crypto.createHash("sha256").update(stockBytes).digest("hex"),
    };
    const stockCheck = await verifyNativeTemporaryRecording(stock, expected, stockSource);
    if (stockCheck.state !== "verified" || !stockCheck.verifiedForPublication) {
        throw new Error("Compiled parser rejected stock no-ISRC audio: " + stockCheck.state);
    }
    const spoofedTitle = await verifyNativeTemporaryRecording(
        stock, { ...expected, title: "Different Song" }, stockSource,
    );
    if (spoofedTitle.state !== "recording_needs_review" ||
        spoofedTitle.verifiedForPublication) {
        throw new Error("No-ISRC fallback accepted incorrect Spotify title");
    }
    const spoofedArtist = await verifyNativeTemporaryRecording(
        stock, { ...expected, artist: "Different Artist" }, stockSource,
    );
    if (spoofedArtist.state !== "recording_needs_review" ||
        spoofedArtist.verifiedForPublication) {
        throw new Error("No-ISRC fallback accepted incorrect Spotify artist");
    }

    const relative = nativeImportDestination(
        "Synthetic Artist", "Full Audio Canary", spotifyId, ".flac",
    );
    if (!relative) throw new Error("Could not derive safe Singles destination");
    const prepared = await ensureNativeImportDestination(root, relative);
    if (prepared.state !== "ready") {
        throw new Error("Synthetic music root was not accepted");
    }
    const input = () => ({
        musicRoot: root, relativeTarget: relative,
        expectedBytes: bytes.length,
        chunks: fs.createReadStream(original, { highWaterMark: 8192 }),
        verifyTempFile: async (file, proof) => (
            await verifyNativeTemporaryRecording(file, expected, proof)
        ).verifiedForPublication,
    });
    const published = await publishNativeAudio(input());
    if (published.state !== "published" || published.sha256 !== source.sha256 ||
        published.libraryImportVerified || !published.filesPublished) {
        throw new Error("Verified atomic native publication failed: " + published.state);
    }
    const local = path.join(root, relative);
    if (!fs.readFileSync(local).equals(bytes)) {
        throw new Error("Original bytes changed during atomic publication");
    }
    const before = fs.statSync(local);
    const duplicate = await publishNativeAudio(input());
    const after = fs.statSync(local);
    if (duplicate.state !== "already_present_same_bytes" ||
        duplicate.filesPublished || before.ino !== after.ino) {
        throw new Error("No-overwrite native duplicate guard failed");
    }
    const files = fs.readdirSync(path.dirname(local));
    if (files.some(name => name.startsWith(".kima-import-"))) {
        throw new Error("Temporary media file leaked after publication");
    }

    // Simulate the external volume disappearing but leaving an empty writable
    // Docker bind target. The compiled guard must reject this fallback root.
    // This is a disposable directory rename, NOT a real disk unmount.
    const offline = path.join(scratch, "detached-test-volume");
    fs.renameSync(root, offline);
    fs.mkdirSync(root, { mode: 0o700 });
    if (await verifyNativeMusicVolume(root, volumeProof)) {
        throw new Error("Compiled volume proof accepted empty fallback storage");
    }
    if (fs.readdirSync(root).length !== 0) {
        throw new Error("Fallback directory unexpectedly received a media file");
    }
    // An operator might accidentally initialize a different volume; the
    // original identity must still be rejected after that wrong marker exists.
    const wrongProof = await initializeNativeMusicVolume(root);
    if (!wrongProof || wrongProof === volumeProof ||
        await verifyNativeMusicVolume(root, volumeProof)) {
        throw new Error("Compiled volume proof accepted replacement storage");
    }
    fs.rmSync(root, { recursive: true });
    fs.renameSync(offline, root);
    if (!await verifyNativeMusicVolume(root, volumeProof) ||
        !fs.readFileSync(local).equals(bytes)) {
        throw new Error("Compiled volume proof did not recover with original media");
    }
    process.stdout.write(
        "Native Downtify compiled-audio (ISRC + stock no-ISRC) and volume-continuity canary passed " +
        "(isolated; no real mount, Downtify server or scanner receipt)\n",
    );
}

// The smoke imports the real production dependency graph, which may open
// Redis/Prisma handles. Terminate this standalone CI-only process explicitly
// after its assertions and cleanup, never hold CI jobs open indefinitely.
// This is not used by the Kima runtime or any live worker.
function cleanupScratch() {
    if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
}
const watchdog = setTimeout(() => {
    process.stderr.write("Native Downtify compiled-audio canary timed out\n");
    try { cleanupScratch(); } catch {}
    process.exit(1);
}, 90000);
main().then(() => {
    clearTimeout(watchdog);
    cleanupScratch();
    process.exit(0);
}, error => {
    clearTimeout(watchdog);
    process.stderr.write("Native Downtify compiled-audio canary failed: " +
        String(error instanceof Error ? error.message : "unknown error") + "\n");
    try { cleanupScratch(); } catch {}
    process.exit(1);
});
