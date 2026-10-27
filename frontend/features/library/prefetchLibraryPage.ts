import type { QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys, type LibraryFilter, type SortOption } from "@/hooks/useQueries";
import type { Tab } from "./types";

export interface LibraryPrefetchTarget {
    tab: Tab;
    page: number;
    limit: number;
    sortBy: SortOption;
    filter: LibraryFilter;
}

/**
 * Warm only the library page the user is about to visit. These keys, query
 * functions and stale times intentionally match the mounted library hooks:
 * React Query reuses in-flight requests instead of duplicating the fetch.
 */
export async function prefetchLibraryPage(
    queryClient: QueryClient,
    { tab, page, limit, sortBy, filter }: LibraryPrefetchTarget,
): Promise<void> {
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1) return;
    const offset = (page - 1) * limit;
    const staleTime = 2 * 60 * 1000;

    if (tab === "artists") {
        await queryClient.prefetchQuery({
            queryKey: queryKeys.libraryArtists({ filter, sortBy, limit, offset }),
            queryFn: () => api.getArtists({ filter, sortBy, limit, offset }),
            staleTime,
        });
    } else if (tab === "albums") {
        await queryClient.prefetchQuery({
            queryKey: queryKeys.libraryAlbums({ filter, sortBy, limit, offset }),
            queryFn: () => api.getAlbums({ filter, sortBy, limit, offset }),
            staleTime,
        });
    } else {
        // Track browsing always means owned music, so its query has no filter.
        await queryClient.prefetchQuery({
            queryKey: queryKeys.libraryTracks({ sortBy, limit, offset }),
            queryFn: () => api.getTracks({ sortBy, limit, offset }),
            staleTime,
        });
    }
}
