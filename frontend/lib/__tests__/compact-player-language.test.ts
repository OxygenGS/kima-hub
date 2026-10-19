/** All modes share the same titles and callback identifiers. No UI translation
 * may change the English action strings consumed by mobile player automation.
 */
import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/translations";
import { shuffleState } from "@/lib/shuffle";
describe("compact and overlay player localized controls", () => {
    it("retains existing English action titles for mobile/overlay automation", () => {
        for (const key of [
            "show player", "show bottom player", "previous", "previous (music only)",
            "next", "next (music only)", "repeat: one", "repeat: all",
            "repeat (music only)", "skip only for music",
            "repeat one", "repeat all", "repeat off", "close",
        ] as const) expect(translate("en", key)).toBe(key);
    });
    it("shows meaningful Dutch controls and error recovery", () => {
        expect(translate("nl", "Playback Error")).toBe("Afspeelfout");
        expect(translate("nl", "Tap retry to reconnect")).toContain("verbinding");
        expect(translate("nl", "Now Playing")).not.toBe("Now Playing");
        expect(translate("nl", "Previous track")).toBe("Vorig nummer");
        expect(translate("nl", "Skip forward 30 seconds")).toContain("30 seconden");
        expect(translate("nl", "repeat (music only)")).toContain("alleen muziek");
    });
    it("keeps shuffle decisions and original player operation values", () => {
        const regular = shuffleState(true, "track", "idle");
        const vibe = shuffleState(true, "track", "vibe");
        expect(regular.enabled).toBe(true);
        expect(vibe.enabled).toBe(false);
        expect(regular.title).toBe("shuffle");
        expect(vibe.title).toBe("a vibe queue plays in order");
        expect(translate("nl", vibe.title)).toContain("Vibe-wachtrij");
        expect(translate("en", vibe.title)).toBe(vibe.title);
    });
});
