"use client";

import { useLanguage } from "@/lib/i18n/language-context";

/** Accessible, layout-stable placeholder for the album hero and track list. */
export function AlbumPageSkeleton() {
    const { t } = useLanguage();

    return (
        <div className="min-h-screen bg-[var(--bg-primary)]" role="status" aria-live="polite" aria-busy="true">
            <span className="sr-only">{t("Loading...")}</span>
            <div className="animate-pulse motion-reduce:animate-none" aria-hidden="true">
                <div className="bg-gradient-to-b from-white/[0.06] to-transparent">
                    <div className="page-shell pt-8 sm:pt-16 pb-6">
                        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-end sm:gap-6">
                            <div className="w-32 h-32 sm:w-[140px] sm:h-[140px] md:w-[192px] md:h-[192px] shrink-0 rounded-[14px] bg-white/10 ring-1 ring-white/10" />
                            <div className="w-full min-w-0 flex-1 space-y-3 pb-2">
                                <div className="h-3 w-16 rounded bg-white/10" />
                                <div className="h-9 md:h-11 w-4/5 max-w-[440px] rounded-lg bg-white/15" />
                                <div className="h-4 w-2/5 max-w-[230px] rounded bg-white/10" />
                            </div>
                        </div>
                        <div className="flex items-center gap-3 mt-7">
                            <div className="w-12 h-12 rounded-full bg-white/15" />
                            <div className="w-10 h-10 rounded-lg bg-white/10" />
                            <div className="w-10 h-10 rounded-lg bg-white/10" />
                        </div>
                    </div>
                </div>
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
