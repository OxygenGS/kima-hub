"use client";

import { useState, useEffect, useRef } from "react";
import { Album, ArtistSource } from "../types";
import { MediaCard } from "@/components/cards/MediaCard";
import { Disc3, Download } from "lucide-react";
import { api } from "@/lib/api";
import { isMbid } from "@/lib/mbid";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useMusicPermissions } from "@/lib/auth-context";
import { useLanguage } from "@/lib/i18n/language-context";

interface AvailableAlbumsProps {
    albums: Album[];
    source: ArtistSource | null;
    onDownloadAlbum: (album: Album) => void;
    isPendingDownload: (mbid: string) => boolean;
}

/**
 * Only resolve uncached covers near the viewport. The backend may have to
 * consult external artwork services, so eager requests for every discography
 * card add unnecessary work to the slowest artist pages.
 * Browsers without IntersectionObserver retain the previous eager behavior.
 */
function useNearViewport(enabled: boolean) {
    const targetRef = useRef<HTMLDivElement>(null);
    const [nearViewport, setNearViewport] = useState(false);

    useEffect(() => {
        if (!enabled || nearViewport) return;
        const target = targetRef.current;
        if (!target || typeof IntersectionObserver === "undefined") {
            setNearViewport(true);
            return;
        }

        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
                setNearViewport(true);
                observer.disconnect();
            }
        }, { rootMargin: "300px 0px" });
        observer.observe(target);
        return () => observer.disconnect();
    }, [enabled, nearViewport]);

    return { targetRef, nearViewport };
}

// Component to handle lazy-loading cover art for albums without cached covers
function LazyAlbumCard({
    album,
    source,
    onDownloadAlbum,
    isPendingDownload,
    index,
}: {
    album: Album;
    source: ArtistSource | null;
    onDownloadAlbum: (album: Album) => void;
    isPendingDownload: (mbid: string) => boolean;
    index: number;
}) {
    const { canRequestAlbums } = useMusicPermissions();
    const { t } = useLanguage();
    const [coverArt, setCoverArt] = useState<string | null>(() => {
        if (source === "library" && album.coverArt) {
            return api.getCoverArtUrl(album.coverArt, 300);
        }
        if (album.coverUrl) {
            return api.getCoverArtUrl(album.coverUrl, 300);
        }
        return null;
    });
    const [fetchAttempted, setFetchAttempted] = useState(false);
    const mbid = [album.rgMbid, album.mbid].find(isMbid);
    const { targetRef, nearViewport } = useNearViewport(!coverArt && !fetchAttempted && !!mbid);

    useEffect(() => {
        if (coverArt || fetchAttempted || !mbid || !nearViewport) return;

        // Fetch cover art from our backend (which caches it)
        const fetchCover = async () => {
            try {
                const response = await api.request<{ coverUrl: string }>(
                    `/library/album-cover/${mbid}`
                );
                if (response.coverUrl) {
                    setCoverArt(api.getCoverArtUrl(response.coverUrl, 300));
                }
            } catch {
                // Cover not found, leave as null
            } finally {
                setFetchAttempted(true);
            }
        };

        // Only nearby covers request artwork. Cap staggering so album #200
        // is not delayed by 20 seconds when a user scrolls straight there.
        const timeoutId = setTimeout(fetchCover, (index % 6) * 100);
        return () => clearTimeout(timeoutId);
    }, [mbid, coverArt, fetchAttempted, nearViewport, index]);

    const albumMbid = album.rgMbid || album.mbid || "";

    const subtitleParts: string[] = [];
    if (album.year) subtitleParts.push(String(album.year));
    if (album.type) subtitleParts.push(album.type);
    const subtitle = subtitleParts.join(" • ");

    return (
        <div ref={targetRef} className="min-w-0">
        <MediaCard
            href={`/album/${album.id}`}
            imageUrl={coverArt}
            title={album.title}
            subtitle={subtitle}
            fallbackIcon={Disc3}
            type="album"
            index={index}
            action={canRequestAlbums ? {
                icon: Download,
                label: t("Request album"),
                onClick: () => onDownloadAlbum(album),
                busy: isPendingDownload(albumMbid),
            } : undefined}
        />
        </div>
    );
}

function AlbumGrid({
    albums,
    source,
    onDownloadAlbum,
    isPendingDownload,
}: Omit<AvailableAlbumsProps, "artistName">) {
    return (
        <div className="grid-media">
            {albums.map((album, index) => (
                <LazyAlbumCard
                    key={album.id}
                    album={album}
                    source={source}
                    onDownloadAlbum={onDownloadAlbum}
                    isPendingDownload={isPendingDownload}
                    index={index}
                />
            ))}
        </div>
    );
}

export function AvailableAlbums({
    albums,
    source,
    onDownloadAlbum,
    isPendingDownload,
}: AvailableAlbumsProps) {
    const { t } = useLanguage();
    if (!albums || albums.length === 0) {
        return null;
    }

    const studioAlbums = albums.filter(
        (album) => album.type?.toLowerCase() === "album"
    );
    const epsAndSingles = albums.filter(
        (album) => album.type?.toLowerCase() !== "album"
    );

    return (
        <>
            {studioAlbums.length > 0 && (
                <section>
                    <SectionHeader type="album" title={t("Albums Available")} />
                    <div data-tv-section="available-albums">
                        <AlbumGrid
                            albums={studioAlbums}
                            source={source}
                                    onDownloadAlbum={onDownloadAlbum}
                            isPendingDownload={isPendingDownload}
                        />
                    </div>
                </section>
            )}

            {epsAndSingles.length > 0 && (
                <section>
                    <SectionHeader type="album" title={t("Singles and EPs")} />
                    <div data-tv-section="available-eps-singles">
                        <AlbumGrid
                            albums={epsAndSingles}
                            source={source}
                                    onDownloadAlbum={onDownloadAlbum}
                            isPendingDownload={isPendingDownload}
                        />
                    </div>
                </section>
            )}
        </>
    );
}
