"use client";

import { Mic2 } from "lucide-react";
import { SimilarPodcast } from "../types";
import { api } from "@/lib/api";
import { MediaCard } from "@/components/cards/MediaCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useLanguage } from "@/lib/i18n/language-context";

interface SimilarPodcastsProps {
    podcasts: SimilarPodcast[];
}

export function SimilarPodcasts({ podcasts }: SimilarPodcastsProps) {
    const { t } = useLanguage();
    if (!podcasts || podcasts.length === 0) {
        return null;
    }

    return (
        <section>
            <SectionHeader title={t("Fans Also Like")} type="podcast" />
            <div data-tv-section="similar-podcasts" className="grid-media">
                {podcasts.map((podcast, index) => (
                    <MediaCard
                        key={podcast.id}
                        href={`/podcasts/${podcast.id}`}
                        imageUrl={podcast.coverUrl ? api.getCoverArtUrl(podcast.coverUrl, 300) : null}
                        title={podcast.title}
                        subtitle={podcast.author}
                        fallbackIcon={Mic2}
                        type="podcast"
                        index={index}
                    />
                ))}
            </div>
        </section>
    );
}
