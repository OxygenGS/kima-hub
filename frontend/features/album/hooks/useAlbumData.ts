import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/useQueries";
import { api } from "@/lib/api";
import type { AlbumSource } from "../types";
import { useMemo } from "react";

/** Shared request for both navigation intent and the album detail screen. */
export async function fetchAlbumDetails(id: string) {
    if (!id) throw new Error("Album ID is required");
    try {
        return await api.getAlbum(id);
    } catch (error) {
        // Only a genuine missing library album enters the discovery route.
        if ((error as { status?: number }).status !== 404) throw error;
        return api.getAlbumDiscovery(id);
    }
}

export function useAlbumData(albumId?: string) {
    const params = useParams();
    const id = albumId || (params.id as string);

    const {
        data: album,
        isLoading,
        error,
        refetch,
    } = useQuery({
        queryKey: queryKeys.album(id || ""),
        queryFn: () => fetchAlbumDetails(id),
        enabled: !!id,
        staleTime: 10 * 60 * 1000,
        retry: 1,
    });

    const source: AlbumSource | null = useMemo(() => {
        if (!album) return null;
        return album.owned === true ? "library" : "discovery";
    }, [album]);

    return {
        album,
        loading: isLoading,
        notFound: (error as { status?: number } | null)?.status === 404,
        failed: !!error,
        source,
        reloadAlbum: refetch,
    };
}
