import { Router } from "express";
import { prisma, Prisma } from "../../utils/db";
import { logger } from "../../utils/logger";
import { isMbid } from "../../services/artistIdentity";
import { getArtistDisplaySummary, getMergedGenres } from "../../utils/metadataOverrides";
import { getEffectiveYear } from "../../utils/dateFilters";

const router = Router();

// Mounted behind the library router's existing authentication and rate limiter.
// This initial view must not depend on Redis, artwork providers or discovery.
// The existing /artists/:id endpoint still supplies the complete enriched view.
router.get("/artists/:id/overview", async (req, res) => {
  try {
    const id = req.params.id;
    const artist = await prisma.artist.findFirst({
      where: { OR: [{ id }, { name: { equals: id, mode: "insensitive" } }, { mbid: id }] },
      include: {
        albums: {
          include: {
            tracks: {
              orderBy: { trackNo: Prisma.SortOrder.asc },
              select: {
                id: true, title: true, duration: true, trackNo: true,
                discNumber: true, discSubtitle: true, displayTitle: true,
                displayTrackNo: true, hasUserOverrides: true,
              },
            },
          },
        },
      },
    });
    if (!artist) return res.status(404).json({ error: "Artist not found" });

    const albums = artist.albums.map((album) => ({
      ...album,
      // Match the full artist endpoint's treatment of database albums.
      owned: true,
      source: "database",
      coverArt: album.userCoverUrl || album.coverUrl,
      tracks: album.tracks.map((track) => ({
        ...track,
        album: { id: album.id, title: album.title, coverArt: album.userCoverUrl || album.coverUrl },
      })),
    })).sort((a, b) =>
      (getEffectiveYear(b) ?? -1) - (getEffectiveYear(a) ?? -1) || a.title.localeCompare(b.title),
    );

    // Rankings and recommendations are not fabricated from an arbitrary slice.
    // They appear when the independent enriched request completes.
    return res.json({
      ...artist,
      mbid: isMbid(artist.mbid) ? artist.mbid : null,
      coverArt: artist.userHeroUrl || artist.heroUrl,
      bio: getArtistDisplaySummary(artist),
      genres: getMergedGenres(artist),
      albums,
      topTracks: [],
      similarArtists: [],
    });
  } catch (error) {
    logger.error("Get artist overview error:", error);
    return res.status(500).json({ error: "Failed to fetch artist" });
  }
});

export default router;
