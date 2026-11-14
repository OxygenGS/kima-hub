/** Handoff security and lifecycle tests with an in-memory, deterministic Redis stub. */
jest.mock("../../utils/redis", () => ({
    redisClient: { get: jest.fn(), mget: jest.fn(), set: jest.fn(), eval: jest.fn(), multi: jest.fn() },
}));

import { redisClient } from "../../utils/redis";
import {
    createConnectHandoff, getIncomingConnectHandoff, getOutgoingConnectHandoff,
    transitionConnectHandoff, HandoffBusyError, HandoffUnavailableError, HandoffStateError,
} from "../connectHandoff";

const redis = redisClient as jest.Mocked<typeof redisClient>;
const store = new Map<string, string>();
const A = "aa47d96f-37dd-4fd4-a550-74e10e2f7241";
const B = "bb47d96f-37dd-4fd4-a550-74e10e2f7242";
const C = "cc47d96f-37dd-4fd4-a550-74e10e2f7243";
const NOW = 1_800_000_000_000;
const tracks = ["cml123abc", "cml456def"];
const request = { sourceDeviceId: A, targetDeviceId: B, trackIds: tracks, currentIndex: 1, positionSeconds: 42 };

function online(user: string, id: string, playing = false, lastSeen = NOW) {
    store.set(`connect:device:${user}:${id}`, JSON.stringify({
        id, name: "Kima browser", status: playing ? "playing" : "paused",
        trackTitle: playing ? "Current title" : null, lastSeen,
    }));
}

beforeEach(() => {
    jest.clearAllMocks();
    store.clear();
    (redis.get as jest.Mock).mockImplementation(async (key: string) => store.get(key) ?? null);
    (redis.mget as jest.Mock).mockImplementation(async (...keys: string[]) =>
        keys.map(key => store.get(key) ?? null));
    (redis.set as jest.Mock).mockImplementation(async (key: string, value: string, ...opts: string[]) => {
        if (opts.includes("NX") && store.has(key)) return null;
        store.set(key, value);
        return "OK";
    });
    (redis.eval as jest.Mock).mockImplementation(async (script: string, count: number, key: string, ...argv: string[]) => {
        expect(count).toBe(1);
        if (script.includes("return redis.call('DEL'")) {
            if (store.get(key) !== argv[0]) return 0;
            store.delete(key); return 1;
        }
        if (store.get(key) !== argv[0]) return 0;
        store.set(key, argv[1]); return 1;
    });
    (redis.multi as jest.Mock).mockImplementation(() => {
        const writes: Array<[string, string]> = [];
        const tx = {
            set: (key: string, value: string) => { writes.push([key, value]); return tx; },
            exec: async () => { writes.forEach(([key, value]) => store.set(key, value)); return []; },
        };
        return tx;
    });
    online("alice", A, true);
    online("alice", B);
    online("alice", C);
});

describe("Kima Connect handoff", () => {
    it("keeps offer and device presence scoped to the authenticated account", async () => {
        const created = await createConnectHandoff("alice", request, NOW);
        expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
        const incoming = await getIncomingConnectHandoff("alice", B, NOW);
        expect(incoming).toMatchObject({
            id: created.id, sourceDeviceId: A, targetDeviceId: B,
            trackIds: tracks, currentIndex: 1, positionSeconds: 42, status: "pending",
        });
        expect(await getIncomingConnectHandoff("bob", B, NOW)).toBeNull();
        expect(await getOutgoingConnectHandoff("bob", A, NOW)).toBeNull();
        await expect(transitionConnectHandoff("bob", created.id, B, "started", NOW))
            .rejects.toBeInstanceOf(HandoffUnavailableError);
        expect(store.has(`connect:handoff:offer:alice:${created.id}`)).toBe(true);
    });

    it("rejects offline and paused sources, stale targets, and self-targeting", async () => {
        online("alice", A, false);
        await expect(createConnectHandoff("alice", request, NOW))
            .rejects.toBeInstanceOf(HandoffUnavailableError);
        online("alice", A, true);
        online("alice", B, false, NOW - 46_000);
        await expect(createConnectHandoff("alice", request, NOW))
            .rejects.toBeInstanceOf(HandoffUnavailableError);
        await expect(createConnectHandoff("alice", { ...request, targetDeviceId: A }, NOW))
            .rejects.toBeInstanceOf(HandoffUnavailableError);
    });

    it("allows at most one pending transfer per source and per target", async () => {
        await createConnectHandoff("alice", request, NOW);
        await expect(createConnectHandoff("alice", { ...request, targetDeviceId: C }, NOW))
            .rejects.toBeInstanceOf(HandoffBusyError);
        online("alice", C, true);
        await expect(createConnectHandoff("alice", { ...request, sourceDeviceId: C }, NOW))
            .rejects.toBeInstanceOf(HandoffBusyError);
    });

    it("cannot confirm for another device or cancel an already started transfer", async () => {
        const { id } = await createConnectHandoff("alice", request, NOW);
        await expect(transitionConnectHandoff("alice", id, C, "started", NOW))
            .rejects.toBeInstanceOf(HandoffUnavailableError);
        expect(await transitionConnectHandoff("alice", id, B, "started", NOW)).toBe("started");
        expect((await getOutgoingConnectHandoff("alice", A, NOW))?.status).toBe("started");
        expect(await getIncomingConnectHandoff("alice", B, NOW)).toBeNull();
        await expect(transitionConnectHandoff("alice", id, A, "cancelled", NOW))
            .rejects.toBeInstanceOf(HandoffStateError);
        expect(await transitionConnectHandoff("alice", id, B, "started", NOW)).toBe("started");
        expect(await transitionConnectHandoff("alice", id, A, "observed", NOW)).toBe("observed");
        expect(await getOutgoingConnectHandoff("alice", A, NOW)).toBeNull();
    });

    it("declining an offer clears both pointers and permits the next offer", async () => {
        const { id } = await createConnectHandoff("alice", request, NOW);
        expect(await transitionConnectHandoff("alice", id, B, "declined", NOW)).toBe("declined");
        expect(await getOutgoingConnectHandoff("alice", A, NOW)).toBeNull();
        const second = await createConnectHandoff("alice", request, NOW + 1000);
        expect(second.id).not.toBe(id);
    });

    it("does not let either player confirm an expired request", async () => {
        const { id } = await createConnectHandoff("alice", request, NOW);
        const later = NOW + 120_000;
        expect(await getIncomingConnectHandoff("alice", B, later)).toBeNull();
        await expect(transitionConnectHandoff("alice", id, B, "started", later))
            .rejects.toBeInstanceOf(HandoffUnavailableError);
        expect(await getOutgoingConnectHandoff("alice", A, later)).toBeNull();
    });

    it("rejects invalid queue sizes and prevents source action from replacing current playback", async () => {
        await expect(createConnectHandoff("alice", { ...request, trackIds: [], currentIndex: 0 }, NOW))
            .rejects.toBeInstanceOf(HandoffUnavailableError);
        await expect(createConnectHandoff("alice", { ...request, trackIds: ["x"], currentIndex: 5 }, NOW))
            .rejects.toBeInstanceOf(HandoffUnavailableError);
        expect(store.size).toBe(3); // Nothing queued or written.
    });
});
