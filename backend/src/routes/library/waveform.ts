import { Router } from "express";
import { spawn } from "child_process";
import { prisma } from "../../utils/db";
import { redisClient } from "../../utils/redis";
import { logger } from "../../utils/logger";
import { resolveWithinMusicRoot } from "./trackPath";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of amplitude buckets returned to the client. */
export const PEAK_COUNT = 400;

/**
 * Sample rate for the PCM decode pass.  4 kHz mono is more than enough for
 * waveform visualisation and keeps the data volume small (~1.8 MB for a 1-hour
 * track vs ~34 MB at 44.1 kHz).
 */
const SAMPLE_RATE = 4000;

/**
 * Mini-block size (samples).  We accumulate max-abs over blocks of this size
 * while streaming PCM, then redistribute into PEAK_COUNT buckets at the end.
 * 100 samples @ 4 kHz = 25 ms per mini-block — fine resolution before downsampling.
 */
const MINI_BLOCK = 100;

/** Resource caps prevent malformed audio from exhausting server memory or CPU. */
export const WAVEFORM_FFMPEG_TIMEOUT_MS = 120_000;
const MAX_WAVEFORM_STDERR_CHARS = 4_096;
const MAX_WAVEFORM_MINI_BLOCKS = Math.ceil(24 * 60 * 60 * SAMPLE_RATE / MINI_BLOCK);

/** Redis TTL for cached waveform data (30 days).  Waveform is stable as long
 *  as the file hasn't changed; the cache key embeds the file-modified timestamp
 *  so a re-encoded file automatically busts the entry. */
const CACHE_TTL_S = 30 * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WaveformPayload {
    peaks: number[];
    count: number;
}

// Concurrent requests for the same (trackId, mtime) share one ffmpeg run.

const inFlight = new Map<string, Promise<WaveformPayload>>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function redisCacheKey(trackId: string, mtime: Date): string {
    return `waveform:${trackId}:${mtime.getTime()}`;
}

function inFlightKey(trackId: string, mtime: Date): string {
    return `${trackId}:${mtime.getTime()}`;
}

/**
 * Spawn ffmpeg, decode the audio file to raw 4 kHz mono s16le PCM, and
 * return PEAK_COUNT normalised amplitude values (0.0–1.0, max-abs per bucket).
 *
 * The implementation is streaming: only the per-block maximums (one number per
 * MINI_BLOCK samples) are kept in memory, not the raw PCM.
 */
export function computeWaveformPeaks(filePath: string): Promise<number[]> {
    return new Promise((resolve, reject) => {
        // Only local audio is supported. Do not let playlist/container demuxers
        // follow network protocols from untrusted files in the music library.
        const ff = spawn(process.env.FFMPEG_PATH || "ffmpeg", [
            "-hide_banner",
            "-nostdin",
            "-loglevel", "error",
            "-protocol_whitelist", "file,pipe",
            "-i", filePath,
            "-vn", "-sn", "-dn",
            "-ac", "1",
            "-ar", String(SAMPLE_RATE),
            "-f", "s16le",
            "pipe:1",
        ], { stdio: ["ignore", "pipe", "pipe"] });

        const miniBlocks: number[] = [];
        let carry: number | null = null;
        let blockMax = 0;
        let blockSamples = 0;
        let stderrText = "";
        let settled = false;
        let watchdog: NodeJS.Timeout | undefined;

        const fail = (error: Error, terminate = false) => {
            if (settled) return;
            settled = true;
            if (watchdog) clearTimeout(watchdog);
            if (terminate) {
                try { ff.kill("SIGKILL"); } catch { /* process may have exited */ }
            }
            reject(error);
        };

        const appendBlock = () => {
            if (miniBlocks.length >= MAX_WAVEFORM_MINI_BLOCKS) {
                fail(new Error("ffmpeg waveform exceeds 24 hours of decoded audio"), true);
                return;
            }
            miniBlocks.push(blockMax);
            blockMax = 0;
            blockSamples = 0;
        };

        const processSample = (sample: number) => {
            blockMax = Math.max(blockMax, Math.abs(sample));
            blockSamples++;
            if (blockSamples >= MINI_BLOCK) appendBlock();
        };

        ff.stdout.on("data", (chunk: Buffer) => {
            if (settled) return;
            let start = 0;

            // Preserve odd-byte chunk boundaries so PCM samples stay aligned.
            if (carry !== null) {
                if (chunk.length === 0) return;
                const sample = Buffer.from([carry, chunk[0]]).readInt16LE(0);
                carry = null;
                processSample(sample);
                if (settled) return;
                start = 1;
            }

            const fullSamples = Math.floor((chunk.length - start) / 2);
            for (let i = 0; i < fullSamples; i++) {
                processSample(chunk.readInt16LE(start + i * 2));
                if (settled) return;
            }

            const consumed = start + fullSamples * 2;
            if (consumed < chunk.length) carry = chunk[consumed];
        });

        // Avoid unbounded memory growth on malformed files that produce huge stderr.
        ff.stderr.on("data", (data: Buffer) => {
            const remaining = MAX_WAVEFORM_STDERR_CHARS - stderrText.length;
            if (remaining > 0) stderrText += data.toString("utf8").slice(0, remaining);
        });

        ff.on("close", (code) => {
            if (settled) return;
            if (blockSamples > 0) appendBlock();
            if (settled) return;
            // Never cache a partial waveform when FFmpeg failed after outputting PCM.
            if (code !== 0) {
                fail(new Error(`ffmpeg exited ${code}: ${stderrText.slice(0, 300)}`));
                return;
            }

            const K = miniBlocks.length;
            if (K === 0) {
                settled = true;
                if (watchdog) clearTimeout(watchdog);
                resolve(new Array(PEAK_COUNT).fill(0));
                return;
            }

            let globalMax = 0;
            for (const v of miniBlocks) {
                if (v > globalMax) globalMax = v;
            }
            if (globalMax === 0) globalMax = 1;

            const peaks: number[] = new Array(PEAK_COUNT).fill(0);
            for (let p = 0; p < PEAK_COUNT; p++) {
                const lo = Math.floor((p * K) / PEAK_COUNT);
                const hi = Math.ceil(((p + 1) * K) / PEAK_COUNT);
                let bucketMax = 0;
                for (let b = lo; b < hi && b < K; b++) {
                    if (miniBlocks[b] > bucketMax) bucketMax = miniBlocks[b];
                }
                peaks[p] = Math.round((bucketMax / globalMax) * 10000) / 10000;
            }

            settled = true;
            if (watchdog) clearTimeout(watchdog);
            resolve(peaks);
        });

        ff.on("error", (error) => fail(error));
        watchdog = setTimeout(() => {
            fail(new Error("ffmpeg waveform timed out after 120000ms"), true);
        }, WAVEFORM_FFMPEG_TIMEOUT_MS);
        watchdog.unref();
    });
}

