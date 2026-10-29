"use client";

import { MediaCard } from "@/components/cards/MediaCard";
import { Disc3, Play } from "lucide-react";
import { api } from "@/lib/api";
import type { Album } from "../types";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useLanguage } from "@/lib/i18n/language-context";
import { useQueryClient } from "@tanstack/react-query";
import { albumDetailQueryOptions } from "@/features/album/hooks/useAlbumData";

interface DiscographyProps {
    albums: Album[];
    onPlayAlbum: (albumId: string) => Promise<void>;
    sortBy: "year" | "dateAdded";
    onSortChange: (sortBy: "year" | "dateAdded") => void;
}

export function Discography({
    albums,
    onPlayAlbum,
    sortBy,
    onSortChange,
}: DiscographyProps) {
    const { t } = useLanguage();
    const queryClient = useQueryClient();
    if (!albums || albums.length === 0) {
        return null;
    }

    return (
        <section id="artist-discography" className="scroll-mt-28">
            <SectionHeader
                type="album"
                title={t("Discography")}
                action={
                    <select
                        aria-label={t("Sort by")}
                        value={sortBy}
                        onChange={(e) =>
                            onSortChange(e.target.value as "year" | "dateAdded")
                        }
                        className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-white text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)] focus:border-white/20 [&>option]:bg-[var(--bg-hover)] [&>option]:text-white"
                    >
                        <option value="year">{t("year (newest)")}</option>
                        <option value="dateAdded">{t("date added (recent)")}</option>
                    </select>
                }
            />
            <div
                data-tv-section="discography"
                className="grid-media"
            >
                {albums.map((album, index) => {
                    const subtitle = [
                        album.year,
                        album.trackCount && `${album.trackCount} ${t(album.trackCount === 1 ? "track" : "tracks")}`,
                    ]
                        .filter(Boolean)
                        .join(" • ");

                    return (
                        <MediaCard
                            key={album.id}
                            href={`/album/${album.id}`}
                            onPrefetch={() => {
                                void queryClient.prefetchQuery(albumDetailQueryOptions(album.id));
                            }}
                            imageUrl={album.coverArt ? api.getCoverArtUrl(album.coverArt, 300) : null}
                            title={album.title}
                            subtitle={subtitle}
                            fallbackIcon={Disc3}
                            type="album"
                            index={index}
                            action={{ icon: Play, label: t("Play"), onClick: () => onPlayAlbum(album.id) }}
                        />
                    );
                })}
            </div>
        </section>
    );
}
