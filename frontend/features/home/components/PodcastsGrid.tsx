"use client";

import { Mic2 } from "lucide-react";
import { Podcast } from "../types";
import { memo } from "react";
import { HorizontalCarousel, CarouselItem } from "@/components/ui/HorizontalCarousel";
import { cascadeStyle } from "@/lib/motion";
import { MediaCard } from "@/components/cards/MediaCard";
import { coverArtUrl } from "@/lib/cover-art";
import { useLanguage } from "@/lib/i18n/language-context";

interface PodcastsGridProps {
    podcasts: Podcast[];
}

const podcastCover = (podcast: Podcast): string | null =>
    coverArtUrl(podcast.coverUrl || podcast.coverArt || podcast.imageUrl);

const PodcastsGrid = memo(function PodcastsGrid({
    podcasts,
}: PodcastsGridProps) {
    const { t } = useLanguage();
    return (
        <HorizontalCarousel style={cascadeStyle(podcasts.length)}>
            {podcasts.map((podcast, index) => (
                <CarouselItem key={podcast.id}>
                    <MediaCard
                        href={`/podcasts/${podcast.id}`}
                        title={podcast.title}
                        subtitle={podcast.author || t("Podcast")}
                        imageUrl={podcastCover(podcast)}
                        fallbackIcon={Mic2}
                        type="podcast"
                        index={index}
                        sizes="180px"
                        className="mx-1"
                    />
                </CarouselItem>
            ))}
        </HorizontalCarousel>
    );
});

export { PodcastsGrid };
