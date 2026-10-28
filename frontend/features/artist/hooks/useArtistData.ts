import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/useQueries";
import { api } from "@/lib/api";
import { useDownloadContext } from "@/lib/download-context";
import { ArtistSource } from "../types";
import { useMemo, useEffect, useRef, useState, useCallback } from "react";

/** Shared full lookup for navigation prefetch and external discovery. */
export async function fetchArtistDetails(id: string) {
    if (!id) throw new Error("Artist ID is required");
    try {
        return await api.getArtist(id);
    } catch (error) {
        if ((error as { status?: number }).status !== 404) throw error;
        try {
            return await api.getArtistDiscovery(id);
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
        queryKey: [...queryKeys.artist(id || ""), "overview"],
        queryFn: ({ signal }) => fetchArtistOverview(id, signal),
        enabled: !!id && !full.data,
        staleTime: 10 * 60 * 1000,
        retry: false,
    });
    const artist = full.data ?? overview.data;
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

    const source: ArtistSource | null = useMemo(() => {
        if (!artist) return null;
        if (overview.data) return "library";
        return artist.id && !artist.id.includes("-") ? "library" : "discovery";
    }, [artist, overview.data]);
    const [sortBy, setSortBy] = useState<"year" | "dateAdded">("year");
    const albums = useMemo(() => !artist?.albums ? [] : [...artist.albums].sort((a, b) => {
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
    }), [artist?.albums, sortBy]);

    return {
        artist, albums,
        loading: !artist && (full.isLoading || overview.isLoading),
        error: !artist && full.isError && !overview.isLoading,
        source, sortBy, setSortBy, reloadArtist,
    };
}
