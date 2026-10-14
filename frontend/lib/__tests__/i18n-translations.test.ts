import { describe, expect, it } from "vitest";
import { dutch, english, translations } from "../i18n/translations";

describe("UI translations", () => {
    it("contains a Dutch translation for every English UI key", () => {
        expect(Object.keys(dutch).sort()).toEqual(Object.keys(english).sort());
        expect(Object.values(dutch).every(value => value.trim().length > 0)).toBe(true);
    });

    it("keeps the English default and Dutch alternatives available", () => {
        expect(translations.en["Settings"]).toBe("Settings");
        expect(translations.nl["Settings"]).toBe("Instellingen");
        expect(translations.nl["Language"]).toBe("Taal");
        expect(translations.nl["Sign In"]).toBe("Inloggen");
    });
});
