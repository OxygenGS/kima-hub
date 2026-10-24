"use client";

import DOMPurify from "dompurify";
import { useLanguage } from "@/lib/i18n/language-context";
import { SectionHeader } from "@/components/ui/SectionHeader";

interface ArtistBioProps {
  bio: string;
}

export function ArtistBio({ bio }: ArtistBioProps) {
  const { t } = useLanguage();
  if (!bio) return null;

  return (
    <section>
      <SectionHeader type="artist" title={t("About")} />
      <div className="bg-[var(--bg-tertiary)] border border-white/5 rounded-lg p-4 sm:p-5">
        <div
          className="prose prose-sm md:prose-base prose-invert max-w-none leading-relaxed [&_a]:text-brand [&_a]:no-underline [&_a:hover]:underline"
          style={{ color: "var(--text-secondary)" }}
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(bio || "") }}
        />
      </div>
    </section>
  );
}
