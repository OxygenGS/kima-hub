/**
 * On-demand resized local covers without blocking the Node.js event loop.
 *
 * Identical concurrent requests share one resize. Different requests have a
 * small global concurrency limit to avoid overwhelming memory/Sharp while
 * other API requests and music playback are active.
 *
 * Call only with a canonical regular cover path from getLocalImagePathAsync.
 */
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { resizeImageBuffer } from "./imageStorage";

const MAX_ACTIVE_NATIVE_RESIZES = 3;
const inFlight = new Map<string, Promise<string>>();
let activeResizes = 0;
const waiting: Array<() => void> = [];

async function reserveResizeSlot(): Promise<void> {
    if (activeResizes < MAX_ACTIVE_NATIVE_RESIZES && waiting.length === 0) {
        activeResizes++;
        return;
    }
    await new Promise<void>((resolve) => waiting.push(resolve));
    // The previous owner transfers its reserved slot to us.
}

function releaseResizeSlot(): void {
    const next = waiting.shift();
    if (next) next();
    else activeResizes--;
}

async function withResizeSlot(work: () => Promise<string>): Promise<string> {
    await reserveResizeSlot();
    try {
        return await work();
    } finally {
        releaseResizeSlot();
    }
}

async function isRegularCachedFile(filePath: string): Promise<boolean> {
    try {
        const stat = await fs.promises.lstat(filePath);
        // A symlink is never an acceptable cache hit, even if it resolves to
        // an otherwise readable file.
        return stat.isFile() && stat.size > 0;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
    }
}

/**
 * Returns the path to a completed JPEG variant.
 * A unique temporary file and atomic rename prevent partial cache files from
 * being served when several clients request the same cover simultaneously.
 */
export async function getOrCreateNativeCoverVariant(
    canonicalOriginalPath: string,
    width: number,
): Promise<string> {
    if (!Number.isInteger(width) || width < 16 || width > 2048) {
        throw new RangeError("Invalid native cover width");
    }

    const parsed = path.parse(canonicalOriginalPath);
    const target = path.join(parsed.dir, `${parsed.name}_w${width}.jpg`);
    const existing = inFlight.get(target);
    if (existing) return existing;

    const task = (async () => {
        if (await isRegularCachedFile(target)) return target;

        return withResizeSlot(async () => {
            // Another request may have completed while we were waiting.
            if (await isRegularCachedFile(target)) return target;
            const original = await fs.promises.readFile(canonicalOriginalPath);
            const resized = await resizeImageBuffer(original, width);
            const temporary = path.join(parsed.dir, `.${parsed.name}_w${width}.${randomUUID()}.tmp`);
            try {
                await fs.promises.writeFile(temporary, resized, { flag: "wx" });
                await fs.promises.rename(temporary, target);
            } finally {
                await fs.promises.rm(temporary, { force: true });
            }
            return target;
        });
    })();
    inFlight.set(target, task);
    try {
        return await task;
    } finally {
        if (inFlight.get(target) === task) inFlight.delete(target);
    }
}
