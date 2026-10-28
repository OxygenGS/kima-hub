"use client";

import { useLanguage } from "@/lib/i18n/language-context";
import { MusicDetailHeroSkeleton } from "@/components/ui/MusicDetailHero";

/** Shares the loaded hero's content-width layout; navigation remains available. */
export function ArtistPageSkeleton() {
    const { t } = useLanguage();
    return (
        <div className="min-h-screen bg-[var(--bg-primary)]" role="status" aria-live="polite" aria-busy="true">
            <span className="sr-only">{t("Loading artist...")}</span>
            <div aria-hidden="true" className="animate-pulse motion-reduce:animate-none">
                <MusicDetailHeroSkeleton shape="circle" />
                <div className="page-shell py-6 space-y-8">
                    <section className="space-y-4">
                        <div className="h-5 w-28 rounded bg-white/15" />
                        <div className="space-y-3">
                            {Array.from({ length: 4 }, (_, i) => (
                                <div key={i} className="flex items-center gap-4">
                                    <div className="w-6 h-4 rounded bg-white/10" />
                                    <div className="h-10 w-10 shrink-0 rounded bg-white/10" />
                                    <div className="min-w-0 flex-1 space-y-2">
                                        <div className="h-4 w-2/3 max-w-[340px] rounded bg-white/10" />
                                        <div className="h-3 w-1/3 max-w-[180px] rounded bg-white/[0.07]" />
                                    </div>
                                    <div className="h-3 w-10 rounded bg-white/10" />
                                </div>
                            ))}
                        </div>
                    </section>
                    <section className="space-y-4">
                        <div className="h-5 w-36 rounded bg-white/15" />
                        <div className="grid-media">
                            {Array.from({ length: 4 }, (_, i) => (
                                <div key={i} className="space-y-2">
                                    <div className="aspect-square rounded-2xl bg-white/10" />
                                    <div className="h-4 w-3/4 rounded bg-white/10" />
                                    <div className="h-3 w-1/3 rounded bg-white/[0.07]" />
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
