"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Library, Sparkles, BookOpen, Mic, ListMusic } from "lucide-react";
import { cn } from "@/utils/cn";
import { useLanguage } from "@/lib/i18n/language-context";
import type { TranslationKey } from "@/lib/i18n/translations";
import { useIsMobile, useIsTablet } from "@/hooks/useMediaQuery";

const navigationItems = [
    {
        name: "Collection",
        href: "/collection",
        icon: Library,
        matchPattern: "/collection"
    },
    {
        name: "Vibe",
        href: "/vibe",
        icon: Sparkles,
        matchPattern: "/vibe"
    },
    {
        name: "Audiobooks",
        href: "/audiobooks",
        icon: BookOpen,
        matchPattern: "/audiobooks"
    },
    {
        name: "Podcasts",
        href: "/podcasts",
        icon: Mic,
        matchPattern: "/podcasts"
    },
    {
        name: "Playlists",
        href: "/playlists",
        icon: ListMusic,
        matchPattern: "/playlist" // Matches both /playlists and /playlist/[id]
    },
];

export function BottomNavigation() {
    const pathname = usePathname();
    const { t } = useLanguage();
    const isMobile = useIsMobile();
    const isTablet = useIsTablet();
    const isMobileOrTablet = isMobile || isTablet;

    // Only render on mobile/tablet
    if (!isMobileOrTablet) return null;

    return (
        <nav
            className="fixed bottom-0 left-0 right-0 z-(--z-nav) bg-[var(--bg-primary)] border-t border-white/10"
            role="navigation"
            aria-label={t("Main navigation")}
            style={{
                paddingBottom: 'var(--standalone-safe-area-bottom, 0px)'
            }}
        >
            <div className="flex items-center justify-around h-14">
                {navigationItems.map((item) => {
                    const isActive = pathname.startsWith(item.matchPattern);
                    const Icon = item.icon;

                    return (
                        <Link
                            key={t(item.name as TranslationKey)}
                            href={item.href}
                            className={cn(
                                "flex flex-col items-center justify-center flex-1 h-full py-2 transition-colors duration-200",
                                isActive
                                    ? "text-brand"
                                    : "text-[var(--text-muted)] active:text-[var(--text-primary)]"
                            )}
                            aria-label={t(item.name as TranslationKey)}
                            aria-current={isActive ? "page" : undefined}
                        >
                            <Icon
                                className={cn(
                                    "w-5 h-5 mb-1 transition-all duration-200",
                                    isActive && "text-brand"
                                )}
                                strokeWidth={isActive ? 2.5 : 2}
                            />
                            <span
                                className={cn(
                                    "text-micro tracking-wide transition-colors duration-200",
                                    isActive ? "font-semibold" : "font-medium"
                                )}
                            >
                                {item.name}
                            </span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
