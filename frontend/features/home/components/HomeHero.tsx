"use client";

import Link from "next/link";
import { ArrowUpRight, Disc3, Library, Music2, Radio, Sparkles } from "lucide-react";
import { CachedImage } from "@/components/ui/CachedImage";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/language-context";
import { getHomeCopy } from "../homeCopy";
import type { Artist } from "../types";
import styles from "./HomeHero.module.css";

const getGreeting = (): "Good morning" | "Good afternoon" | "Good evening" => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
};

/** Uses the existing Home response: no new requests, playback state or permission rules. */
export function HomeHero({ artists = [] }: { artists?: Artist[] }) {
    const { t, locale } = useLanguage();
    const copy = getHomeCopy(locale);
    const seen = new Set<string>();
    const featured = artists.filter((artist) => {
        if (!artist.id || seen.has(artist.id)) return false;
        seen.add(artist.id);
        return true;
    }).slice(0, 3);
    const shortcuts = [
        { href: "/collection?tab=albums", title: copy.albums, description: copy.albumsDescription, Icon: Disc3 },
        { href: "/collection?tab=tracks", title: copy.tracks, description: copy.tracksDescription, Icon: Music2 },
        { href: "/vibe", title: copy.vibe, description: copy.vibeDescription, Icon: Sparkles },
        { href: "/radio", title: copy.radio, description: copy.radioDescription, Icon: Radio },
    ];

    return (
        <div className={styles.home}>
            <section className={styles.hero} aria-labelledby="home-heading">
                <div className={styles.copy}>
                    <p className={styles.eyebrow}><span aria-hidden="true" />{copy.eyebrow}</p>
                    <p className={styles.greeting}>{t(getGreeting())}</p>
                    <h1 id="home-heading" className={styles.heading}>{copy.headline}</h1>
                    <p className={styles.description}>{copy.description}</p>
                    <div className={styles.actions}>
                        <Link href="/collection" prefetch={false} className={styles.primary}>
                            <Library aria-hidden="true" size={18} />{copy.collection}
                        </Link>
                        <Link href="/discover" prefetch={false} className={styles.secondary}>
                            {copy.discover}<ArrowUpRight aria-hidden="true" size={18} />
                        </Link>
                    </div>
                </div>
                <div className={styles.shelf}>
                    {featured.length > 0 ? (
                        <>
                            <p className={styles.shelfLabel}>{copy.shelf}</p>
                            <div className={styles.sleeves} data-count={featured.length}>
                                {featured.map((artist, index) => (
                                    <Link
                                        key={artist.id}
                                        href={`/artist/${encodeURIComponent(artist.id)}`}
                                        prefetch={false}
                                        className={styles.sleeve}
                                    >
                                        <div className={styles.artwork}>
                                            <Music2 aria-hidden="true" size={38} className={styles.fallback} />
                                            {artist.coverArt && (
                                                <CachedImage
                                                    src={api.getCoverArtUrl(artist.coverArt, 300)}
                                                    alt=""
                                                    fill
                                                    sizes="(max-width: 640px) 28vw, 170px"
                                                    loading={index === 0 ? "eager" : "lazy"}
                                                    className={styles.cover}
                                                />
                                            )}
                                        </div>
                                        <span className={styles.artistName} title={artist.name}>{artist.name}</span>
                                    </Link>
                                ))}
                            </div>
                        </>
                    ) : (
                        <div className={styles.empty}>
                            <div className={styles.record} aria-hidden="true"><span /></div>
                            <p className={styles.emptyTitle}>{copy.emptyTitle}</p>
                            <p className={styles.emptyDescription}>{copy.emptyDescription}</p>
                        </div>
                    )}
                </div>
            </section>
            <nav className={styles.shortcuts} aria-label={copy.shortcuts}>
                {shortcuts.map(({ href, title, description, Icon }) => (
                    <Link key={href} href={href} prefetch={false} className={styles.shortcut}>
                        <span className={styles.shortcutIcon}><Icon size={21} aria-hidden="true" /></span>
                        <span className={styles.shortcutCopy}>
                            <span className={styles.shortcutTitle}>{title}</span>
                            <span className={styles.shortcutDescription}>{description}</span>
                        </span>
                        <ArrowUpRight className={styles.shortcutArrow} size={17} aria-hidden="true" />
                    </Link>
                ))}
            </nav>
        </div>
    );
}
