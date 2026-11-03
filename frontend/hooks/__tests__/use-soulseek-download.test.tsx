import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SoulseekResult } from "@/features/search/types";

const mocks = vi.hoisted(() => ({
    getSlskdStatus: vi.fn(),
    searchSoulseek: vi.fn(),
    downloadFromSoulseek: vi.fn(),
    invalidateQueries: vi.fn(),
    error: vi.fn(),
    openPanel: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
    useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock("@/lib/api", () => ({
    api: {
        getSlskdStatus: mocks.getSlskdStatus,
        searchSoulseek: mocks.searchSoulseek,
        downloadFromSoulseek: mocks.downloadFromSoulseek,
    },
}));
vi.mock("@/lib/notify", () => ({ notify: { error: mocks.error } }));
vi.mock("@/hooks/useActivityPanel", () => ({ openActivityPanel: mocks.openPanel }));

import { useSoulseekSearch } from "@/features/search/hooks/useSoulseekSearch";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const hit: SoulseekResult = {
    username: "peer", path: "Artist/Album/Song.flac", filename: "Song.flac",
    size: 15000, bitrate: 320, format: "flac",
};
let host: HTMLDivElement;
let root: Root;
let latest: ReturnType<typeof useSoulseekSearch>;

function Probe() {
    const value = useSoulseekSearch({ query: "" });
    useEffect(() => {
        latest = value;
    }, [value]);
    return null;
}

beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.getSlskdStatus.mockResolvedValue({ enabled: false });
    mocks.downloadFromSoulseek.mockResolvedValue({ success: true });
    host = document.createElement("div");
    root = createRoot(host);
    await act(async () => { root.render(<Probe />); await Promise.resolve(); });
});
afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
});

describe("Soulseek repeated-click protection", () => {
    it("only starts one network job for a rapid double click", async () => {
        await act(async () => {
            await Promise.all([latest.handleDownload(hit), latest.handleDownload(hit)]);
        });
        expect(mocks.downloadFromSoulseek).toHaveBeenCalledTimes(1);
        expect(latest.downloadingFiles.size).toBe(1);
        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        expect(latest.downloadingFiles.size).toBe(0);
        await act(async () => { await latest.handleDownload(hit); });
        expect(mocks.downloadFromSoulseek).toHaveBeenCalledTimes(2);
    });

    it("releases the guard immediately on a failed request", async () => {
        mocks.downloadFromSoulseek.mockRejectedValueOnce(new Error("offline"));
        await act(async () => { await latest.handleDownload(hit); });
        expect(mocks.error).toHaveBeenCalledTimes(1);
        expect(latest.downloadingFiles.size).toBe(0);
        await act(async () => { await latest.handleDownload(hit); });
        expect(mocks.downloadFromSoulseek).toHaveBeenCalledTimes(2);
    });

    it("does not submit duplicate files in a bulk selection", async () => {
        await act(async () => { await latest.handleBulkDownload([hit, hit, hit]); });
        expect(mocks.downloadFromSoulseek).toHaveBeenCalledTimes(1);
    });
});
