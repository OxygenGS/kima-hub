/**
 * Presentation-only radio labels. Station IDs, genre/decade filters and API
 * requests retain their original (untranslated) values.
 */
import type { RadioStation } from "@/features/home/radioData";
import type { Locale, TranslationKey } from "./translations";

type Translate = (key: TranslationKey) => string;

const staticNames = {
    all: "Shuffle All",
    workout: "Workout",
    discovery: "Discovery",
    favorites: "Favorites",
} as const satisfies Record<string, TranslationKey>;

const staticDescriptions = {
    all: "Your entire library",
    workout: "High energy tracks",
    discovery: "Lesser-played gems",
    favorites: "Most played",
} as const satisfies Record<string, TranslationKey>;

export function localizedRadioName(
    station: Pick<RadioStation, "id" | "name">,
    t: Translate,
): string {
    const key = staticNames[station.id as keyof typeof staticNames];
    return key ? t(key) : station.name;
}

export function localizedRadioDescription(
    station: Pick<RadioStation, "id" | "description" | "filter">,
    t: Translate,
    locale: Locale,
): string {
    const key = staticDescriptions[station.id as keyof typeof staticDescriptions];
    if (key) return t(key);

    // These descriptions are generated in radioData from the library count.
    // Genre names and backend filter values must never be translated.
    if (station.filter.type === "genre" || station.filter.type === "decade") {
        const match = /^(\d+) tracks$/.exec(station.description);
        if (match) {
            const count = Number(match[1]);
            return `${new Intl.NumberFormat(locale === "nl" ? "nl-NL" : "en-US").format(count)} ${t(count === 1 ? "track" : "tracks")}`;
        }
    }

    return station.description;
}
