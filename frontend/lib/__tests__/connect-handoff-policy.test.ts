import { describe, expect, it } from "vitest";
import { shouldPauseSourceForHandoff } from "../connect-handoff-policy";

const receipt = {
    sourceTrackId: "track123",
    positionSeconds: 43,
    createdAt: 1_800_000_000_000,
    serverNow: 1_800_000_012_000,
};
const playing = {
    isPlaying: true,
    playbackType: "track",
    currentTrackId: "track123",
    currentTime: 55,
};

describe("source handoff acknowledgement continuity policy", () => {
    it("pauses only after the same song is still playing at the expected position", () => {
        expect(shouldPauseSourceForHandoff(receipt, playing)).toBe(true);
    });

    it("never pauses a new song, audiobook or already paused source", () => {
        expect(shouldPauseSourceForHandoff(receipt, { ...playing, currentTrackId: "different" })).toBe(false);
        expect(shouldPauseSourceForHandoff(receipt, { ...playing, playbackType: "audiobook" })).toBe(false);
        expect(shouldPauseSourceForHandoff(receipt, { ...playing, isPlaying: false })).toBe(false);
    });

    it("does not interrupt playback after the listener seeks or restarts a track", () => {
        expect(shouldPauseSourceForHandoff(receipt, { ...playing, currentTime: 1 })).toBe(false);
        expect(shouldPauseSourceForHandoff(receipt, { ...playing, currentTime: 100 })).toBe(false);
    });

    it("uses server elapsed time instead of the source browser clock", () => {
        expect(shouldPauseSourceForHandoff(receipt, playing)).toBe(true);
        expect(shouldPauseSourceForHandoff({ ...receipt, serverNow: receipt.createdAt - 1000 }, playing)).toBe(false);
    });

    it("rejects corrupted or non-finite audio clock values", () => {
        expect(shouldPauseSourceForHandoff(receipt, { ...playing, currentTime: Number.NaN })).toBe(false);
        expect(shouldPauseSourceForHandoff({ ...receipt, positionSeconds: Infinity }, playing)).toBe(false);
    });
});
