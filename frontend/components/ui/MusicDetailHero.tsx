"use client";

import Link from "next/link";
import { ChevronRight, Library } from "lucide-react";
import type { ComponentProps } from "react";
import type { MediaHero } from "./MediaHero";
import { HeroBackdrop } from "./HeroBackdrop";
import { CachedImage } from "./CachedImage";
import { useLanguage } from "@/lib/i18n/language-context";
import styles from "./MusicDetailHero.module.css";

type MusicDetailHeroProps = ComponentProps<typeof MediaHero> & {
    /** Existing collection destination, not a new data request. */
    libraryHref: "/collection?tab=artists" | "/collection?tab=albums";
};

/** Music-only presentation: existing metadata, callbacks and low-res backdrop stay intact. */
export function MusicDetailHero({
    image, coverImage, alt, colors, tint, fallback, shape, fallbackIcon,
    eyebrowDotClass, eyebrowLabel, title, titleExtra, meta, metaExtra, children,
    libraryHref,
}: MusicDetailHeroProps) {
    const { t } = useLanguage();
    // Explicit null means there is no portrait/cover; do not use the backdrop as one.
    const cover = coverImage === undefined ? image : coverImage;

    return (
        <div className={styles.shell} data-music-detail={shape === "circle" ? "artist" : "album"}>
            <nav className={styles.breadcrumb} aria-label={t("Collection")}>
                <Link href={libraryHref} prefetch={false}>
                    <Library size={15} aria-hidden="true" />{t("Collection")}
                </Link>
                <ChevronRight size={14} aria-hidden="true" />
                <span>{eyebrowLabel}</span>
            </nav>
            <header className={styles.hero}>
                <div className={styles.backdrop} aria-hidden="true">
                    <HeroBackdrop image={image} alt="" colors={colors} tint={tint} fallback={fallback} />
                </div>
                <div className={styles.content}>
                    <div className={styles.artwork} data-shape={shape}>
                        <div className={styles.fallback} aria-hidden="true">{fallbackIcon}</div>
                        {cover && (
                            <CachedImage
                                src={cover}
                                alt={alt}
                                fill
                                sizes="(max-width: 639px) 160px, 240px"
                                className={styles.cover}
                                priority
                            />
                        )}
                    </div>
                    <div className={styles.info}>
                        <p className={styles.eyebrow}>
                            <span className={eyebrowDotClass} aria-hidden="true" />{eyebrowLabel}
                        </p>
                        <div className={styles.titleRow}>
                            <h1 className={styles.title}>{title}</h1>
                            {titleExtra && <div className={styles.edit}>{titleExtra}</div>}
                        </div>
                        <div className={styles.meta}>{meta}</div>
                        {metaExtra && <div className={styles.metaExtra}>{metaExtra}</div>}
                    </div>
                </div>
                {children && <div className={styles.actions}>{children}</div>}
            </header>
        </div>
    );
}

/** Uses the same content-width breakpoints as the loaded artist and album hero. */
export function MusicDetailHeroSkeleton({ shape }: { shape: "circle" | "square" }) {
    return (
        <div className={styles.shell} aria-hidden="true">
            <div className={styles.breadcrumb}><span className={styles.skeletonCrumb} /></div>
            <div className={styles.hero}>
                <div className={styles.content}>
                    <div className={`${styles.artwork} ${styles.skeletonArt}`} data-shape={shape} />
                    <div className={styles.info}>
                        <div className={styles.skeletonEyebrow} />
                        <div className={styles.skeletonTitle} />
                        <div className={styles.skeletonMeta} />
                    </div>
                </div>
                <div className={styles.actions}>
                    <div className={styles.skeletonActions}>
                        <span /><span /><span />
                    </div>
                </div>
            </div>
        </div>
    );
}
