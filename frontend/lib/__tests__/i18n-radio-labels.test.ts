import { describe, expect, it } from "vitest";
import { localizedRadioDescription, localizedRadioName } from "../i18n/radio-labels";
import { translations, type TranslationKey } from "../i18n/translations";

const nl = (key: TranslationKey) => translations.nl[key];
const en = (key: TranslationKey) => translations.en[key];

describe("localized radio presentation", () => {
    it("translates built-in station labels without changing their data", () => {
        const station = {
            id: "workout",
            name: "Workout",
            description: "High energy tracks",
            filter: { type: "workout" as const },
        };
        expect(localizedRadioName(station, nl)).toBe("Sporten");
        expect(localizedRadioDescription(station, nl, "nl")).toBe("Energieke nummers");
        expect(localizedRadioName(station, en)).toBe("Workout");
        expect(station.id).toBe("workout");
        expect(station.filter.type).toBe("workout");
    });

    it("leaves music-library genre names and their filter values untouched", () => {
        const station = {
            id: "genre-psychedelic rock",
            name: "Psychedelic Rock",
            description: "1200 tracks",
            filter: { type: "genre" as const, value: "Psychedelic Rock" },
        };
        expect(localizedRadioName(station, nl)).toBe("Psychedelic Rock");
        expect(localizedRadioDescription(station, nl, "nl")).toBe("1.200 nummers");
        expect(localizedRadioDescription(station, en, "en")).toBe("1,200 tracks");
        expect(station.filter.value).toBe("Psychedelic Rock");
        expect(station.description).toBe("1200 tracks");
    });

    it("preserves unknown descriptions and supports singular counts", () => {
        const unknown = {
            id: "genre-custom",
            name: "Custom",
            description: "Generated externally",
            filter: { type: "genre" as const },
        };
        expect(localizedRadioDescription(unknown, nl, "nl")).toBe("Generated externally");
        expect(localizedRadioDescription({ ...unknown, description: "1 tracks" }, nl, "nl")).toBe("1 nummer");
    });
});
