import { useLanguage } from "@/lib/i18n/language-context";
import { Check, Disc3 } from "lucide-react";
import { api } from "@/lib/api";
import { SimilarAlbum } from "../types";
import { MediaCard } from "@/components/cards/MediaCard";
import { SectionHeader } from "@/components/ui/SectionHeader";

interface SimilarAlbumsProps {
    similarAlbums: SimilarAlbum[];
}

export function SimilarAlbums({ similarAlbums }: SimilarAlbumsProps) {
    const { t } = useLanguage();
    return (
        <section>
            <SectionHeader type="album" title={t("More Like This")} />
            <div data-tv-section="similar-albums" className="grid-media">
                {similarAlbums.map((album, index) => (
                    <MediaCard
                        key={album.id}
                        href={`/album/${album.id}`}
                        imageUrl={album.coverArt ? api.getCoverArtUrl(album.coverArt, 300) : album.coverUrl}
                        title={album.title}
                        subtitle={album.artist?.name}
                        fallbackIcon={Disc3}
                        type="album"
                        index={index}
                        badge={
                            album.owned && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-success/20 border border-success/30 rounded-full text-xs font-medium text-success">
                                    <Check className="w-3 h-3" />
                                    {t("Owned")}
                                </span>
                            )
                        }
                    />
                ))}
            </div>
        </section>
    );
}
