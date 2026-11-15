/** Regression coverage: owner isolation, bounded device records, one-time command delivery. */
jest.mock("../../utils/redis", () => ({
    redisClient: {
        zremrangebyscore: jest.fn(),
        zscore: jest.fn(),
        zcard: jest.fn(),
        zrangebyscore: jest.fn(),
        mget: jest.fn(),
        exists: jest.fn(),
        set: jest.fn(),
        getdel: jest.fn(),
        get: jest.fn(),
        eval: jest.fn(),
        multi: jest.fn(),
    },
}));

import { redisClient } from "../../utils/redis";
import {
    ConnectDeviceLimitError, heartbeatConnectDevice, listConnectDevices, sendConnectCommand,
    getConnectCommandReceipt, acknowledgeConnectCommand,
} from "../connectDevices";

const redis = redisClient as jest.Mocked<typeof redisClient>;
const idA = "aa47d96f-37dd-4fd4-a550-74e10e2f7241";
const idB = "bb47d96f-37dd-4fd4-a550-74e10e2f7242";
const NOW = 1_800_000_000_000;
const make = (id: string) => ({ id, name: "Desktop", status: "playing" as const, trackTitle: "A song" });

beforeEach(() => {
    jest.clearAllMocks();
    const pipeline = { zadd: jest.fn(), expire: jest.fn(), set: jest.fn(), exec: jest.fn().mockResolvedValue([]) };
    pipeline.zadd.mockReturnValue(pipeline);
    pipeline.expire.mockReturnValue(pipeline);
    pipeline.set.mockReturnValue(pipeline);
    redis.multi.mockReturnValue(pipeline as unknown as ReturnType<typeof redisClient.multi>);
    (redis.zscore as jest.Mock).mockResolvedValue(null);
    (redis.zcard as jest.Mock).mockResolvedValue(0);
    (redis.zrangebyscore as jest.Mock).mockResolvedValue([]);
    (redis.mget as jest.Mock).mockResolvedValue([]);
    (redis.exists as jest.Mock).mockResolvedValue(1);
    (redis.getdel as jest.Mock).mockResolvedValue(null);
    (redis.set as jest.Mock).mockResolvedValue("OK");
    (redis.get as jest.Mock).mockResolvedValue(null);
    (redis.eval as jest.Mock).mockResolvedValue(1);
});

