import { describe, expect, it } from "vitest";
import {
    remainingDiscoverStartGrace,
    shouldReloadDiscoverAfterBatch,
} from "../discover-batch-state";

describe("Discover Weekly status transitions", () => {
    it("only refreshes the playlist when an active batch becomes inactive", () => {
        expect(shouldReloadDiscoverAfterBatch(false, false)).toBe(false);
        expect(shouldReloadDiscoverAfterBatch(false, true)).toBe(false);
        expect(shouldReloadDiscoverAfterBatch(true, true)).toBe(false);
        expect(shouldReloadDiscoverAfterBatch(true, false)).toBe(true);
    });

    it("keeps optimistic generation during the existing five-second grace", () => {
        expect(remainingDiscoverStartGrace(1000, 1000)).toBe(5000);
        expect(remainingDiscoverStartGrace(1000, 4200)).toBe(1800);
        expect(remainingDiscoverStartGrace(1000, 6000)).toBe(0);
        expect(remainingDiscoverStartGrace(null, 6000)).toBe(0);
    });
});
