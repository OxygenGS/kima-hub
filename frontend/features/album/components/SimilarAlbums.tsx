import React from 'react';
import { PlayableCard } from '@/components/ui/PlayableCard';
import { Disc3 } from 'lucide-react';
import { api } from '@/lib/api';
import { SimilarAlbum } from '../types';
import type { ColorPalette } from '@/hooks/useImageColor';
import { SectionHeader } from '@/features/home/components/SectionHeader';
import { useLanguage } from '@/lib/i18n/language-context';

interface SimilarAlbumsProps {
  similarAlbums: SimilarAlbum[];
  colors: ColorPalette | null;
  onNavigate: (albumId: string) => void;
}

export function SimilarAlbums({ similarAlbums, colors, onNavigate }: SimilarAlbumsProps) {
  const { t } = useLanguage();
  return (
    <section>
      <SectionHeader color="albums" title={t("More Like This")} />
      <div data-tv-section="similar-albums" className="grid-media">
        {similarAlbums.map((album, index) => (
          <PlayableCard
            key={album.id}
            href={`/album/${album.id}`}
            coverArt={album.coverArt ? api.getCoverArtUrl(album.coverArt, 300) : album.coverUrl}
            title={album.title}
            subtitle={album.artist?.name}
            placeholderIcon={<Disc3 className="w-12 h-12 text-[var(--text-muted)]" />}
            circular={false}
            badge={album.owned ? t("owned") : undefined}
            colors={colors}
            showPlayButton={false}
            onClick={() => onNavigate(album.id)}
            tvCardIndex={index}
          />
        ))}
      </div>
    </section>
  );
}
