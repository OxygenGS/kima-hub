"use client";

import { useLanguage } from "@/lib/i18n/language-context";

/** Shape-stable music-card and track-row placeholders for the collection. */
export function CollectionGridSkeleton() {
    const { t } = useLanguage();
    return (
        <div role="status" aria-live="polite" aria-busy="true">
            <span className="sr-only">{t("Loading...")}</span>
            <div className="grid-media animate-pulse motion-reduce:animate-none" aria-hidden="true">
                {Array.from({ length: 8 }, (_, index) => (
                    <div key={index} data-turbo-skeleton-card className="space-y-2">
                        <div className="aspect-square rounded-lg bg-white/10 ring-1 ring-white/5" />
                        <div className="h-4 w-4/5 rounded bg-white/10" />
                        <div className="h-3 w-2/5 rounded bg-white/[0.07]" />
                    </div>
                ))}
            </div>
        </div>
    );
}

export function CollectionTracksSkeleton() {
    const { t } = useLanguage();
    return (
        <div role="status" aria-live="polite" aria-busy="true">
            <span className="sr-only">{t("Loading...")}</span>
            <div className="space-y-2 animate-pulse motion-reduce:animate-none" aria-hidden="true">
                {Array.from({ length: 8 }, (_, index) => (
                    <div key={index} data-turbo-skeleton-track className="flex items-center gap-3 rounded-lg border border-white/5 px-4 py-3">
                        <div className="h-5 w-7 shrink-0 rounded bg-white/10" />
                        <div className="h-11 w-11 shrink-0 rounded bg-white/10" />
                        <div className="min-w-0 flex-1 space-y-2">
                            <div className="h-4 w-2/3 max-w-[340px] rounded bg-white/10" />
                            <div className="h-3 w-1/3 max-w-[180px] rounded bg-white/[0.07]" />
                        </div>
                        <div className="h-3 w-10 shrink-0 rounded bg-white/10" />
                    </div>
                ))}
            </div>
        </div>
    );
}
