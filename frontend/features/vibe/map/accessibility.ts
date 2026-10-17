/**
 * Accessible wording for the interactive 3-D map. Localization must be kept
 * out of mood IDs, shader geometry, map coordinates and music metadata.
 */
import { translate, type Locale } from "@/lib/i18n/translations";

export function vibeMapAccessibleLabel(locale: Locale, trackCount: number): string {
    return `${translate(locale, "Music map of")} ${trackCount} ${translate(locale, trackCount === 1 ? "track" : "tracks")}. ${translate(locale, "Tracks that sound alike sit close together.")}`;
}
