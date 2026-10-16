/** Locale-specific presentation of v1.11 Stats values.
 * Never change the underlying numeric statistics or backend period identifiers.
 */
import type { Locale } from "@/lib/i18n/translations";

const language = (locale: Locale) => (locale === "nl" ? "nl-NL" : "en-US");

export function formatStatsCount(value: number, locale: Locale): string {
    return value.toLocaleString(language(locale));
}

export function formatStatsOneDecimal(value: number, locale: Locale): string {
    return value.toLocaleString(language(locale), {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
    });
}
