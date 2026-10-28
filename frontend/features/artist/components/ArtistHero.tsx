"use client";

import { Music } from "lucide-react";
import { Artist, ArtistSource, Album } from "../types";
import { ReactNode } from "react";
import { MetadataEditControls } from "@/components/MetadataEditControls";
import { getArtistDisplayData } from "@/hooks/useMetadataDisplay";
import type { ColorPalette } from "@/hooks/useImageColor";
import { useLanguage } from "@/lib/i18n/language-context";
import { formatStatsCount } from "@/features/stats/locale-format";
import { MusicDetailHero } from "@/components/ui/MusicDetailHero";

interface ArtistHeroProps {
    artist: Artist;
    source: ArtistSource | null;
    albums: Album[];
    heroImage: string | null;
    backgroundImage?: string | null;
    colors: ColorPalette | null;
    onReload: () => void;
    children?: ReactNode;
}

export function ArtistHero({
    artist, source, albums, heroImage, backgroundImage, colors, onReload, children,
}: ArtistHeroProps) {
    const { locale, t } = useLanguage();
    const displayData = getArtistDisplayData(artist);
    const ownedAlbums = albums.filter((a) => a.owned);

    return (
        <MusicDetailHero
            libraryHref="/collection?tab=artists"
            image={backgroundImage || heroImage}
            coverImage={heroImage}
            alt={displayData.name}
            colors={colors}
            tint="music"
            fallback={["#3d2a1e", "#1a1a1a"]}
            shape="circle"
            fallbackIcon={<Music className="w-16 h-16 text-[var(--text-muted)]" />}
            eyebrowDotClass="bg-type-artist"
            eyebrowLabel={t("Artist")}
            title={displayData.name}
            titleGap="gap-3"
            titleExtra={
                <MetadataEditControls
                    edited={displayData.hasUserOverrides}
                    editable={source === "library"}
                    type="artist"
                    id={artist.id}
                    currentData={{
                        name: displayData.name,
                        bio: displayData.summary ?? undefined,
                        genres: displayData.genres,
                        mbid: artist.mbid,
                        heroUrl: displayData.heroUrl ?? undefined,
                        _originalName: artist.name,
                        _originalBio: artist.summary ?? artist.bio,
                        _originalGenres: artist.genres ?? artist.tags ?? [],
                        _originalHeroUrl: artist.heroUrl ?? artist.image,
                        _hasUserOverrides: displayData.hasUserOverrides,
                    }}
                    onSave={async () => { await onReload(); }}
                />
            }
            meta={
                <>
                    {artist.listeners != null && artist.listeners > 0 && (
                        <span>{formatStatsCount(artist.listeners, locale)} {t("listeners")}</span>
                    )}
                    {albums.length > 0 && (
                        <>
                            {artist.listeners != null && artist.listeners > 0 && <span aria-hidden="true">{"\u2022"}</span>}
                            <span>{formatStatsCount(albums.length, locale)} {t(albums.length === 1 ? "album" : "albums")}</span>
                            {ownedAlbums.length > 0 && (
                                <>
                                    <span aria-hidden="true">{"\u2022"}</span>
                                    <span className="text-brand">{formatStatsCount(ownedAlbums.length, locale)} {t("owned")}</span>
                                </>
                            )}
                        </>
                    )}
                </>
            }
        >
            {children}
        </MusicDetailHero>
    );
}
