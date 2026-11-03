import { afterEach, describe, expect, it, vi } from "vitest";
import { searchResultStore } from "../search-result-store";
import type { SoulseekResult } from "@/features/search/types";

const ids: string[] = [];
const id = (name: string) => {
    const value = `quality-pass-${name}-${ids.length}`;
    ids.push(value);
    return value;
};
const hit = (path: string, username = "peer"): SoulseekResult => ({
    username, path, filename: path.split("/").pop()!, size: 100, bitrate: 320, format: "flac",
});

afterEach(() => {
    for (const key of ids.splice(0)) searchResultStore.clear(key);
});

describe("bounded Soulseek SSE results", () => {
    it("remembers completion even when it arrives before the first result", () => {
        const key = id("early");
        const changed = vi.fn();
        searchResultStore.subscribe(key, changed);
        searchResultStore.complete(key);
        expect(searchResultStore.getSession(key)).toMatchObject({ complete: true, results: [] });
        searchResultStore.push(key, [hit("Artist/A.flac")]);
        expect(searchResultStore.getSession(key)?.complete).toBe(true);
        expect(changed).toHaveBeenCalledTimes(2);
    });

    it("deduplicates repeated peer files and caps memory at 200 items", () => {
        const key = id("cap");
        const batch = Array.from({ length: 260 }, (_, n) => hit(`Album/${n}.flac`));
        searchResultStore.push(key, batch.slice(0, 150));
        searchResultStore.push(key, [hit("Album/0.flac"), ...batch.slice(150)]);
        expect(searchResultStore.getSession(key)?.results).toHaveLength(200);
        expect(searchResultStore.getSession(key)?.results[199].filename).toBe("199.flac");
    });

    it("discards late packets for a cancelled search", () => {
        const key = id("cancel");
        searchResultStore.push(key, [hit("Album/first.flac")]);
        searchResultStore.clear(key);
        searchResultStore.push(key, [hit("Album/late.flac")]);
        searchResultStore.complete(key);
        expect(searchResultStore.getSession(key)).toBeUndefined();
    });

    it("evicts oldest sessions rather than growing indefinitely", () => {
        const values = Array.from({ length: 52 }, (_, n) => id(`bounded-${n}`));
        for (const key of values) searchResultStore.complete(key);
        expect(searchResultStore.getSession(values[0])).toBeUndefined();
        expect(searchResultStore.getSession(values.at(-1)!)).toMatchObject({ complete: true });
    });
});
