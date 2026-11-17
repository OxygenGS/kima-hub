jest.mock("../../utils/db", () => ({
    prisma: {
        track: { findFirst: jest.fn() },
        novaFlowFeedback: { upsert: jest.fn(), deleteMany: jest.fn() },
    },
}));

import { prisma } from "../../utils/db";
import { clearNovaFlowFeedback, setNovaFlowFeedback } from "../novaFlowFeedback";

const db = prisma as unknown as {
    track: { findFirst: jest.Mock };
    novaFlowFeedback: { upsert: jest.Mock; deleteMany: jest.Mock };
};

beforeEach(() => {
    jest.clearAllMocks();
    db.track.findFirst.mockResolvedValue({ id: "track-1" });
    db.novaFlowFeedback.upsert.mockResolvedValue({ value: 1 });
    db.novaFlowFeedback.deleteMany.mockResolvedValue({ count: 1 });
});

describe("NOVA Music DNA feedback persistence", () => {
    it("requires a real available local track and writes only for the authenticated account", async () => {
        const result = await setNovaFlowFeedback("alice", "track-1", "more");
        expect(result).toBe("more");
        expect(db.track.findFirst).toHaveBeenCalledWith({
            where: expect.objectContaining({
                id: "track-1", missingSince: null, corrupt: false,
                album: expect.objectContaining({ location: "LIBRARY" }),
            }),
            select: { id: true },
        });
        expect(db.novaFlowFeedback.upsert).toHaveBeenCalledWith({
            where: { userId_trackId: { userId: "alice", trackId: "track-1" } },
            create: { userId: "alice", trackId: "track-1", value: 1 },
            update: { value: 1 },
            select: { value: true },
        });
    });

    it("stores a negative signal separately from global Favorites", async () => {
        db.novaFlowFeedback.upsert.mockResolvedValue({ value: -1 });
        expect(await setNovaFlowFeedback("bob", "track-1", "less")).toBe("less");
        expect(db.novaFlowFeedback.upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: { userId_trackId: { userId: "bob", trackId: "track-1" } },
            update: { value: -1 },
        }));
    });

    it("does not write feedback for missing, corrupt or external catalog tracks", async () => {
        db.track.findFirst.mockResolvedValue(null);
        expect(await setNovaFlowFeedback("alice", "missing", "more")).toBeNull();
        expect(db.novaFlowFeedback.upsert).not.toHaveBeenCalled();
    });

    it("undoes only the signed-in account's signal without editing any tracks", async () => {
        await clearNovaFlowFeedback("alice", "track-1");
        expect(db.novaFlowFeedback.deleteMany).toHaveBeenCalledWith({
            where: { userId: "alice", trackId: "track-1" },
        });
        expect(db.track.findFirst).not.toHaveBeenCalled();
    });

    it("is safe to repeat an undo for an already absent signal", async () => {
        db.novaFlowFeedback.deleteMany.mockResolvedValue({ count: 0 });
        await expect(clearNovaFlowFeedback("alice", "track-1")).resolves.toBeUndefined();
    });
});