/**
 * Return cached peaks if available, otherwise compute and cache them.
 * Concurrent requests for the same track share a single computation via the
 * in-flight map.
 */
async function getOrComputeWaveform(
    trackId: string,
    absoluteFilePath: string,
    fileModified: Date,
): Promise<WaveformPayload> {
    const redisKey = redisCacheKey(trackId, fileModified);
    const flyKey = inFlightKey(trackId, fileModified);

    // 1. Redis cache hit — fast path.
    try {
        const cached = await redisClient.get(redisKey);
        if (cached) {
            logger.debug(`[WAVEFORM] Cache HIT for track ${trackId}`);
            return JSON.parse(cached) as WaveformPayload;
        }
    } catch (err) {
        logger.warn("[WAVEFORM] Redis read error (proceeding without cache):", err);
    }

    // 2. Join an already-running computation for the same (trackId, mtime).
    const existing = inFlight.get(flyKey);
    if (existing) {
        logger.debug(`[WAVEFORM] Joining in-flight computation for ${flyKey}`);
        return existing;
    }

    // 3. Start a new computation.
    const computation = (async (): Promise<WaveformPayload> => {
        try {
            logger.debug(
                `[WAVEFORM] Computing peaks for track ${trackId} (${absoluteFilePath})`,
            );
            const peaks = await computeWaveformPeaks(absoluteFilePath);
            const payload: WaveformPayload = { peaks, count: peaks.length };

            try {
                await redisClient.setex(redisKey, CACHE_TTL_S, JSON.stringify(payload));
                logger.debug(
                    `[WAVEFORM] Cached ${peaks.length} peaks for track ${trackId}`,
                );
            } catch (err) {
                logger.warn("[WAVEFORM] Redis write error (result still served):", err);
            }

            return payload;
        } finally {
            inFlight.delete(flyKey);
        }
    })();

    inFlight.set(flyKey, computation);
    return computation;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

const router = Router();

/**
 * GET /api/library/tracks/:id/waveform -> { peaks, count }: PEAK_COUNT (400)
 * amplitudes from 0 to 1, start to end. Auth is applied by the library index.
 */
router.get("/tracks/:id/waveform", async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const track = await prisma.track.findUnique({
            where: { id: req.params.id },
            select: { id: true, filePath: true, fileModified: true },
        });

        if (!track) {
            return res.status(404).json({ error: "Track not found" });
        }

        if (!track.filePath || !track.fileModified) {
            return res.status(404).json({ error: "Track audio file unavailable" });
        }

        const absolutePath = resolveWithinMusicRoot(track.filePath);
        if (!absolutePath) {
            logger.warn(`[WAVEFORM] Rejected out-of-root path for track ${track.id}`);
            return res.status(404).json({ error: "Track audio file unavailable" });
        }

        const payload = await getOrComputeWaveform(
            track.id,
            absolutePath,
            track.fileModified,
        );

        // Allow clients and CDNs to cache the response for a day; the
        // server-side Redis entry stays warm for 30 days.
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.json(payload);
    } catch (error) {
        logger.error("[WAVEFORM] Unhandled error:", error);
        return res.status(500).json({ error: "Failed to compute waveform" });
    }
});

export default router;
