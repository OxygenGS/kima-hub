import { describe, expect, it } from "vitest";
import { formatDate } from "@/features/podcast/utils";
import { translate } from "../i18n/translations";

describe("Dutch podcast UI labels and dates", () => {
    it("uses the locale for episode publication dates", () => {
        const timestamp = "2026-03-14T12:00:00Z";
        const date = new Date(timestamp);
        const options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" };
        expect(formatDate(timestamp, "en")).toBe(date.toLocaleDateString("en-US", options));
        expect(formatDate(timestamp, "nl")).toBe(date.toLocaleDateString("nl-NL", options));
        expect(formatDate(timestamp, "en")).not.toBe(formatDate(timestamp, "nl"));
    });

    it("translates episode actions, status and subscription UI without modifying podcast titles", () => {
        const labels = [
            "Failed to refresh podcasts",
            "Add RSS feed",
            "Search podcasts to add",
            "Remove podcast",
            "Filter episodes",
            "Season",
            "episode in progress",
            "episodes in progress",
            "Play next episode",
            "Play previous episode",
            "Show more",
        ];
        for (const label of labels) {
            expect(translate("en", label)).toBe(label);
            expect(translate("nl", label)).not.toBe(label);
        }
        expect(translate("nl", "Original Episode: Résumé #42")).toBe("Original Episode: Résumé #42");
        expect(translate("nl", "https://example.com/feed.xml")).toBe("https://example.com/feed.xml");
    });
});
