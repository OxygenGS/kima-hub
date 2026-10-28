"use client";

import { useLanguage } from "@/lib/i18n/language-context";
import { Disc3 } from "lucide-react";
import Link from "next/link";
import { Album, AlbumSource } from "../types";
import { ReactNode } from "react";
import { MetadataEditControls } from "@/components/MetadataEditControls";
import { getAlbumDisplayData } from "@/hooks/useMetadataDisplay";
import type { ColorPalette } from "@/hooks/useImageColor";
import { formatDuration } from "@/lib/format";
import { MusicDetailHero } from "@/components/ui/MusicDetailHero";

interface AlbumHeroProps {
    album: Album;
    source: AlbumSource;
    coverUrl: string | null;
    /** Reuse the low-resolution palette image behind the full-resolution cover. */
    backgroundImage?: string | null;
    colors: ColorPalette | null;
    onReload: () => void;
    children?: ReactNode;
}

export function AlbumHero({
    album, source, coverUrl, backgroundImage, colors, onReload, children,
}: AlbumHeroProps) {
    const { t } = useLanguage();
    const displayData = getAlbumDisplayData(album);
    const totalDuration = album.duration ? formatDuration(album.duration) : "";
    const hasYear = displayData.year != null && displayData.year !== 0;
    const hasTracks = album.trackCount != null && album.trackCount > 0;

    return (
        <MusicDetailHero
            libraryHref="/collection?tab=albums"
            image={backgroundImage || coverUrl}
            coverImage={coverUrl}
            alt={displayData.title}
            colors={colors}
            tint="music"
            fallback={["#3d2a1e", "#1a1a1a"]}
            shape="square"
            fallbackIcon={<Disc3 className="w-16 h-16 text-[var(--text-muted)]" />}
            eyebrowDotClass="bg-type-album"
            eyebrowLabel={t("Album")}
            title={displayData.title}
            titleExtra={
                <MetadataEditControls
                    edited={displayData.hasUserOverrides}
                    editable={source === "library"}
                    type="album"
                    id={album.id}
                    currentData={{
                        title: displayData.title,
                        year: displayData.year ?? undefined,
                        genres: displayData.genres,
                        mbid: album.mbid,
                        coverUrl: displayData.coverUrl ?? undefined,
                        _originalTitle: album.title,
                        _originalYear: album.year,
                        _originalGenres: album.genre ? [album.genre] : [],
                        _originalCoverUrl: album.coverUrl,
                        _hasUserOverrides: displayData.hasUserOverrides,
                    }}
                    onSave={async () => { await onReload(); }}
                />
            }
            meta={
                <>
                    {album.artist && (
                        <Link href={`/artist/${album.artist.id}`} className="font-medium text-white hover:underline">
                            {album.artist.name}
                        </Link>
                    )}
                    {hasYear && (
                        <>
                            {album.artist && <span aria-hidden="true">{"\u2022"}</span>}
                            <span>{displayData.year}</span>
                        </>
                    )}
                    {hasTracks && (
                        <>
                            {(album.artist || hasYear) && <span aria-hidden="true">{"\u2022"}</span>}
                            <span>{album.trackCount} {t(album.trackCount === 1 ? "song" : "songs")}</span>
                        </>
                    )}
                    {totalDuration && (
                        <>
                            {(album.artist || hasYear || hasTracks) && <span aria-hidden="true">{"\u2022"}</span>}
                            <span>{totalDuration}</span>
                        </>
                    )}
                </>
            }
            metaExtra={album.genre ? (
                <span className="inline-block px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-[var(--text-secondary)]">
                    {album.genre}
                </span>
            ) : undefined}
        >
            {children}
        </MusicDetailHero>
    );
}
