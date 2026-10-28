"use client";

import Link from "next/link";
import { BarChart3, BookOpen, Compass, Home, Library, ListMusic, Podcast, Radio, Search, Sparkles } from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";
import styles from "./DesktopNavigation.module.css";

const navigation = [
    { label: "Home", href: "/", Icon: Home, group: "library" },
    { label: "Collection", href: "/collection", Icon: Library, group: "library" },
    { label: "Queue", href: "/queue", Icon: ListMusic, group: "library" },
    { label: "Radio", href: "/radio", Icon: Radio, group: "explore" },
    { label: "Discovery", href: "/discover", Icon: Compass, group: "explore" },
    { label: "Vibe", href: "/vibe", Icon: Sparkles, group: "explore" },
    { label: "Browse", href: "/browse/playlists", Icon: Search, group: "explore" },
    { label: "Podcasts", href: "/podcasts", Icon: Podcast, group: "explore" },
    { label: "Audiobooks", href: "/audiobooks", Icon: BookOpen, group: "explore" },
    { label: "Stats", href: "/stats", Icon: BarChart3, group: "explore" },
] as const;

/** Segment boundaries prevent /radio-other from selecting /radio. */
export function isNavigationActive(pathname: string, href: string): boolean {
    const path = pathname.split(/[?#]/, 1)[0].replace(/\/$/, "") || "/";
    if (href === "/") return path === "/";
    if (href === "/collection" && /^\/(artist|album|track)\//.test(path)) return true;
    if (href === "/browse/playlists") return path === "/browse" || path.startsWith("/browse/");
    return path === href || path.startsWith(`${href}/`);
}

export function DesktopNavigation({
    pathname,
    audiobookshelfEnabled,
}: {
    pathname: string;
    audiobookshelfEnabled: boolean;
}) {
    const { t, locale } = useLanguage();
    const groups = [
        { id: "library", label: locale === "nl" ? "Jouw muziek" : "Your music" },
        { id: "explore", label: locale === "nl" ? "Verkennen" : "Explore" },
    ];

    return (
        <nav className={styles.navigation} aria-label={t("Main navigation")}>
            {groups.map((group) => (
                <div className={styles.group} key={group.id}>
                    <p className={styles.label}>{group.label}</p>
                    {navigation.filter((item) => item.group === group.id &&
                        (item.href !== "/audiobooks" || audiobookshelfEnabled)).map(({ label, href, Icon }) => (
                        <Link
                            key={href}
                            href={href}
                            prefetch={false}
                            aria-current={isNavigationActive(pathname, href) ? "page" : undefined}
                            className={styles.link}
                        >
                            <Icon className={styles.icon} size={19} strokeWidth={1.75} aria-hidden="true" />
                            <span>{t(label)}</span>
                            <span className={styles.activeDot} aria-hidden="true" />
                        </Link>
                    ))}
                </div>
            ))}
        </nav>
    );
}
