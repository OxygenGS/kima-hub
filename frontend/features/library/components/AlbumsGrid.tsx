"use client";

import { memo } from "react";
import { useDetailPrefetch } from "@/lib/detail-prefetch";
import { useLanguage } from "@/lib/i18n/language-context";
import { Album } from "../types";
import { EmptyState } from "@/components/ui/EmptyState";
import { CollectionGridSkeleton } from "./CollectionGridSkeleton";
import { MediaCard } from "@/components/cards/MediaCard";
import { Disc3, Play } from "lucide-react";
import { api } from "@/lib/api";
import { cascadeStyle } from "@/lib/motion";

interface AlbumsGridProps {
    albums: Album[];
    onPlay: (albumId: string) => Promise<void>;
    onDelete: (albumId: string, albumTitle: string) => void;
    /** The mood each album shares with its tracks, from the vibe map. */
    moodByKey?: Map<string, string>;
    isLoading?: boolean;
    gridKey?: number;
}

interface AlbumCardItemProps {
    album: Album;
    index: number;
    onPlay: (albumId: string) => Promise<void>;
    onDelete: (albumId: string, albumTitle: string) => void;
    moodKey?: string;
}

const AlbumCardItem = memo(
    function AlbumCardItem({
        album,
        index,
        onPlay,
        onDelete,
        moodKey,
    }: AlbumCardItemProps) {
        const { prefetchAlbum } = useDetailPrefetch();
        const { t } = useLanguage();

        return (
            <MediaCard
                href={`/album/${album.id}`}
                onPrefetch={() => prefetchAlbum(album.id)}
                title={album.title}
                subtitle={album.artist?.name}
                imageUrl={album.coverArt ? api.getCoverArtUrl(album.coverArt, 200) : null}
                fallbackIcon={Disc3}
                type="album"
                index={index}
                action={{ icon: Play, label: t("Play"), onClick: () => onPlay(album.id) }}
                moodKey={moodKey}
                onDelete={() => onDelete(album.id, album.title)}
            />
        );
    },
    (prevProps, nextProps) =>
        prevProps.album.id === nextProps.album.id &&
        prevProps.album.title === nextProps.album.title &&
        prevProps.album.artist?.name === nextProps.album.artist?.name &&
        prevProps.album.coverArt === nextProps.album.coverArt &&
        prevProps.moodKey === nextProps.moodKey &&
        prevProps.index === nextProps.index &&
        prevProps.onPlay === nextProps.onPlay &&
        prevProps.onDelete === nextProps.onDelete,
);

function AlbumsEmptyState() {
    const { t } = useLanguage();
    return <EmptyState icon={<Disc3 className="w-12 h-12" />} title={t("No albums yet")} description={t("Your library is empty. Sync your music to get started.")} />;
}

const AlbumsGrid = memo(function AlbumsGrid({
    albums,
    onPlay,
    onDelete,
    moodByKey,
    isLoading = false,
    gridKey,
}: AlbumsGridProps) {
    if (isLoading) {
        return (
            <CollectionGridSkeleton />
        );
    }

    if (albums.length === 0) {
        return <AlbumsEmptyState />;
    }


    return (
        <div
            key={gridKey}
            data-tv-section="library-albums"
            className="grid-media"
            style={cascadeStyle(albums.length)}
        >
            {albums.map((album, index) => (
                <AlbumCardItem
                    key={album.id}
                    album={album}
                    index={index}
                    onPlay={onPlay}
                    onDelete={onDelete}
                    moodKey={moodByKey?.get(album.id)}
                />
            ))}
        </div>
    );
});

export { AlbumsGrid };
