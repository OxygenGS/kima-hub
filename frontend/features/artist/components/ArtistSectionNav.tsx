"use client";

import { useLanguage } from "@/lib/i18n/language-context";

/** Jump links follow real artist sections; never show a dead destination. */
interface ArtistSectionNavProps {
    hasBio: boolean;
    hasPopularTracks: boolean;
    hasOwnedAlbums: boolean;
    hasAvailableAlbums: boolean;
    hasSimilarArtists: boolean;
}

export function ArtistSectionNav({
    hasBio, hasPopularTracks, hasOwnedAlbums, hasAvailableAlbums, hasSimilarArtists,
}: ArtistSectionNavProps) {
    const { t } = useLanguage();
    const sections = [
        { id: "artist-about", title: t("About"), show: hasBio },
        { id: "artist-popular", title: t("Popular"), show: hasPopularTracks },
        { id: "artist-discography", title: t("Discography"), show: hasOwnedAlbums },
        { id: "artist-available", title: t("Albums Available"), show: hasAvailableAlbums },
        { id: "artist-similar", title: t("Fans Also Like"), show: hasSimilarArtists },
    ].filter((section) => section.show);

    // One section is already in view below the hero; adding navigation adds no value.
    if (sections.length < 2) return null;

    return (
        <nav className="page-shell py-4" aria-label={t("Jump to section")} data-tv-section="artist-section-navigation">
            <div className="flex items-center gap-3">
                <span className="t-label hidden shrink-0 sm:inline">{t("Jump to section")}</span>
                <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
                    {sections.map((section, index) => (
                        <a
                            key={section.id}
                            href={`#${section.id}`}
                            data-tv-card
                            data-tv-card-index={index}
                            className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-brand/40 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand motion-reduce:transition-none"
                        >
                            {section.title}
                        </a>
                    ))}
                </div>
            </div>
        </nav>
    );
}
