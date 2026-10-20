export function formatDate(dateString: string, locale: "en" | "nl" = "en"): string {
    const date = new Date(dateString);
    return date.toLocaleDateString(locale === "nl" ? "nl-NL" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}
