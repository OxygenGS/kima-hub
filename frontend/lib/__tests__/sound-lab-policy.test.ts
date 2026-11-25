import { describe, expect, it } from "vitest";
import { FLAT_SOUND, sanitizeSoundLab, eqPreamp, crossfadeGains, transitionSeconds } from "../sound-lab-policy";

describe("Sound Lab and DJ transition safety policy", () => {
    it("defaults to disabled, flat processing and rejects malformed values", () => {
        expect(sanitizeSoundLab(null)).toEqual(FLAT_SOUND);
        expect(sanitizeSoundLab({ enabled: "true", preset: "invalid", nightMode: 1, lowDb: 20 })).toEqual(FLAT_SOUND);
    });
    it("uses known preset values and bounds custom EQ gains", () => {
        expect(sanitizeSoundLab({ preset: "bass", enabled: true, lowDb: 99 }).lowDb).toBe(4);
        const custom = sanitizeSoundLab({ preset: "custom", enabled: true, lowDb: 99, midDb: -99, highDb: NaN });
        expect([custom.lowDb, custom.midDb, custom.highDb]).toEqual([6, -6, 0]);
    });
    it("reserves conservative headroom only for enabled positive gains", () => {
        expect(eqPreamp(FLAT_SOUND)).toBe(1);
        const boosted = sanitizeSoundLab({ preset: "custom", enabled: true, lowDb: 6, midDb: 6, highDb: -6 });
        expect(eqPreamp(boosted)).toBeCloseTo(Math.pow(10, -12 / 20), 6);
        expect(eqPreamp({ ...boosted, enabled: false })).toBe(1);
    });
    it("keeps the deck gain sum bounded and honors mute", () => {
        expect(crossfadeGains(0, .8)).toEqual({ outgoing: .8, incoming: 0 });
        expect(crossfadeGains(1, .8)).toEqual({ outgoing: 0, incoming: .8 });
        expect(crossfadeGains(.5, .8)).toEqual({ outgoing: .4, incoming: .4 });
        expect(crossfadeGains(.5, 1, true)).toEqual({ outgoing: 0, incoming: 0 });
        expect(crossfadeGains(2, 5)).toEqual({ outgoing: 0, incoming: 1 });
    });
    it("disallows overlap for short or invalid tracks and limits duration", () => {
        expect(transitionSeconds(8, 10, 200)).toBe(0);
        expect(transitionSeconds(8, 200, NaN)).toBe(0);
        expect(transitionSeconds(30, 200, 200)).toBe(8);
        expect(transitionSeconds(8, 20, 200)).toBe(5);
        expect(transitionSeconds(0, 200, 200)).toBe(0);
    });
});
