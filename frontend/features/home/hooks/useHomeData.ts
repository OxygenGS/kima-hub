/** Loads every Home section and refreshes the mixes. */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { notify } from "@/lib/notify";
import { useLanguage } from "@/lib/i18n/language-context";
import type {
    Artist,
    ListenedItem,
    Podcast,
    Audiobook,
    Mix,
    PopularArtist,
    PlaylistPreview,
} from "../types";
import {
    useRecentlyListenedQuery,
    useRecentlyAddedQuery,
    useRecommendationsQuery,
    useMixesQuery,
    usePopularArtistsQuery,
    useTopPodcastsQuery,
    useAudiobooksQuery,
    useRefreshMixesMutation,
    useBrowseAllQuery,
    queryKeys,
} from "@/hooks/useQueries";

/** Each home row loads independently; a slow source must not hide ready rows. */
export interface HomeSectionLoading {
    recentlyListened: boolean;
    recentlyAdded: boolean;
    recommended: boolean;
    mixes: boolean;
    popularArtists: boolean;
    recentPodcasts: boolean;
    recentAudiobooks: boolean;
}
export interface UseHomeDataReturn {
    // Data sections
    recentlyListened: ListenedItem[];
    recentlyAdded: Artist[];
    recommended: Artist[];
    mixes: Mix[];
    popularArtists: PopularArtist[];
    recentPodcasts: Podcast[];
    recentAudiobooks: Audiobook[];
    featuredPlaylists: PlaylistPreview[];

    // Guard authentication only; loading content queries must not blank ready rows.
    isLoading: boolean;
    sectionLoading: HomeSectionLoading;
    isRefreshingMixes: boolean;
    isBrowseLoading: boolean;

    // Actions
    handleRefreshMixes: () => Promise<void>;
}

/** Every Home section: continue listening, recently added, recommended, mixes, popular, podcasts, audiobooks. */
export function useHomeData(): UseHomeDataReturn {
    const { t } = useLanguage();
    const { isAuthenticated } = useAuth();
    const queryClient = useQueryClient();

    // Listen for mixes-updated event (fired when user saves mood preferences)
    // Use refetchQueries instead of invalidateQueries to force immediate UI update
    useEffect(() => {
        const handleMixesUpdated = () => {
            // refetchQueries forces immediate refetch, unlike invalidateQueries which only marks stale
            queryClient.refetchQueries({ queryKey: queryKeys.mixes() });
        };

        window.addEventListener("mixes-updated", handleMixesUpdated);
        return () =>
            window.removeEventListener("mixes-updated", handleMixesUpdated);
    }, [queryClient]);

    // React Query hooks - these automatically handle caching, refetching, and loading states
    const { data: recentlyListenedData, isLoading: isLoadingListened } =
        useRecentlyListenedQuery(10);
    const { data: recentlyAddedData, isLoading: isLoadingAdded } =
        useRecentlyAddedQuery(10);
    const { data: recommendedData, isLoading: isLoadingRecommended } =
        useRecommendationsQuery(10);
    const { data: mixesData, isLoading: isLoadingMixes } = useMixesQuery();
    const { data: popularData, isLoading: isLoadingPopular } =
        usePopularArtistsQuery(20);
    const { data: podcastsData, isLoading: isLoadingPodcasts } =
        useTopPodcastsQuery(10);
    const { data: audiobooksData, isLoading: isLoadingAudiobooks } =
        useAudiobooksQuery();
    const { data: browseData, isLoading: isBrowseLoading } =
        useBrowseAllQuery();

    const { mutateAsync: refreshMixes, isPending: isRefreshingMixes } =
        useRefreshMixesMutation();

    /**
     * Refresh mixes and update cache
     */
    const handleRefreshMixes = async () => {
        try {
            await refreshMixes();
        } catch (error) {
            console.error("Failed to refresh mixes:", error);
            notify.error(t("Failed to refresh mixes"));
        }
    };

    // Process recently listened data - can contain artists, podcasts, or audiobooks
    const items = recentlyListenedData?.items || [];

    // Preserve account isolation while authentication is unresolved.
    const isLoading = !isAuthenticated;

    const sectionLoading: HomeSectionLoading = {
        recentlyListened: isLoadingListened,
        recentlyAdded: isLoadingAdded,
        recommended: isLoadingRecommended,
        mixes: isLoadingMixes,
        popularArtists: isLoadingPopular,
        recentPodcasts: isLoadingPodcasts,
        recentAudiobooks: isLoadingAudiobooks,
    };

    return {
        recentlyListened: items,
        recentlyAdded: recentlyAddedData?.artists || [],
        recommended: recommendedData?.artists || [],
        mixes: Array.isArray(mixesData) ? mixesData : [],
        popularArtists: popularData?.artists || [],
        recentPodcasts: Array.isArray(podcastsData)
            ? podcastsData.slice(0, 10)
            : [],
        recentAudiobooks: Array.isArray(audiobooksData)
            ? audiobooksData.slice(0, 10)
            : [],
        featuredPlaylists: browseData?.playlists || [],
        isLoading,
        sectionLoading,
        isRefreshingMixes,
        isBrowseLoading,
        handleRefreshMixes,
    };
}
