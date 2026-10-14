"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import { LanguageSection } from "@/features/settings/components/sections/LanguageSection";
import { useAuth } from "@/lib/auth-context";
import { useSettingsData } from "@/features/settings/hooks/useSettingsData";
import { useSystemSettings } from "@/features/settings/hooks/useSystemSettings";
import { GradientSpinner } from "@/components/ui/GradientSpinner";
import { InlineStatus, useInlineStatus } from "@/components/ui/InlineStatus";
import {
    SettingsLayout,
    SidebarItem
} from "@/features/settings/components/ui";

// Section components
import { AccountSection } from "@/features/settings/components/sections/AccountSection";
import { SubsonicSection } from "@/features/settings/components/sections/SubsonicSection";
import { PlaybackSection } from "@/features/settings/components/sections/PlaybackSection";
import { DownloadPreferencesSection } from "@/features/settings/components/sections/DownloadPreferencesSection";
import { LidarrSection } from "@/features/settings/components/sections/LidarrSection";
import { AudiobookshelfSection } from "@/features/settings/components/sections/AudiobookshelfSection";
import { SoulseekSection } from "@/features/settings/components/sections/SoulseekSection";
import { AIServicesSection } from "@/features/settings/components/sections/AIServicesSection";
import { StoragePathsSection } from "@/features/settings/components/sections/StoragePathsSection";
import { CacheSection } from "@/features/settings/components/sections/CacheSection";
import { UserManagementSection } from "@/features/settings/components/sections/UserManagementSection";
import { BrandingSection } from "@/features/settings/components/sections/BrandingSection";
import { CorruptTracksSection } from "@/features/settings/components/sections/CorruptTracksSection";

// Define sidebar items
const sidebarItems: SidebarItem[] = [
    { id: "account", label: "Account" },
    { id: "language", label: "Language" },
    { id: "subsonic", label: "Native Apps" },
    { id: "playback", label: "Playback" },
    { id: "download-preferences", label: "Download Preferences", adminOnly: true },
    { id: "lidarr", label: "Download Services", adminOnly: true },
    { id: "audiobookshelf", label: "Media Servers", adminOnly: true },
    { id: "soulseek", label: "P2P Networks", adminOnly: true },
    { id: "ai-services", label: "AI & Artwork", adminOnly: true },
    { id: "storage", label: "Storage", adminOnly: true },
    { id: "cache", label: "Library Enrichment", adminOnly: true },
    { id: "corrupt-tracks", label: "Corrupt Tracks", adminOnly: true },
    { id: "users", label: "Users", adminOnly: true },
    { id: "branding", label: "Branding", adminOnly: true },
];

