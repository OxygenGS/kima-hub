/** The original English wording is the authoritative destructive action warning. */
import type { Locale } from "./translations";

export const ENGLISH_DISCOVER_CLEAR_WARNING = [
    "clear discovery playlist?",
    "",
    "• liked albums will be moved to your library",
    "• non-liked albums will be deleted",
    "",
    "this action cannot be undone.",
].join("\n");

// Deliberately duplicate the audited wording. If the English warning changes,
// fall back to the current English source instead of presenting stale Dutch
// text as if the user approved a different operation.
const AUDITED_ENGLISH_WARNING = [
    "clear discovery playlist?",
    "",
    "• liked albums will be moved to your library",
    "• non-liked albums will be deleted",
    "",
    "this action cannot be undone.",
].join("\n");

const DUTCH_DISCOVER_CLEAR_WARNING = [
    "Ontdekkingsafspeellijst wissen?",
    "",
    "• albums die je leuk vindt worden naar je bibliotheek verplaatst",
    "• albums zonder vind-ik-leuk worden verwijderd",
    "",
    "Deze actie kan niet ongedaan worden gemaakt.",
].join("\n");

/** The optional source argument lets regression tests simulate upstream copy changes. */
export function discoverClearWarning(locale: Locale, englishSource = ENGLISH_DISCOVER_CLEAR_WARNING): string {
    if (locale !== "nl" || englishSource !== AUDITED_ENGLISH_WARNING) return englishSource;
    return DUTCH_DISCOVER_CLEAR_WARNING;
}
