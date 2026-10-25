import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/useQueries";
import { api } from "@/lib/api";
import { useDownloadContext } from "@/lib/download-context";
import { ArtistSource } from "../types";
import { useMemo, useEffect, useRef, useState } from "react";

/** Shared lookup for navigation prefetch and the artist screen. */
export async function fetchArtistDetails(id: string) {
    if (!id) throw new Error("Artist ID is required");
    try {
        return await api.getArtist(id);
    } catch (error) {
        // Only unknown artists should fall back to external discovery.
        // A slow/offline backend or an authorization failure is not a discovery request.
        if ((error as { status?: number }).status !== 404) throw error;
        try {
            return await api.getArtistDiscovery(id);
        } catch (discoveryError) {
            if ((discoveryError as { status?: number }).status === 404) return null;
            throw discoveryError;
        }
    }
}

export function useArtistData() {
    const params = useParams();
    const id = params.id as string;
    const { downloadStatus } = useDownloadContext();
    const prevActiveCountRef = useRef(downloadStatus.activeDownloads.length);

    // Use React Query - no polling needed, webhook events trigger refresh via download context
    const {
        data: artist,
        isLoading,
        isError,
        refetch,
    } = useQuery({
        queryKey: queryKeys.artist(id || ""),
        queryFn: () => fetchArtistDetails(id),
        enabled: !!id,
        staleTime: 10 * 60 * 1000,
        retry: (failures, error) => (error as { status?: number }).status !== 404 && failures < 1,
    });

    // Refetch when downloads complete (active count decreases)
    useEffect(() => {
        const currentActiveCount = downloadStatus.activeDownloads.length;
        if (
            prevActiveCountRef.current > 0 &&
            currentActiveCount < prevActiveCountRef.current
        ) {
            refetch();
        }
        prevActiveCountRef.current = currentActiveCount;
    }, [downloadStatus.activeDownloads.length, refetch]);

    // Determine source from the artist data (if it came from library or discovery)
    const source: ArtistSource | null = useMemo(() => {
        if (!artist) return null;
        return artist.id && !artist.id.includes("-") ? "library" : "discovery";
    }, [artist]);

    const [sortBy, setSortBy] = useState<"year" | "dateAdded">("year");

    // Preserve album-array identity across playback and download-status renders.
    // Sorting only needs to run when the fetched albums or sort selection changes.
    const albums = useMemo(() => !artist?.albums
        ? []
        : [...artist.albums].sort((a, b) => {
              if (sortBy === "dateAdded") {
                  if (!a.lastSynced && !b.lastSynced) return 0;
                  if (!a.lastSynced) return 1;
                  if (!b.lastSynced) return -1;
                  return (
                      new Date(b.lastSynced).getTime() -
                      new Date(a.lastSynced).getTime()
                  );
              } else {
                  if (a.year == null && b.year == null) return 0;
                  if (a.year == null) return 1;
                  if (b.year == null) return -1;
                  return b.year - a.year;
              }
          }), [artist?.albums, sortBy]);

    return {
        artist,
        albums,
        loading: isLoading,
        error: isError,
        source,
        sortBy,
        setSortBy,
        reloadArtist: refetch,
    };
}
