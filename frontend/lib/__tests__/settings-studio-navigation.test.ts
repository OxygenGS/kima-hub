import { describe, expect, it } from "vitest";
import {
    SETTINGS_GROUPS,
    SETTINGS_ITEMS,
    SETTINGS_COPY,
    SETTINGS_GROUP_COPY,
    resolveSettingsHash,
    visibleSettingsItems,
} from "@/features/settings/components/ui/SettingsNavigation";

describe("Settings Studio navigation contract", () => {
    it("has exactly one real section for every navigation entry, without a dead Integrations link", () => {
        const ids = SETTINGS_ITEMS.map(item => item.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toEqual([
            "account", "language", "subsonic", "playback", "scrobbling",
            "branding", "download-preferences", "lidarr", "audiobookshelf",
            "soulseek", "artwork", "storage", "cache", "library-doctor",
            "smart-download-inbox", "corrupt-tracks", "users",
        ]);
        expect(ids).not.toContain("integrations");
        const groupIds = new Set(SETTINGS_GROUPS.map(group => group.id));
        expect(SETTINGS_ITEMS.every(item => groupIds.has(item.group))).toBe(true);
    });

    it("never exposes administrator navigation to a member", () => {
        const member = visibleSettingsItems(false);
        const admin = visibleSettingsItems(true);
        expect(member).toHaveLength(5);
        expect(admin).toHaveLength(17);
        expect(member.every(item => !item.adminOnly)).toBe(true);
        expect(member.map(item => item.id)).not.toContain("users");
        expect(member.map(item => item.id)).not.toContain("lidarr");
        expect(resolveSettingsHash("#users", false)).toBe("overview");
        expect(resolveSettingsHash("#users", true)).toBe("users");
        expect(resolveSettingsHash("#enrichment-failures", false)).toBe("overview");
        expect(resolveSettingsHash("#enrichment-failures", true)).toBe("cache");
    });

    it("preserves valid deep links and safely defaults on unknown links", () => {
        expect(resolveSettingsHash("#language", false)).toBe("language");
        expect(resolveSettingsHash("#soulseek", true)).toBe("soulseek");
        expect(resolveSettingsHash("#obsolete-downtify", true)).toBe("overview");
        expect(resolveSettingsHash("#integrations", true)).toBe("overview");
        expect(resolveSettingsHash("", true)).toBe("overview");
    });

    it("provides Dutch and English names for every group and key instruction", () => {
        for (const locale of ["en", "nl"] as const) {
            for (const group of SETTINGS_GROUPS) {
                expect(SETTINGS_GROUP_COPY[locale][group.id].title).toBeTruthy();
                expect(SETTINGS_GROUP_COPY[locale][group.id].description).toBeTruthy();
            }
            expect(SETTINGS_COPY[locale].search).toBeTruthy();
            expect(SETTINGS_COPY[locale].jump).toBeTruthy();
            expect(SETTINGS_COPY[locale].overviewDescription).toBeTruthy();
        }
    });
});
