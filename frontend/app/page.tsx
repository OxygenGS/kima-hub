"use client";

import React, { useState, lazy, Suspense } from "react";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { RefreshCw, AudioWaveform } from "lucide-react";
import { GradientSpinner } from "@/components/ui/GradientSpinner";
import { useHomeData } from "@/features/home/hooks/useHomeData";
import { HomeHero } from "@/features/home/components/HomeHero";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ContinueListening } from "@/features/home/components/ContinueListening";
import { ArtistsGrid, PopularArtistsGrid } from "@/features/home/components/ArtistsGrid";
import { MixesGrid } from "@/features/home/components/MixesGrid";
import { PodcastsGrid } from "@/features/home/components/PodcastsGrid";
import { AudiobooksGrid } from "@/features/home/components/AudiobooksGrid";
import { FeaturedPlaylistsGrid, FeaturedPlaylistsSkeleton } from "@/features/home/components/FeaturedPlaylistsGrid";
import { LibraryRadioStations } from "@/features/home/components/LibraryRadioStations";
import { Button } from "@/components/ui/Button";
import { useLanguage } from "@/lib/i18n/language-context";

const MoodMixer = lazy(() => import("@/components/MoodMixer").then(mod => ({ default: mod.MoodMixer })));

export default function HomePage() {
    const { t } = useLanguage();
    const [showMoodMixer, setShowMoodMixer] = useState(false);
    const {
        recentlyListened,
        recentlyAdded,
        recommended,
        mixes,
        popularArtists,
        recentPodcasts,
        recentAudiobooks,
        featuredPlaylists,
        isLoading,
        sectionLoading,
        isRefreshingMixes,
        isBrowseLoading,
        handleRefreshMixes,
    } = useHomeData();

    // Authentication can still gate the page to avoid cross-account flash;
    // independent library requests only gate their own card rows.
    if (isLoading) {
        return <LoadingScreen />;
    }
    const row = (loading: boolean, count: number, content: React.ReactNode) =>
        loading && count === 0 ? (
            <div role="status" aria-label={t("Loading...")}>
                <FeaturedPlaylistsSkeleton />
            </div>
        ) : content;

    return (
        <div className="min-h-screen">
            <div className="relative">
                <HomeHero artists={recentlyAdded} loading={sectionLoading.recentlyAdded} />

                <div className="section-stack relative page-shell pb-32 pt-2">
                {/* Sections rise in staggered order on mount. Only the first 8 visible sections animate;
                    items 9+ render immediately. Animation is mount-only (CSS animation-fill-mode: both). */}
                {(() => {
                    const sections: Array<{ key: string; visible: boolean; content: React.ReactNode }> = [
                        { key: "library-radio", visible: true, content: (
                            <section data-tv-section="library-radio">
                                <SectionHeader title={t("Library Radio")} showAllHref="/radio" type="featured" />
                                <LibraryRadioStations />
                            </section>
                        )},
                        { key: "continue-listening", visible: sectionLoading.recentlyListened || recentlyListened.length > 0, content: (
                            <section data-tv-section="continue-listening">
                                <SectionHeader title={t("Continue Listening")} showAllHref="/collection?tab=artists" type="featured" />
                                {row(sectionLoading.recentlyListened, recentlyListened.length, <ContinueListening items={recentlyListened} />)}
                            </section>
                        )},
                        { key: "recently-added", visible: sectionLoading.recentlyAdded || recentlyAdded.length > 0, content: (
                            <section data-tv-section="recently-added">
                                <SectionHeader title={t("Recently Added")} showAllHref="/collection?tab=artists" type="artist" />
                                {row(sectionLoading.recentlyAdded, recentlyAdded.length, <ArtistsGrid artists={recentlyAdded} />)}
                            </section>
                        )},
                        { key: "made-for-you", visible: sectionLoading.mixes || mixes.length > 0, content: (
                            <section data-tv-section="made-for-you">
                                <SectionHeader
                                    title={t("Made For You")}
                                    type="track"
                                    action={
                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="primary"
                                                size="sm"
                                                onClick={() => setShowMoodMixer(true)}
                                            >
                                                <AudioWaveform className="w-3.5 h-3.5" />
                                                <span className="hidden sm:inline">{t("Mood Mixer")}</span>
                                            </Button>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={handleRefreshMixes}
                                                disabled={isRefreshingMixes || sectionLoading.mixes}
                                                aria-label={t("Refresh mixes")}
                                            >
                                                {isRefreshingMixes ? (
                                                    <GradientSpinner size="sm" />
                                                ) : (
                                                    <RefreshCw className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-150" />
                                                )}
                                                <span className="hidden sm:inline">
                                                    {isRefreshingMixes ? t("Refreshing...") : t("Refresh")}
                                                </span>
                                            </Button>
                                        </div>
                                    }
                                />
                                {row(sectionLoading.mixes, mixes.length, <MixesGrid mixes={mixes} />)}
                            </section>
                        )},
                        { key: "recommended", visible: sectionLoading.recommended || recommended.length > 0, content: (
                            <section data-tv-section="recommended">
                                <SectionHeader title={t("Recommended")} showAllHref="/discover" badge={t("Local Engine")} type="artist" />
                                {row(sectionLoading.recommended, recommended.length, <ArtistsGrid artists={recommended} />)}
                            </section>
                        )},
                        { key: "popular-artists", visible: sectionLoading.popularArtists || popularArtists.length > 0, content: (
                            <section data-tv-section="popular-artists">
                                <SectionHeader title={t("Popular Artists")} badge="ListenBrainz" type="artist" />
                                {row(sectionLoading.popularArtists, popularArtists.length, <PopularArtistsGrid artists={popularArtists} />)}
                            </section>
                        )},
                        { key: "featured-playlists", visible: isBrowseLoading || featuredPlaylists.length > 0, content: (
                            <section data-tv-section="featured-playlists">
                                <SectionHeader title={t("Featured Playlists")} showAllHref="/browse/playlists" badge="Deezer" type="track" />
                                {isBrowseLoading && featuredPlaylists.length === 0 ? (
                                    <FeaturedPlaylistsSkeleton />
                                ) : (
                                    <FeaturedPlaylistsGrid playlists={featuredPlaylists} />
                                )}
                            </section>
                        )},
                        { key: "popular-podcasts", visible: sectionLoading.recentPodcasts || recentPodcasts.length > 0, content: (
                            <section data-tv-section="popular-podcasts">
                                <SectionHeader title={t("Popular Podcasts")} showAllHref="/podcasts" type="podcast" />
                                {row(sectionLoading.recentPodcasts, recentPodcasts.length, <PodcastsGrid podcasts={recentPodcasts} />)}
                            </section>
                        )},
                        { key: "audiobooks", visible: sectionLoading.recentAudiobooks || recentAudiobooks.length > 0, content: (
                            <section data-tv-section="audiobooks">
                                <SectionHeader title={t("Audiobooks")} showAllHref="/audiobooks" type="audiobook" />
                                {row(sectionLoading.recentAudiobooks, recentAudiobooks.length, <AudiobooksGrid audiobooks={recentAudiobooks} />)}
                            </section>
                        )},
                    ];

                    let visibleIdx = 0;
                    return sections.map((s) => {
                        if (!s.visible) return null;
                        const staggered = visibleIdx < 8;
                        const el = (
                            <div
                                key={s.key}
                                className={staggered ? "animate-rise [animation-delay:calc(var(--i)*45ms)]" : undefined}
                                style={staggered ? { "--i": visibleIdx } as React.CSSProperties : undefined}
                            >
                                {s.content}
                            </div>
                        );
                        visibleIdx++;
                        return el;
                    });
                })()}
                </div>
            </div>

            {showMoodMixer && (
                <Suspense fallback={null}>
                    <MoodMixer isOpen={showMoodMixer} onClose={() => setShowMoodMixer(false)} />
                </Suspense>
            )}
        </div>
    );
}
