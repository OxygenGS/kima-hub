"use client";

import { Music } from "lucide-react";
import { MediaCard } from "@/components/cards/MediaCard";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/i18n/language-context";
import { Mix } from "../types";
import { memo, type CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { cascadeStyle } from "@/lib/motion";

interface MixesGridProps {
    mixes: Mix[];
}

const MixesGrid = memo(function MixesGrid({ mixes }: MixesGridProps) {
    const { t, locale } = useLanguage();
    return (
        <div
            className="flex gap-3 overflow-x-auto scrollbar-hide scroll-smooth snap-x snap-mandatory"
            style={cascadeStyle(mixes.length)}
        >
            {mixes.map((mix, index) => {
                return (
                    <div
                        key={mix.id}
                        className={cn(
                            "flex-shrink-0 snap-start w-[140px] sm:w-[160px] md:w-[170px] lg:w-[180px]",
                            "animate-rise [animation-delay:calc(var(--i)*var(--stagger))]",
                        )}
                        style={{ "--i": index } as CSSProperties}
                    >
                        <MediaCard
                            href={`/mix/${mix.id}`}
                            title={mix.name}
                            subtitle={`${mix.trackCount.toLocaleString(locale)} ${t(mix.trackCount === 1 ? "track" : "tracks")}`}
                            imageUrl={mix.coverUrls.slice(0, 4).map((url) => api.getCoverArtUrl(url, 300))}
                            fallbackIcon={Music}
                            type="track"
                            index={index}
                            className="mx-1"
                        />
                    </div>
                );
            })}
        </div>
    );
});

export { MixesGrid };
