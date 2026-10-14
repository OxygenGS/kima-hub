"use client";

import { useLanguage } from "@/lib/i18n/language-context";

interface LibraryHeaderProps {
  totalItems: number;
  activeTab: string;
}

export function LibraryHeader({ totalItems, activeTab }: LibraryHeaderProps) {
  const { t, locale } = useLanguage();
  return (
    <div className="relative bg-gradient-to-b from-[#0a0a0a] via-[#0f0f0f] to-transparent pt-6 pb-8 px-6 md:px-8">
      {/* System status indicator */}
      <div className="flex items-center gap-2 mb-6">
        <div className="w-1.5 h-1.5 bg-[#22c55e] rounded-full" />
        <span className="t-eyebrow">
          {t("Archive Online")}
        </span>
      </div>

      {/* Title + Live Stats */}
      <div className="flex items-baseline justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-none mb-3">
            {t("Collection")}
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            {t("Personal audio archive / Full catalog access")}
          </p>
        </div>

        {/* Live counter */}
        <div className="flex items-baseline gap-2 border border-white/10 bg-[var(--bg-primary)] px-4 py-3 rounded">
          <span className="text-4xl font-bold tabular-nums text-[#eab308]">
            {totalItems.toLocaleString(locale === "nl" ? "nl-NL" : "en-US")}
          </span>
          <span className="text-xs tabular-nums text-[var(--text-muted)]">
            {activeTab === "artists" ? t(totalItems === 1 ? "artist" : "artists") : activeTab === "albums" ? t(totalItems === 1 ? "album" : "albums") : t(totalItems === 1 ? "track" : "tracks")}
          </span>
        </div>
      </div>
    </div>
  );
}
