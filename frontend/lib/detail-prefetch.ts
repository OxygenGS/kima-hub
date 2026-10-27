"use client";

import { useCallback } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/useQueries";
import { fetchArtistDetails } from "@/features/artist/hooks/useArtistData";
import { fetchAlbumDetails } from "@/features/album/hooks/useAlbumData";

// Match the detail pages' 10-minute cache window. Prefetch only on intent.
const DETAIL_STALE_MS = 10 * 60 * 1000;

export function prefetchArtistDetail(client: QueryClient, id: string): Promise<void> {
    if (!id) return Promise.resolve();
    return client.prefetchQuery({
        queryKey: queryKeys.artist(id),
        queryFn: () => fetchArtistDetails(id),
        staleTime: DETAIL_STALE_MS,
    });
}

export function prefetchAlbumDetail(client: QueryClient, id: string): Promise<void> {
    if (!id) return Promise.resolve();
    return client.prefetchQuery({
        queryKey: queryKeys.album(id),
        queryFn: () => fetchAlbumDetails(id),
        staleTime: DETAIL_STALE_MS,
    });
}

/**
 * Reuse the same prefetched album data for Play actions and page navigation.
 * fetchQuery waits for an in-flight prefetch rather than starting a second GET.
 */
export function getCachedAlbumDetails(client: QueryClient, id: string) {
    if (!id) return Promise.reject(new Error("Album ID is required"));
    return client.fetchQuery({
        queryKey: queryKeys.album(id),
        queryFn: () => fetchAlbumDetails(id),
        staleTime: DETAIL_STALE_MS,
    });
}

/** Shared artist/album navigation prefetch used by home, library and detail screens. */
export function useDetailPrefetch() {
    const client = useQueryClient();
    const prefetchArtist = useCallback((id: string) => {
        void prefetchArtistDetail(client, id);
    }, [client]);
    const prefetchAlbum = useCallback((id: string) => {
        void prefetchAlbumDetail(client, id);
    }, [client]);
    return { prefetchArtist, prefetchAlbum };
}
