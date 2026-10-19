import { describe, expect, it } from "vitest";
import { vibeMapAccessibleLabel } from "@/features/vibe/map/accessibility";
import { moodLabel } from "@/features/vibe/mapUtils";
import { translate } from "@/lib/i18n/translations";

describe("Vibe Map accessible copy", () => {
    it("uses Dutch descriptions with natural singular/plural without changing track counts", () => {
        expect(vibeMapAccessibleLabel("nl", 1)).toBe("Muziekkaart met 1 nummer. Nummers die vergelijkbaar klinken staan dicht bij elkaar.");
        expect(vibeMapAccessibleLabel("nl", 42)).toContain("42 nummers");
        expect(vibeMapAccessibleLabel("en", 42)).toBe("Music map of 42 tracks. Tracks that sound alike sit close together.");
        expect(vibeMapAccessibleLabel("en", 1)).toContain("1 track.");
    });

    it("translates visual mood labels while leaving backend mood keys intact", () => {
        for (const [key, label] of [
            ["moodHappy", "Opgewekt"],
            ["moodSad", "Melancholisch"],
            ["moodRelaxed", "Rustig"],
            ["moodAggressive", "Intens"],
            ["moodParty", "Energiek"],
        ] as const) {
            expect(translate("nl", moodLabel(key))).toBe(label);
            expect(translate("en", moodLabel(key))).toBe(moodLabel(key));
        }
    });

    it("localizes WebGL fallback for browsers without supported graphics", () => {
        const original = "This browser cannot draw the map because WebGL is turned off or unavailable.";
        expect(translate("nl", original)).toContain("WebGL uitgeschakeld");
        expect(translate("en", original)).toBe(original);
    });
});
