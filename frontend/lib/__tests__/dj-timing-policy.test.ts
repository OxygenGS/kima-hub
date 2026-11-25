import { describe, expect, it } from "vitest";
import { guidedStart, isMusicStream, readDjTiming } from "../dj-timing-policy";

const pair = { outgoingId: "one", incomingId: "two", targetSeconds: 6 };
const timing = { overlapMs: 6120, incomingFirstBeatMs: 370, outgoingBeatBeforeEndMs: 5750, matchedBeats: 11, maxDriftMs: 8 };
const response = { ...pair, timing };
describe("beat-guided timing policy", () => {
    it("binds advice to the exact ordered pair and target", () => {
        expect(readDjTiming(response, pair)).toEqual(timing);
        expect(readDjTiming({ ...response, outgoingId: "other" }, pair)).toBeNull();
        expect(readDjTiming({ ...response, incomingId: "other" }, pair)).toBeNull();
        expect(readDjTiming({ ...response, targetSeconds: 4 }, pair)).toBeNull();
        expect(readDjTiming({ ...response, timing: null }, pair)).toBeNull();
    });
    it("rejects impossible phase, drift, range and nonfinite values", () => {
        for (const patch of [
            { overlapMs: 9000 }, { overlapMs: 6121 }, { incomingFirstBeatMs: -1 },
            { outgoingBeatBeforeEndMs: 0 }, { matchedBeats: 2 }, { maxDriftMs: 81 },
            { maxDriftMs: NaN }, { overlapMs: "6120" },
        ]) expect(readDjTiming({ ...response, timing: { ...timing, ...patch } }, pair)).toBeNull();
    });
    it("waits for the measured point and fails closed when the deadline is missed", () => {
        expect(guidedStart(6.12, 6.2)).toBe("wait");
        expect(guidedStart(6.12, 6.08)).toBe("start");
        expect(guidedStart(6.12, 5.99)).toBe("missed");
        expect(guidedStart(9, 9)).toBe("missed");
        expect(guidedStart(6, NaN)).toBe("missed");
    });
    it("only recognizes the exact selected music stream, ignoring a rotating auth query", () => {
        expect(isMusicStream("/api/library/tracks/one/stream?token=fixture", "one")).toBe(true);
        expect(isMusicStream("https://example.invalid/api/library/tracks/two/stream", "one")).toBe(false);
        expect(isMusicStream("/api/audiobooks/one/stream", "one")).toBe(false);
        expect(isMusicStream("/api/library/tracks/one/stream/extra", "one")).toBe(false);
    });
});
