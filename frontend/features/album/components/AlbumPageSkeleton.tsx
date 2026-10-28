"use client";

import { useLanguage } from "@/lib/i18n/language-context";
import { MusicDetailHeroSkeleton } from "@/components/ui/MusicDetailHero";

/** Accessible placeholder sharing the loaded album hero's layout. */
export function AlbumPageSkeleton() {
    const { t } = useLanguage();
    return (
        <div className="min-h-screen bg-[var(--bg-primary)]" role="status" aria-live="polite" aria-busy="true">
            <span className="sr-only">{t("Loading...")}</span>
            <div className="animate-pulse motion-reduce:animate-none" aria-hidden="true">
                <MusicDetailHeroSkeleton shape="square" />
                <div className="page-shell py-6 space-y-5">
                    {Array.from({ length: 7 }, (_, i) => (
                        <div key={i} className="flex items-center gap-4">
                            <div className="h-4 w-5 rounded bg-white/10" />
                            <div className="w-10 h-10 rounded bg-white/10 shrink-0" />
                            <div className="flex-1 min-w-0 space-y-2">
                                <div className="h-4 w-3/5 max-w-[320px] rounded bg-white/10" />
                                <div className="h-3 w-1/3 max-w-[170px] rounded bg-white/[0.07]" />
                            </div>
                            <div className="h-3 w-10 rounded bg-white/10" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
