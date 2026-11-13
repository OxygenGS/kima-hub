import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/useQueries";
import { api } from "@/lib/api";
import { useDownloadContext } from "@/lib/download-context";
import { ArtistSource } from "../types";
import { useMemo, useEffect, useRef, useState, useCallback } from "react";

/**
 * The API route that resolved the artist is the only reliable indication of
 * whether it belongs to the library. Local IDs can contain dashes/UUIDs, and
 * external identifiers can have many shapes. Keep this as frontend-only
 * metadata on the cached response; it is never written back to the server.
 */
type ArtistWithOrigin = { __kimaArtistOrigin?: ArtistSource };

export function resolveArtistSource(
    full: ArtistWithOrigin | null | undefined,
    overview: unknown,
): ArtistSource | null {
    if (full?.__kimaArtistOrigin === "library" || full?.__kimaArtistOrigin === "discovery") {
        return full.__kimaArtistOrigin;
    }
    // Partial overview is fetched only from the authenticated local library.
    // If neither response proves the origin, do not guess from the ID format.
    return overview ? "library" : null;
}

/** Shared full lookup for navigation prefetch and external discovery. */
export async function fetchArtistDetails(id: string) {
    if (!id) throw new Error("Artist ID is required");
    try {
        const artist = await api.getArtist(id);
        return { ...artist, __kimaArtistOrigin: "library" as const };
    } catch (error) {
        if ((error as { status?: number }).status !== 404) throw error;
        try {
            const artist = await api.getArtistDiscovery(id);
            return { ...artist, __kimaArtistOrigin: "discovery" as const };
        } catch (discoveryError) {
            if ((discoveryError as { status?: number }).status === 404) return null;
            throw discoveryError;
        }
    }
}

export async function fetchArtistOverview(id: string, signal?: AbortSignal) {
    if (!id) throw new Error("Artist ID is required");
    try {
        return await api.request<Awaited<ReturnType<typeof api.getArtist>>>(
            `/library/artists/${encodeURIComponent(id)}/overview`, { signal, silent404: true },
        );
    } catch (error) {
        // Discovery is owned by the full query; do not launch it a second time.
        if ((error as { status?: number }).status === 404) return null;
        throw error;
    }
}

/** Shared, local-only first paint for intent prefetch and artist navigation. */
export function artistOverviewQueryOptions(id: string) {
    return {
        queryKey: [...queryKeys.artist(id), "overview"] as const,
        queryFn: ({ signal }: { signal: AbortSignal }) => fetchArtistOverview(id, signal),
        staleTime: 10 * 60 * 1000,
        retry: false,
    };
}

export function useArtistData() {
    const params = useParams();
    const id = params.id as string;
    const { downloadStatus } = useDownloadContext();
    const prevActiveCountRef = useRef(downloadStatus.activeDownloads.length);
    const full = useQuery({
        queryKey: queryKeys.artist(id || ""),
        queryFn: () => fetchArtistDetails(id),
        enabled: !!id,
        staleTime: 10 * 60 * 1000,
        retry: (failures, error) => (error as { status?: number }).status !== 404 && failures < 1,
    });
    const overview = useQuery({
        // Never store the partial snapshot under the complete detail cache key.
        ...artistOverviewQueryOptions(id || ""),
        enabled: !!id && !full.data,
    });
    const artist = full.data ?? overview.data;
    const loadingMore = !!overview.data && !full.data && full.isFetching;
    const moreDetailsFailed = !!overview.data && !full.data && full.isError;
    const refetchFull = full.refetch;
    const refetchOverview = overview.refetch;
    const reloadArtist = useCallback(
        () => Promise.all([refetchFull(), refetchOverview()]),
        [refetchFull, refetchOverview],
    );

    useEffect(() => {
        const count = downloadStatus.activeDownloads.length;
        if (prevActiveCountRef.current > 0 && count < prevActiveCountRef.current) {
            void reloadArtist();
        }
        prevActiveCountRef.current = count;
    }, [downloadStatus.activeDownloads.length, reloadArtist]);

    const source: ArtistSource | null = useMemo(
        () => resolveArtistSource(full.data, overview.data),
        [full.data, overview.data],
    );
    const [sortBy, setSortBy] = useState<"year" | "dateAdded">("year");
    const artistAlbums = artist?.albums;
    const albums = useMemo(() => !artistAlbums ? [] : [...artistAlbums].sort((a, b) => {
        if (sortBy === "dateAdded") {
            if (!a.lastSynced && !b.lastSynced) return 0;
            if (!a.lastSynced) return 1;
            if (!b.lastSynced) return -1;
            return new Date(b.lastSynced).getTime() - new Date(a.lastSynced).getTime();
        }
        if (a.year == null && b.year == null) return 0;
        if (a.year == null) return 1;
        if (b.year == null) return -1;
        return b.year - a.year;
    }), [artistAlbums, sortBy]);

    return {
        artist, albums,
        loading: !artist && (full.isLoading || overview.isLoading),
        error: !artist && full.isError && !overview.isLoading,
        source, sortBy, setSortBy, reloadArtist,
        loadingMore, moreDetailsFailed, retryMoreDetails: refetchFull,
    };
}
