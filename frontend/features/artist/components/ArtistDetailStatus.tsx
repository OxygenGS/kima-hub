"use client";

import { AlertCircle, LoaderCircle } from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";

interface ArtistDetailStatusProps {
    loadingMore: boolean;
    moreDetailsFailed: boolean;
    onRetry: () => void;
}

/**
 * The local overview is already useful while independent enrichment finishes.
 * Make that partial state explicit and recoverable without hiding owned albums.
 */
export function ArtistDetailStatus({
    loadingMore, moreDetailsFailed, onRetry,
}: ArtistDetailStatusProps) {
    const { t } = useLanguage();
    if (!loadingMore && !moreDetailsFailed) return null;

    return (
        <div className="page-shell pt-4">
            <div
                role={moreDetailsFailed ? "alert" : "status"}
                className="inline-flex max-w-full flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-[var(--bg-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]"
            >
                {moreDetailsFailed ? (
                    <AlertCircle className="size-4 shrink-0 text-warning" aria-hidden="true" />
                ) : (
                    <LoaderCircle className="size-4 shrink-0 animate-spin text-brand motion-reduce:animate-none" aria-hidden="true" />
                )}
                <span>{t(moreDetailsFailed
                    ? "Additional artist information is unavailable."
                    : "Loading additional artist information..."
                )}</span>
                {moreDetailsFailed && (
                    <button
                        type="button"
                        onClick={onRetry}
                        className="min-h-11 rounded-lg border border-white/20 px-3 py-2 font-medium text-white hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                        {t("Try again")}
                    </button>
                )}
            </div>
        </div>
    );
}
