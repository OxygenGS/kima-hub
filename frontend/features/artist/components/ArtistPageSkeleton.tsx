"use client";

import { useLanguage } from "@/lib/i18n/language-context";

/**
 * Matches the artist hero, actions and track/album layout while data loads.
 * Unlike a full-screen spinner, it leaves navigation in place and avoids a
 * large layout jump when the real artist replaces these placeholders.
 */
export function ArtistPageSkeleton() {
    const { t } = useLanguage();

    return (
        <div
            className="min-h-screen bg-[var(--bg-primary)]"
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <span className="sr-only">{t("Loading artist...")}</span>
            <div aria-hidden="true" className="animate-pulse motion-reduce:animate-none">
                <div className="relative overflow-hidden bg-gradient-to-b from-white/[0.06] to-transparent">
                    <div className="page-shell pt-8 sm:pt-16 pb-6">
                        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-end sm:gap-6">
                            <div className="w-32 h-32 sm:w-[140px] sm:h-[140px] md:w-[192px] md:h-[192px] shrink-0 rounded-full bg-white/10 ring-1 ring-white/10" />
                            <div className="w-full flex-1 min-w-0 space-y-3 pb-2">
                                <div className="h-3 w-20 rounded-full bg-white/10" />
                                <div className="h-8 md:h-11 w-3/4 max-w-[400px] rounded-lg bg-white/15" />
                                <div className="h-4 w-2/5 max-w-[220px] rounded bg-white/10" />
                            </div>
                        </div>
                        <div className="flex items-center gap-3 mt-7">
                            <div className="h-12 w-12 rounded-full bg-white/15" />
                            <div className="h-10 w-10 rounded-lg bg-white/10" />
                            <div className="h-10 w-10 rounded-lg bg-white/10" />
                        </div>
                    </div>
                </div>
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
                                    <div className="aspect-square rounded-lg bg-white/10" />
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
