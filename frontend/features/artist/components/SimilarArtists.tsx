"use client";
import { useLanguage } from "@/lib/i18n/language-context";

import { SimilarArtist } from "../types";
import { Music, Library } from "lucide-react";

import { api } from "@/lib/api";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { MediaCard } from "@/components/cards/MediaCard";
import { useQueryClient } from "@tanstack/react-query";
import { artistOverviewQueryOptions } from "@/features/artist/hooks/useArtistData";

interface SimilarArtistsProps {
    similarArtists: SimilarArtist[];
}

export function SimilarArtists({ similarArtists }: SimilarArtistsProps) {
    const { t } = useLanguage();
    const queryClient = useQueryClient();
    if (!similarArtists || similarArtists.length === 0) {
        return null;
    }

    return (
        <section id="artist-similar" className="scroll-mt-28">
            <SectionHeader type="artist" title={t("Fans Also Like")} />
            <div
                data-tv-section="similar-artists"
                className="grid-media"
            >
                {similarArtists.map((artist, index) => {
                    const rawImage = artist.coverArt || artist.image;
                    const imageUrl = rawImage
                        ? api.getCoverArtUrl(rawImage, 300)
                        : null;
                    const matchPercentage = artist.weight
                        ? Math.round(artist.weight * 100)
                        : null;

                    const navigationId = artist.inLibrary
                        ? artist.id
                        : artist.mbid || artist.id;

                    const libraryLine =
                        artist.ownedAlbumCount && artist.ownedAlbumCount > 0
                            ? `${artist.ownedAlbumCount} ${artist.ownedAlbumCount === 1 ? t("album") : t("albums")} ${t("in library")}`
                            : t("Artist");

                    return (
                        <MediaCard
                            key={artist.id || artist.name}
                            href={`/artist/${navigationId}`}
                            onPrefetch={artist.inLibrary && navigationId ? () => {
                                void queryClient.prefetchQuery(artistOverviewQueryOptions(navigationId));
                            } : undefined}
                            title={artist.name}
                            subtitle={matchPercentage !== null ? `${libraryLine} · ${matchPercentage}% ${t("match")}` : libraryLine}
                            imageUrl={imageUrl}
                            fallbackIcon={Music}
                            type="artist"
                            index={index}
                            corner={
                                artist.inLibrary && (
                                    <span className="block bg-brand rounded-full p-1" title={t("in your library")}>
                                        <Library className="w-3 h-3 text-black" />
                                    </span>
                                )
                            }
                        />
                    );
                })}
            </div>
        </section>
    );
}
