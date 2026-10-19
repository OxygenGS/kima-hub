"use client";

import { BookOpen } from "lucide-react";
import { api } from "@/lib/api";
import { Audiobook } from "../types";
import { HorizontalCarousel, CarouselItem } from "@/components/ui/HorizontalCarousel";
import { cascadeStyle } from "@/lib/motion";
import { memo } from "react";
import { MediaCard } from "@/components/cards/MediaCard";
import { useLanguage } from "@/lib/i18n/language-context";

interface AudiobooksGridProps {
    audiobooks: Audiobook[];
}

const AudiobooksGrid = memo(function AudiobooksGrid({ audiobooks }: AudiobooksGridProps) {
    const { t } = useLanguage();
    return (
        <HorizontalCarousel style={cascadeStyle(audiobooks.length)}>
            {audiobooks.map((audiobook, index) => (
                <CarouselItem key={audiobook.id}>
                    <MediaCard
                        href={`/audiobooks/${audiobook.id}`}
                        title={audiobook.title}
                        subtitle={audiobook.author || t("Audiobook")}
                        imageUrl={audiobook.coverUrl ? api.getCoverArtUrl(audiobook.coverUrl, 300) : null}
                        fallbackIcon={BookOpen}
                        type="audiobook"
                        index={index}
                        sizes="180px"
                        className="mx-1"
                    />
                </CarouselItem>
            ))}
        </HorizontalCarousel>
    );
});

export { AudiobooksGrid };
