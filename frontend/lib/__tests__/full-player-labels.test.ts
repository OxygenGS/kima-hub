/** Desktop player command strings retain their exact English action labels while
 * Dutch translations never rename playback modes, shuffle IDs or music metadata.
 */
import { describe, expect, it } from "vitest";
import { shuffleState } from "@/lib/shuffle";
import { translate } from "@/lib/i18n/translations";

describe("desktop player localized presentation", () => {
    it("keeps the exact original English title contracts used by player automation", () => {
        for (const english of [
            "rewind 30 seconds", "previous track", "retry playback",
            "buffering...", "pause", "play", "next track", "forward 30 seconds",
            "repeat: off", "repeat: all (loop queue)", "repeat: one (loop this track)",
            "show lyrics", "expand to full screen",
        ] as const) {
            expect(translate("en", english)).toBe(english);
        }
    });

    it("translates all user-visible titles and assistive controls", () => {
        expect(translate("nl", "Playback controls")).toBe("Afspeelknoppen");
        expect(translate("nl", "Retry playback")).toBe("Afspelen opnieuw proberen");
        expect(translate("nl", "retry playback")).toBe("afspelen opnieuw proberen");
        expect(translate("nl", "Repeat all")).toBe("Alles herhalen");
        expect(translate("nl", "repeat: all (loop queue)")).toContain("wachtrij");
        expect(translate("nl", "Unmute")).toBe("Geluid aanzetten");
        expect(translate("nl", "Toggle lyrics")).toBe("Songteksten aan-/uitzetten");
        expect(translate("nl", "percent")).toBe("procent");
    });

    it("uses the same shuffle state and server-owned operation identifiers", () => {
        const available = shuffleState(true, "track", "idle");
        const unavailable = shuffleState(true, "podcast", "idle");
        const inVibe = shuffleState(true, "track", "vibe");
        expect(available).toEqual({ enabled: true, title: "shuffle" });
        expect(unavailable).toEqual({ enabled: false, title: "shuffle (music only)" });
        expect(inVibe).toEqual({ enabled: false, title: "a vibe queue plays in order" });
        expect(translate("nl", available.title)).toBe("willekeurig afspelen");
        expect(translate("nl", inVibe.title)).toContain("Vibe-wachtrij");
        expect(translate("en", inVibe.title)).toBe(inVibe.title);
    });
});
