import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEventSource } from "@/hooks/useEventSource";

const fake = vi.hoisted(() => ({
    user: { id: "alice" } as { id: string } | null,
    authenticated: true,
    ticket: vi.fn(),
    getBatch: vi.fn(),
    invalidate: vi.fn(),
    setQueryData: vi.fn(),
    queryClient: null as unknown,
}));

fake.queryClient = { invalidateQueries: fake.invalidate, setQueryData: fake.setQueryData };

vi.mock("@/lib/auth-context", () => ({
    useAuth: () => ({ isAuthenticated: fake.authenticated, user: fake.user }),
}));
vi.mock("@tanstack/react-query", () => ({
    useQueryClient: () => fake.queryClient,
}));
vi.mock("@/lib/api", () => ({
    getApiBaseUrl: () => "",
    api: { getSSETicket: fake.ticket, getDiscoverBatchStatus: fake.getBatch },
}));
vi.mock("@/lib/search-result-store", () => ({
    searchResultStore: { push: vi.fn(), complete: vi.fn() },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class FakeEventSource {
    static instances: FakeEventSource[] = [];
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    closed = false;
    readonly url: string;

    constructor(url: string) {
        this.url = url;
        FakeEventSource.instances.push(this);
    }

    emit(data: unknown) {
        this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
    }

    close() {
        this.closed = true;
    }
}

function Subscriber() {
    useEventSource();
    return null;
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
    vi.clearAllMocks();
    fake.user = { id: "alice" };
    fake.authenticated = true;
    fake.ticket.mockResolvedValue("ticket-alice");
    fake.getBatch.mockResolvedValue({ active: false });
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
});

async function renderSubscriber() {
    await act(async () => {
        root.render(<Subscriber />);
        await Promise.resolve();
        await Promise.resolve();
    });
}

describe("Connect wake over the existing authenticated event stream", () => {
    it("forwards a target device hint, never a command payload", async () => {
        await renderSubscriber();
        expect(FakeEventSource.instances).toHaveLength(1);
        const wake = vi.fn();
        window.addEventListener("kima-connect-command-wake", wake);
        try {
            await act(async () => {
                FakeEventSource.instances[0].emit({
                    type: "connect:command-wake", deviceId: "target-device",
                    ignoredCommandPayload: { type: "pause" },
                });
            });
            expect(wake).toHaveBeenCalledOnce();
            expect((wake.mock.calls[0][0] as CustomEvent).detail).toEqual({
                deviceId: "target-device",
            });
            await act(async () => {
                FakeEventSource.instances[0].emit({
                    type: "connect:command-wake", deviceId: null,
                });
            });
            expect(wake).toHaveBeenCalledOnce();
        } finally {
            window.removeEventListener("kima-connect-command-wake", wake);
        }
    });

    it("closes the old account's stream and ignores late wake events after switching users", async () => {
        await renderSubscriber();
        const alice = FakeEventSource.instances[0];
        const wake = vi.fn();
        window.addEventListener("kima-connect-command-wake", wake);
        try {
            fake.user = { id: "bob" };
            fake.ticket.mockResolvedValue("ticket-bob");
            await renderSubscriber();
            expect(alice.closed).toBe(true);
            expect(FakeEventSource.instances).toHaveLength(2);
            expect(FakeEventSource.instances[1].url).toContain("ticket-bob");

            alice.emit({ type: "connect:command-wake", deviceId: "alice-player" });
            expect(wake).not.toHaveBeenCalled();
            FakeEventSource.instances[1].emit({
                type: "connect:command-wake", deviceId: "bob-player",
            });
            expect(wake).toHaveBeenCalledOnce();
            expect((wake.mock.calls[0][0] as CustomEvent).detail.deviceId).toBe("bob-player");
        } finally {
            window.removeEventListener("kima-connect-command-wake", wake);
        }
    });
});
