"use client";

import { useEffect, useState, useCallback } from "react";
import { useIsMobile, useIsTablet } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/cn";
import { useAudioState } from "@/lib/audio-context";
import { useAuth } from "@/lib/auth-context";
import { useLanguage } from "@/lib/i18n/language-context";
import { translate } from "@/lib/i18n/translations";
import { useSettingsData } from "@/features/settings/hooks/useSettingsData";
import { useSystemSettings } from "@/features/settings/hooks/useSystemSettings";
import { GradientSpinner } from "@/components/ui/GradientSpinner";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { InlineStatus, useInlineStatus } from "@/components/ui/InlineStatus";
import { SettingsLayout } from "@/features/settings/components/ui";
import { SETTINGS_ITEMS, resolveSettingsHash } from "@/features/settings/components/ui/SettingsNavigation";

import { AccountSection } from "@/features/settings/components/sections/AccountSection";
import { LanguageSection } from "@/features/settings/components/sections/LanguageSection";
import { BrandingSection } from "@/features/settings/components/sections/BrandingSection";
import { SubsonicSection } from "@/features/settings/components/sections/SubsonicSection";
import { PlaybackSection } from "@/features/settings/components/sections/PlaybackSection";
import { ScrobblingSection } from "@/features/settings/components/sections/ScrobblingSection";
import { DownloadPreferencesSection } from "@/features/settings/components/sections/DownloadPreferencesSection";
import { LidarrSection } from "@/features/settings/components/sections/LidarrSection";
import { AudiobookshelfSection } from "@/features/settings/components/sections/AudiobookshelfSection";
import { SoulseekSection } from "@/features/settings/components/sections/SoulseekSection";
import { ArtworkSection } from "@/features/settings/components/sections/ArtworkSection";
import { StoragePathsSection } from "@/features/settings/components/sections/StoragePathsSection";
import { CacheSection } from "@/features/settings/components/sections/CacheSection";
import { UserManagementSection } from "@/features/settings/components/sections/UserManagementSection";
import { CorruptTracksSection } from "@/features/settings/components/sections/CorruptTracksSection";
import { LibraryDoctorSection } from "@/features/settings/components/sections/LibraryDoctorSection";
import { SmartDownloadInboxSection } from "@/features/settings/components/sections/SmartDownloadInboxSection";
import { Button } from "@/components/ui/Button";

