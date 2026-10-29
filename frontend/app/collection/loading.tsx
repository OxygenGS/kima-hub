"use client";

import { useLanguage } from "@/lib/i18n/language-context";
import { CollectionGridSkeleton } from "@/features/library/components/CollectionGridSkeleton";

/** Match the collection's masthead and grid while navigation is streaming. */
export default function Loading() {
    const { t } = useLanguage();

    return (
        <main className="min-h-screen bg-[var(--bg-primary)]">
            <header className="page-shell pt-8 pb-6">
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white leading-none">
                    {t("Collection")}
                </h1>
                <div aria-hidden="true" className="mt-3 h-4 w-40 rounded bg-white/10 animate-pulse motion-reduce:animate-none" />
                <div aria-hidden="true" className="mt-3 h-1 w-full rounded-full bg-white/[0.06]" />
            </header>
            <div className="page-shell pb-24">
                <div aria-hidden="true" className="mb-6 flex flex-wrap gap-3 border-b border-white/5 pb-4">
                    {Array.from({ length: 3 }, (_, i) => (
                        <span key={i} className="h-10 w-24 rounded-lg bg-white/10" />
                    ))}
                </div>
                <div aria-hidden="true" className="mb-8 flex justify-between border-b border-white/5 pb-4">
                    <span className="h-11 w-32 rounded-lg bg-white/10" />
                    <span className="h-11 w-11 rounded-lg bg-white/10" />
                </div>
                <CollectionGridSkeleton />
            </div>
        </main>
    );
}