export default function SettingsPage() {
    const { isAuthenticated, isLoading: authLoading, user } = useAuth();
    const { t } = useLanguage();
    const translatedSidebarItems = useMemo(() => sidebarItems.map(item => ({
        ...item, label: t(item.label as TranslationKey),
    })), [t]);
    const [isSaving, setIsSaving] = useState(false);
    const [testingServices, setTestingServices] = useState<Record<string, boolean>>({});
    const saveStatus = useInlineStatus();

    const isAdmin = user?.role === "admin";

    // User settings hook
    const {
        settings: userSettings,
        updateSettings: updateUserSettings,
        saveSettings: saveUserSettings,
    } = useSettingsData();

    // System settings hook (only used if admin)
    const {
        systemSettings,
        updateSystemSettings,
        saveSystemSettings,
        testService,
    } = useSystemSettings();

    // Handle initial hash for section scrolling
    useEffect(() => {
        if (typeof window !== "undefined") {
            const hash = window.location.hash.substring(1);
            if (hash) {
                setTimeout(() => {
                    const element = document.getElementById(hash);
                    if (element) {
                        element.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                }, 100);
            }
        }
    }, []);

    // Unified save function
    const handleSaveAll = useCallback(async () => {
        setIsSaving(true);
        saveStatus.setLoading();
        let hasError = false;

        try {
            await saveUserSettings(userSettings);
        } catch (error) {
            console.error("Failed to save user settings:", error);
            hasError = true;
        }

        if (isAdmin) {
            try {
                await saveSystemSettings(systemSettings);
            } catch (error) {
                console.error("Failed to save system settings:", error);
                hasError = true;
            }
        }

        setIsSaving(false);

        if (hasError) {
            saveStatus.setError(t("Failed to save"));
        } else {
            saveStatus.setSuccess(t("Saved"));
        }
    }, [userSettings, systemSettings, isAdmin, saveUserSettings, saveSystemSettings, saveStatus, t]);

    // Test service wrapper
    const handleTestService = useCallback(async (service: string) => {
        setTestingServices(prev => ({ ...prev, [service]: true }));
        try {
            return await testService(service);
        } finally {
            setTestingServices(prev => ({ ...prev, [service]: false }));
        }
    }, [testService]);

    if (authLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[var(--bg-primary)]">
                <GradientSpinner size="md" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return null;
    }

    return (
        <SettingsLayout sidebarItems={translatedSidebarItems} isAdmin={isAdmin}>
                {/* Account Section */}
            <div className="section-stack">
                <AccountSection />

                {/* Per-browser display language */}
                <LanguageSection />

                {/* Native Apps - Subsonic */}
                <SubsonicSection />

                {/* Playback Section */}
                <PlaybackSection
                    value={userSettings.playbackQuality}
                    onChange={(quality) => updateUserSettings({ playbackQuality: quality })}
                />

                {/* Admin-only sections */}
                {isAdmin && (
                    <>
                        {/* Download Preferences */}
                        <DownloadPreferencesSection
                            settings={systemSettings}
                            onUpdate={updateSystemSettings}
                        />

                        {/* Download Services - Lidarr */}
                        <LidarrSection
                            settings={systemSettings}
                            onUpdate={updateSystemSettings}
                            onTest={handleTestService}
                            isTesting={testingServices.lidarr || false}
                        />

                        {/* Media Servers - Audiobookshelf */}
                        <AudiobookshelfSection
                            settings={systemSettings}
                            onUpdate={updateSystemSettings}
                            onTest={handleTestService}
                            isTesting={testingServices.audiobookshelf || false}
                        />

                        {/* P2P Networks - Soulseek */}
                        <SoulseekSection
                            settings={systemSettings}
                            onUpdate={updateSystemSettings}
                            onTest={handleTestService}
                            isTesting={testingServices.soulseek || false}
                        />

                        {/* AI Services */}
                        <AIServicesSection
                            settings={systemSettings}
                            onUpdate={updateSystemSettings}
                            onTest={handleTestService}
                            isTesting={testingServices.openai || testingServices.fanart || false}
                        />

                        {/* Storage */}
                        <StoragePathsSection
                            settings={systemSettings}
                            onUpdate={updateSystemSettings}
                            onTest={handleTestService}
                            isTesting={false}
                        />

                        {/* Cache & Automation */}
                        <CacheSection
                            settings={systemSettings}
                            onUpdate={updateSystemSettings}
                        />

                        {/* Corrupt Tracks */}
                        <CorruptTracksSection />

                        {/* User Management */}
                        <UserManagementSection />

                        {/* Per-instance, administrator-managed white-label theme */}
                        <BrandingSection />
                    </>
                )}
            </div>

                {/* Save Button - Fixed at bottom */}
                <div className="sticky bottom-0 pt-8 pb-8 bg-gradient-to-t from-[var(--bg-primary)] via-[var(--bg-primary)] to-transparent">
                    <div className="relative">
                        <button
                            onClick={handleSaveAll}
                            disabled={isSaving}
                            className="w-full bg-brand text-brand-contrast font-bold py-3 px-4 rounded-lg
                                hover:bg-brand-hover active:scale-[0.98] transition-all
                                disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSaving ? t("Saving...") : t("Save Changes")}
                        </button>
                        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2">
                            <InlineStatus {...saveStatus.props} />
                        </div>
                    </div>
                </div>
        </SettingsLayout>
    );
}
