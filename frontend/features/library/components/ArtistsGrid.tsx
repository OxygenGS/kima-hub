"use client";

import { memo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/useQueries";
import { fetchArtistDetails } from "@/features/artist/hooks/useArtistData";
import { useLanguage } from "@/lib/i18n/language-context";
import { Music, Play } from "lucide-react";
import { Artist } from "../types";
import { EmptyState } from "@/components/ui/EmptyState";
import { api } from "@/lib/api";
import { GradientSpinner } from "@/components/ui/GradientSpinner";
import { MediaCard } from "@/components/cards/MediaCard";
import { cascadeStyle } from "@/lib/motion";
import { plural } from "@/lib/format";

interface ArtistsGridProps {
    artists: Artist[];
    onPlay: (artistId: string) => Promise<void>;
    onDelete: (artistId: string, artistName: string) => void;
    /** The mood each artist shares with their tracks, from the vibe map. */
    moodByKey?: Map<string, string>;
    isLoading?: boolean;
    gridKey?: number;
}

interface ArtistCardItemProps {
    artist: Artist;
    index: number;
    onPlay: (artistId: string) => Promise<void>;
    onDelete: (artistId: string, artistName: string) => void;
    moodKey?: string;
}

const ArtistCardItem = memo(
    function ArtistCardItem({
        artist,
        index,
        onPlay,
        onDelete,
        moodKey,
    }: ArtistCardItemProps) {
        const queryClient = useQueryClient();
        const { t } = useLanguage();
        const prefetchArtist = () => {
            void queryClient.prefetchQuery({
                queryKey: queryKeys.artist(artist.id),
                queryFn: () => fetchArtistDetails(artist.id),
                staleTime: 10 * 60 * 1000,
            });
        };
        return (
            <MediaCard
                href={`/artist/${artist.id}`}
                onPrefetch={prefetchArtist}
                title={artist.name}
                subtitle={plural(artist.albumCount || 0, "album")}
                imageUrl={artist.coverArt ? api.getCoverArtUrl(artist.coverArt, 200) : null}
                fallbackIcon={Music}
                type="artist"
                index={index}
                action={{ icon: Play, label: t("Play"), onClick: () => onPlay(artist.id) }}
                moodKey={moodKey}
                onDelete={() => onDelete(artist.id, artist.name)}
            />
        );
    },
    (prevProps, nextProps) =>
        prevProps.artist.id === nextProps.artist.id &&
        prevProps.artist.name === nextProps.artist.name &&
        prevProps.artist.albumCount === nextProps.artist.albumCount &&
        prevProps.artist.coverArt === nextProps.artist.coverArt &&
        prevProps.moodKey === nextProps.moodKey &&
        prevProps.index === nextProps.index &&
        prevProps.onPlay === nextProps.onPlay &&
        prevProps.onDelete === nextProps.onDelete,
);

function ArtistsEmptyState() {
    const { t } = useLanguage();
    return <EmptyState icon={<Music className="w-12 h-12" />} title={t("No artists yet")} description={t("Your library is empty. Sync your music to get started.")} />;
}

const ArtistsGrid = memo(function ArtistsGrid({
    artists,
    onPlay,
    onDelete,
    moodByKey,
    isLoading = false,
    gridKey,
}: ArtistsGridProps) {
    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <GradientSpinner size="md" />
            </div>
        );
    }

    if (artists.length === 0) {
        return <ArtistsEmptyState />;
    }

    return (
        <div
            key={gridKey}
            data-tv-section="library-artists"
            className="grid-media"
            style={cascadeStyle(artists.length)}
        >
            {artists.map((artist, index) => (
                <ArtistCardItem
                    key={artist.id}
                    artist={artist}
                    index={index}
                    onPlay={onPlay}
                    onDelete={onDelete}
                    moodKey={moodByKey?.get(artist.id)}
                />
            ))}
        </div>
    );
});

export { ArtistsGrid };
