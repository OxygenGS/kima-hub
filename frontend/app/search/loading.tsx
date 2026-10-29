"use client";

import { useLanguage } from "@/lib/i18n/language-context";

/** Keep the search input and result layout stable while navigating. */
export default function Loading() {
    const { t } = useLanguage();

    return (
        <main className="min-h-screen bg-[var(--bg-primary)]" role="status" aria-live="polite" aria-busy="true">
            <span className="sr-only">{t("Loading...")}</span>
            <div className="page-shell py-8 animate-pulse motion-reduce:animate-none" aria-hidden="true">
                <div className="h-14 w-full max-w-3xl rounded-2xl border border-white/10 bg-white/[0.07]" />
                <div className="mt-10 space-y-4">
                    <div className="h-8 w-48 max-w-full rounded bg-white/10" />
                    <div className="flex flex-wrap gap-3">
                        {Array.from({ length: 3 }, (_, i) => (
                            <span key={i} className="h-9 w-24 rounded-full bg-white/10" />
                        ))}
                    </div>
                </div>
                <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1.5fr]">
                    <div className="space-y-4">
                        <div className="h-5 w-36 rounded bg-white/10" />
                        <div className="aspect-[4/3] max-h-[280px] rounded-2xl bg-white/[0.07]" />
                    </div>
                    <div className="space-y-4">
                        <div className="h-5 w-28 rounded bg-white/10" />
                        {Array.from({ length: 5 }, (_, i) => (
                            <div key={i} className="flex items-center gap-4">
                                <div className="h-12 w-12 shrink-0 rounded-lg bg-white/10" />
                                <div className="min-w-0 flex-1 space-y-2">
                                    <div className="h-4 w-3/5 rounded bg-white/10" />
                                    <div className="h-3 w-2/5 rounded bg-white/[0.07]" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </main>
    );
}