describe("Kima Connect Redis device scope", () => {
    it("keeps every device lookup scoped to authenticated user ID", async () => {
        await listConnectDevices("alice", NOW);
        await listConnectDevices("bob", NOW);
        expect(redis.zrangebyscore).toHaveBeenNthCalledWith(1, "connect:devices:alice", NOW - 44_999, "+inf");
        expect(redis.zrangebyscore).toHaveBeenNthCalledWith(2, "connect:devices:bob", NOW - 44_999, "+inf");
    });

    it("returns only live devices and drops missing, corrupt or stale entries", async () => {
        (redis.zrangebyscore as jest.Mock).mockResolvedValue([idA, idB]);
        (redis.mget as jest.Mock).mockResolvedValue([
            JSON.stringify({ ...make(idA), lastSeen: NOW - 5000 }),
            JSON.stringify({ ...make(idB), lastSeen: NOW - 60_000 }),
        ]);
        expect(await listConnectDevices("alice", NOW)).toEqual([{ ...make(idA), lastSeen: NOW - 5000 }]);
        expect(redis.mget).toHaveBeenCalledWith("connect:device:alice:" + idA, "connect:device:alice:" + idB);
    });

    it("cannot register more than 12 simultaneous tabs per user", async () => {
        (redis.zcard as jest.Mock).mockResolvedValue(12);
        await expect(heartbeatConnectDevice("alice", make(idA), NOW)).rejects.toBeInstanceOf(ConnectDeviceLimitError);
        expect(redis.multi).not.toHaveBeenCalled();
    });

    it("stores a bounded heartbeat and delivers each queued command once", async () => {
        (redis.getdel as jest.Mock).mockResolvedValueOnce(JSON.stringify({ id: "command-1", type: "pause", createdAt: NOW }));
        const one = await heartbeatConnectDevice("alice", make(idA), NOW);
        const two = await heartbeatConnectDevice("alice", make(idA), NOW + 100);
        expect(one.command?.type).toBe("pause");
        expect(two.command).toBeNull();
        expect(redis.zremrangebyscore).toHaveBeenCalledWith("connect:devices:alice", "-inf", NOW - 45_000);
        expect(redis.getdel).toHaveBeenCalledWith("connect:command:alice:" + idA);
    });

    it("drops instructions expired before the heartbeat arrives", async () => {
        (redis.getdel as jest.Mock).mockResolvedValue(JSON.stringify({ id: "old", type: "next", createdAt: NOW - 21_000 }));
        expect((await heartbeatConnectDevice("alice", make(idA), NOW)).command).toBeNull();
    });

    it("cannot send to a missing or expired player or a different account", async () => {
        (redis.zscore as jest.Mock).mockResolvedValueOnce(null).mockResolvedValueOnce(String(NOW - 60_000));
        expect(await sendConnectCommand("bob", idA, "next", NOW)).toBeNull();
        expect(await sendConnectCommand("alice", idA, "next", NOW)).toBeNull();
        expect(redis.multi).not.toHaveBeenCalled();
    });

    it("returns account-scoped command receipts and derives expiry from server time", async () => {
        const receipt = { id: "cmd-test", deviceId: idB, type: "next", createdAt: NOW, status: "queued" };
        (redis.get as jest.Mock).mockImplementation(async (key: string) =>
            key === "connect:receipt:alice:cmd-test" ? JSON.stringify(receipt) : null);

        expect((await getConnectCommandReceipt("alice", "cmd-test", NOW + 19_999))?.status).toBe("queued");
        expect((await getConnectCommandReceipt("alice", "cmd-test", NOW + 20_000))?.status).toBe("expired");
        expect(await getConnectCommandReceipt("bob", "cmd-test", NOW)).toBeNull();
        expect(await getConnectCommandReceipt("alice", "no-such-command", NOW)).toBeNull();
    });

    it("accepts a verified target report at most once with atomic CAS", async () => {
        const receipt = { id: "cmd-test", deviceId: idB, type: "pause", createdAt: NOW, status: "queued" };
        (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(receipt));
        const result = await acknowledgeConnectCommand("alice", receipt.id, idB, "handled", NOW + 1000);
        expect(result).toMatchObject({ status: "handled", reportedAt: NOW + 1000 });
        expect(redis.eval).toHaveBeenCalledWith(
            expect.stringContaining("KEEPTTL"),
            1,
            "connect:receipt:alice:cmd-test",
            JSON.stringify(receipt),
            expect.stringContaining('"status":"handled"'),
        );

        (redis.get as jest.Mock).mockResolvedValue(JSON.stringify({ ...receipt, status: "handled" }));
        expect((await acknowledgeConnectCommand("alice", receipt.id, idB, "handled", NOW + 2000))?.status)
            .toBe("handled");
        expect(await acknowledgeConnectCommand("alice", receipt.id, idB, "ignored", NOW + 2000))
            .toBeNull();
        expect(redis.eval).toHaveBeenCalledTimes(1);
    });

    it("rejects receipts for another device, another account or an expired command", async () => {
        const receipt = { id: "cmd-test", deviceId: idB, type: "next", createdAt: NOW, status: "queued" };
        (redis.get as jest.Mock).mockImplementation(async (key: string) =>
            key === "connect:receipt:alice:cmd-test" ? JSON.stringify(receipt) : null);
        expect(await acknowledgeConnectCommand("bob", receipt.id, idB, "handled", NOW + 1)).toBeNull();
        expect(await acknowledgeConnectCommand("alice", receipt.id, idA, "handled", NOW + 1)).toBeNull();
        expect(await acknowledgeConnectCommand("alice", receipt.id, idB, "handled", NOW + 20_000)).toBeNull();
        expect(redis.eval).not.toHaveBeenCalled();
    });

    it("does not overwrite a concurrent command result with a conflicting acknowledgement", async () => {
        const receipt = { id: "cmd-test", deviceId: idB, type: "next", createdAt: NOW, status: "queued" };
        (redis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(receipt))
            .mockResolvedValueOnce(JSON.stringify({ ...receipt, status: "ignored" }));
        (redis.eval as jest.Mock).mockResolvedValueOnce(0);
        expect(await acknowledgeConnectCommand("alice", receipt.id, idB, "handled", NOW + 1)).toBeNull();
    });

    it("writes only a single short-lived pending instruction for a verified target", async () => {
        (redis.zscore as jest.Mock).mockResolvedValue(String(NOW - 1000));
        const sent = await sendConnectCommand("alice", idB, "previous", NOW);
        expect(sent?.type).toBe("previous");
        expect(sent?.id).toEqual(expect.any(String));
        const pipeline = (redis.multi as jest.Mock).mock.results.at(-1)?.value;
        expect(pipeline.set).toHaveBeenCalledWith(
            "connect:receipt:alice:" + sent!.id,
            expect.stringContaining('"status":"queued"'),
            "EX",
            90,
        );
        expect(pipeline.set).toHaveBeenCalledWith(
            "connect:command:alice:" + idB,
            expect.stringContaining('"type":"previous"'),
            "EX",
            20,
        );
    });
});
