import type { Locale } from "@/lib/i18n/translations";

/** "Just now" / "12m ago" / "3h ago", then the local date. Shared by the activity surfaces. */
export function timeAgo(dateStr: string, locale: Locale = "en"): string {
    const date = new Date(dateStr);
    const diff = Date.now() - date.getTime();

    if (diff < 60000) return locale === "nl" ? "Zojuist" : "Just now";
    if (diff < 3600000) return locale === "nl" ? `${Math.floor(diff / 60000)} min geleden` : `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return locale === "nl" ? `${Math.floor(diff / 3600000)} uur geleden` : `${Math.floor(diff / 3600000)}h ago`;
    return locale === "nl" ? date.toLocaleDateString("nl-NL") : date.toLocaleDateString();
}
