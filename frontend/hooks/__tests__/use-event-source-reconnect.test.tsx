import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    isAuthenticated: true,
    getSSETicket: vi.fn(),
    getDiscoverBatchStatus: vi.fn(),
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
}));
vi.mock("@/lib/auth-context", () => ({
    useAuth: () => ({ isAuthenticated: mocks.isAuthenticated }),
}));
vi.mock("@tanstack/react-query", () => ({
    useQueryClient: () => ({
        invalidateQueries: mocks.invalidateQueries,
        setQueryData: mocks.setQueryData,
    }),
}));
vi.mock("@/lib/api", () => ({
    api: {
        getSSETicket: mocks.getSSETicket,
        getDiscoverBatchStatus: mocks.getDiscoverBatchStatus,
    },
    getApiBaseUrl: () => "",
}));

import { useEventSource } from "../useEventSource";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class FakeSource {
    static instances: FakeSource[] = [];
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    closed = false;
    constructor(public url: string) {
        FakeSource.instances.push(this);
    }
    close() { this.closed = true; }
    emit(type: string, data: Record<string, unknown> = {}) {
        this.onmessage?.({ data: JSON.stringify({ type, ...data }) } as MessageEvent);
    }
}

let root: Root;
let host: HTMLDivElement;

function Probe() {
    useEventSource();
    return null;
}

async function mount() {
    await act(async () => {
        root.render(<Probe />);
        await Promise.resolve();
    });
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.isAuthenticated = true;
    mocks.getSSETicket.mockResolvedValue("short-lived-test-ticket");
    mocks.getDiscoverBatchStatus.mockResolvedValue({ active: false, status: null });
    FakeSource.instances = [];
    vi.stubGlobal("EventSource", FakeSource);
    host = document.createElement("div");
    root = createRoot(host);
});
afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe("live event connection recovery", () => {
    it("retries a rejected ticket request rather than disconnecting forever", async () => {
        mocks.getSSETicket
            .mockRejectedValueOnce(new Error("network handoff"))
            .mockResolvedValueOnce("second-ticket");
        await mount();
        expect(mocks.getSSETicket).toHaveBeenCalledTimes(1);
        expect(FakeSource.instances).toHaveLength(0);
        await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
        expect(mocks.getSSETicket).toHaveBeenCalledTimes(2);
        expect(FakeSource.instances).toHaveLength(1);
        expect(FakeSource.instances[0].url).toContain("second-ticket");
    });

    it("refreshes album ownership and library state after reconnection", async () => {
        await mount();
        expect(FakeSource.instances).toHaveLength(1);
        const original = FakeSource.instances[0];
        await act(async () => { original.emit("connected"); });
        expect(mocks.invalidateQueries).not.toHaveBeenCalled();
        await act(async () => { original.onerror?.(); });
        expect(original.closed).toBe(true);
        await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
        expect(FakeSource.instances).toHaveLength(2);
        await act(async () => { FakeSource.instances[1].emit("connected"); });
        const keys = mocks.invalidateQueries.mock.calls.map(([q]) => q.queryKey[0]);
        expect(keys).toContain("album");
        expect(keys).toContain("artist");
        expect(keys).toContain("library");
        expect(keys).toContain("playlists");
        expect(keys).toContain("scan-status");
        expect(keys).toContain("active-downloads");
    });

    it("keeps a running batch when a status request fails", async () => {
        mocks.getDiscoverBatchStatus.mockRejectedValueOnce(new Error("offline"));
        await mount();
        await act(async () => { FakeSource.instances[0].emit("connected"); await Promise.resolve(); });
        expect(mocks.setQueryData).not.toHaveBeenCalledWith(
            ["discover-batch-status"], { active: false, status: null, batchId: null }
        );
    });

    it("refreshes tracks and search when a new music scan finishes", async () => {
        await mount();
        await act(async () => {
            FakeSource.instances[0].emit("scan:complete", { jobId: "scan-1", result: { tracksAdded: 1 } });
        });
        const keys = mocks.invalidateQueries.mock.calls.map(([q]) => q.queryKey.join("/"));
        expect(keys).toContain("album");
        expect(keys).toContain("artist");
        expect(keys).toContain("library/tracks");
        expect(keys).toContain("search");
    });

    it("does not claim new tracks when the scan failed", async () => {
        await mount();
        await act(async () => {
            FakeSource.instances[0].emit("scan:complete", { jobId: "scan-2", error: "unavailable" });
        });
        const keys = mocks.invalidateQueries.mock.calls.map(([q]) => q.queryKey.join("/"));
        expect(keys).not.toContain("search");
        expect(keys).not.toContain("album");
    });

    it("closes the old stream and never retries after sign-out", async () => {
        await mount();
        const stream = FakeSource.instances[0];
        mocks.isAuthenticated = false;
        await act(async () => root.render(<Probe />));
        expect(stream.closed).toBe(true);
        await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
        expect(FakeSource.instances).toHaveLength(1);
    });
});