export default function SettingsPage() {
    const { isAuthenticated, isLoading: authLoading, user } = useAuth();
    const { locale } = useLanguage();
    const [activeSection, setActiveSection] = useState("overview");
    const [isSaving, setIsSaving] = useState(false);
    const [testingServices, setTestingServices] = useState<Record<string, boolean>>({});
    const saveStatus = useInlineStatus();

    const isAdmin = user?.role === "admin";

    const {
        settings: userSettings,
        isLoading: userLoading,
        loadError: userLoadError,
        updateSettings: updateUserSettings,
        saveSettings: saveUserSettings,
        loadSettings: reloadUserSettings,
    } = useSettingsData();

    const {
        systemSettings,
        isLoading: systemLoading,
        loadError: systemLoadError,
        updateSystemSettings,
        saveSystemSettings,
        testService,
        loadSystemSettings,
    } = useSystemSettings();

    const loadError = userLoadError ?? (isAdmin ? systemLoadError : null);
    const isLoaded = !userLoading && (!isAdmin || !systemLoading);

    // The token is saved on its own, so only the editable settings count as unsaved.
    const snapshot = useCallback(
        ({ hasListenbrainzToken: _token, ...editable }: typeof userSettings) =>
            JSON.stringify([editable, isAdmin ? systemSettings : null]),
        [isAdmin, systemSettings],
    );
    const current = isLoaded && !loadError ? snapshot(userSettings) : null;
    const [saved, setSaved] = useState<string | null>(null);
    if (current !== null && saved === null) setSaved(current);
    const isDirty = current !== null && saved !== null && current !== saved;
    const isMobile = useIsMobile();
    const isTablet = useIsTablet();
    const hasPhoneChrome = isMobile || isTablet;
    const { currentTrack, currentAudiobook, currentPodcast } = useAudioState();
    const hasMiniPlayer = !!(currentTrack || currentAudiobook || currentPodcast);

    const retryLoad = useCallback(() => {
        setSaved(null);
        reloadUserSettings();
        if (isAdmin) loadSystemSettings();
    }, [isAdmin, reloadUserSettings, loadSystemSettings]);

    // An existing deep link opens its permitted section. Keep the old library
    // enrichment failure link working without exposing admin-only sections.
    useEffect(() => {
        const syncHash = () => setActiveSection(resolveSettingsHash(window.location.hash, isAdmin));
        syncHash();
        window.addEventListener("hashchange", syncHash);
        window.addEventListener("popstate", syncHash);
        return () => {
            window.removeEventListener("hashchange", syncHash);
            window.removeEventListener("popstate", syncHash);
        };
    }, [isAdmin]);

    const handleSectionChange = useCallback((id: string) => {
        if (id !== "overview" && !SETTINGS_ITEMS.some(item => item.id === id && (isAdmin || !item.adminOnly))) {
            return;
        }
        setActiveSection(id);
        const hash = id === "overview" ? "" : "#" + id;
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search + hash);
        const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        document.getElementById("settings-main")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    }, [isAdmin]);

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
            saveStatus.setError("Couldn't save");
        } else {
            setSaved(snapshot(userSettings));
            saveStatus.setSuccess("Saved");
        }
    }, [userSettings, systemSettings, isAdmin, saveUserSettings, saveSystemSettings, saveStatus, snapshot]);

    const handleTestService = useCallback(async (service: string) => {
        setTestingServices(prev => ({ ...prev, [service]: true }));
        try {
            return await testService(service);
        } finally {
            setTestingServices(prev => ({ ...prev, [service]: false }));
        }
    }, [testService]);

    if (authLoading) return <LoadingScreen />;
    if (!isAuthenticated) return null;

    // Error/loading UI is always visible, even when the overview is selected.
    if (loadError) {
        return (
            <SettingsLayout
                sidebarItems={SETTINGS_ITEMS}
                isAdmin={isAdmin}
                activeSection={activeSection === "overview" ? "account" : activeSection}
                onSectionChange={handleSectionChange}
            >
                <div role="alert" className="rounded-[24px] border border-danger/30 bg-danger/10 p-6">
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                        {translate(locale, "Settings could not be loaded")}
                    </h2>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">{loadError}</p>
                    <Button variant="primary" onClick={retryLoad} className="mt-4">
                        {translate(locale, "Try again")}
                    </Button>
                </div>
            </SettingsLayout>
        );
    }

    if (!isLoaded) {
        return (
            <SettingsLayout
                sidebarItems={SETTINGS_ITEMS}
                isAdmin={isAdmin}
                activeSection={activeSection === "overview" ? "account" : activeSection}
                onSectionChange={handleSectionChange}
            >
                <div className="flex justify-center rounded-[24px] border border-white/10 bg-[var(--bg-secondary)] py-20" aria-busy="true">
                    <GradientSpinner size="md" />
                </div>
            </SettingsLayout>
        );
    }

    return (
        <SettingsLayout
            sidebarItems={SETTINGS_ITEMS}
            isAdmin={isAdmin}
            activeSection={activeSection}
            onSectionChange={handleSectionChange}
            footer={(isDirty || saveStatus.props.status !== "idle") && (
                <div
                    role="status"
                    className={cn(
                        "sticky z-(--z-raised) mt-5 flex flex-wrap items-center justify-end gap-3 rounded-[18px] border border-brand/20 bg-[var(--bg-secondary)] px-4 py-3 shadow-[0_12px_42px_rgba(0,0,0,0.35)]",
                        (!hasPhoneChrome || !hasMiniPlayer) && "bottom-4",
                        hasPhoneChrome && hasMiniPlayer && "bottom-[94px]",
                    )}
                >
                    <InlineStatus {...saveStatus.props} />
                    {isDirty && (
                        <>
                            <span className="mr-auto text-sm font-medium text-[var(--text-secondary)]">
                                {translate(locale, "Unsaved changes")}
                            </span>
                            <Button variant="primary" onClick={handleSaveAll} disabled={isSaving}>
                                {isSaving ? translate(locale, "Saving...") : translate(locale, "Save changes")}
                            </Button>
                        </>
                    )}
                </div>
            )}
        >
            {/* Keep forms mounted while switching panels: unsaved values, dialogs
                and independent connection/status workflows must not reset. */}
            <div className="min-w-0">
                <div hidden={activeSection !== "account"}><AccountSection /></div>
                <div hidden={activeSection !== "language"}><LanguageSection /></div>
                {isAdmin && <div hidden={activeSection !== "branding"}><BrandingSection /></div>}

                <div hidden={activeSection !== "subsonic"}><SubsonicSection /></div>

                <div hidden={activeSection !== "playback"}>
                    <PlaybackSection
                        value={userSettings.playbackQuality}
                        onChange={(quality) => updateUserSettings({ playbackQuality: quality })}
                        maxQueueLength={isAdmin ? systemSettings.maxQueueLength : undefined}
                        onMaxQueueLength={
                            isAdmin
                                ? (maxQueueLength) => updateSystemSettings({ maxQueueLength })
                                : undefined
                        }
                    />
                </div>

                <div hidden={activeSection !== "scrobbling"}>
                    <ScrobblingSection
                        configured={!!userSettings.hasListenbrainzToken}
                        onSaved={(hasListenbrainzToken) => updateUserSettings({ hasListenbrainzToken })}
                        liveSharing={
                            userSettings.liveSharingAvailable
                                ? {
                                    checked: userSettings.shareLiveListening !== false,
                                    onChange: (shareLiveListening) => updateUserSettings({ shareLiveListening }),
                                }
                                : undefined
                        }
                    />
                </div>

                {isAdmin && (
                    <>
                        <div hidden={activeSection !== "download-preferences"}>
                            <DownloadPreferencesSection settings={systemSettings} onUpdate={updateSystemSettings} />
                        </div>

                        <div hidden={activeSection !== "lidarr"}>
                            <LidarrSection
                                settings={systemSettings}
                                onUpdate={updateSystemSettings}
                                onTest={handleTestService}
                                isTesting={testingServices.lidarr || false}
                            />
                        </div>

                        <div hidden={activeSection !== "audiobookshelf"}>
                            <AudiobookshelfSection
                                settings={systemSettings}
                                onUpdate={updateSystemSettings}
                                onTest={handleTestService}
                                isTesting={testingServices.audiobookshelf || false}
                            />
                        </div>

                        <div hidden={activeSection !== "soulseek"}>
                            <SoulseekSection
                                settings={systemSettings}
                                onUpdate={updateSystemSettings}
                                onTest={handleTestService}
                                isTesting={testingServices.soulseek || false}
                            />
                        </div>

                        <div hidden={activeSection !== "artwork"}>
                            <ArtworkSection
                                settings={systemSettings}
                                onUpdate={updateSystemSettings}
                                onTest={handleTestService}
                                isTesting={testingServices.fanart || false}
                            />
                        </div>

                        <div hidden={activeSection !== "storage"}>
                            <StoragePathsSection settings={systemSettings} onUpdate={updateSystemSettings} />
                        </div>

                        <div hidden={activeSection !== "cache"}>
                            <CacheSection settings={systemSettings} onUpdate={updateSystemSettings} />
                        </div>

                        <div hidden={activeSection !== "library-doctor"}><LibraryDoctorSection /></div>
                        <div hidden={activeSection !== "smart-download-inbox"}><SmartDownloadInboxSection /></div>
                        <div hidden={activeSection !== "corrupt-tracks"}><CorruptTracksSection /></div>
                        <div hidden={activeSection !== "users"}><UserManagementSection /></div>
                    </>
                )}
            </div>
        </SettingsLayout>
    );
}
