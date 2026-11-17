import { prisma } from "../utils/db";
import { findSimilarTracks } from "./hybridSimilarity";
import { LIBRARY_TRACK_WHERE } from "./libraryFilters";
import { NOT_MISSING } from "../utils/libraryEligibility";
import { flowReason, rankFlowCandidates, type FlowPreferences } from "./novaFlowRank";
import { buildFlowTasteAffinities, MAX_TASTE_SEEDS, TASTE_NEIGHBOR_LIMIT, type TasteNeighborhood } from "./novaFlowTaste";

export interface FlowRequest extends FlowPreferences {
    seedTrackId?: string;
    excludeTrackIds: string[];
    limit: number;
}

const selectFlowTrack = {
    id: true,
    title: true,
    duration: true,
    energy: true,
    arousal: true,
    album: {
        select: {
            id: true,
            title: true,
            coverUrl: true,
            artist: { select: { id: true, name: true } },
        },
    },
} as const;

/**
 * Read-only session generation. Only tracks in the actual local library, with
 * non-missing/non-corrupt files, can be returned. Integrations and downloads
 * are never invoked. Supports a new user without any analysis or play history.
 */
export async function buildNovaFlow(userId: string, options: FlowRequest) {
    const eligible = { ...LIBRARY_TRACK_WHERE, ...NOT_MISSING, corrupt: false };
    // Negative choices apply only to recommendations, never to an explicit seed.
    const acceptable = { ...eligible, novaFlowFeedback: { none: { userId, value: -1 } } };
    const exclude = new Set(options.excludeTrackIds);
    let seedId = options.seedTrackId ?? null;

    // Explicit seeds must be playable; silently replacing them would mislead.
    if (seedId) {
        const seedExists = await prisma.track.findFirst({
            where: { ...eligible, id: seedId },
            select: { id: true },
        });
        if (!seedExists) return { unavailableSeed: true as const, seedTrackId: seedId, tracks: [] };
    } else {
        const lastPlayed = await prisma.play.findFirst({
            where: { userId, track: eligible },
            orderBy: { playedAt: "desc" },
            select: { trackId: true },
        });
        const liked = lastPlayed ? null : await prisma.likedTrack.findFirst({
            where: { userId, track: eligible },
            orderBy: { likedAt: "desc" },
            select: { trackId: true },
        });
        const first = lastPlayed || liked ? null : await prisma.track.findFirst({
            where: eligible, orderBy: { fileModified: "desc" }, select: { id: true },
        });
        seedId = lastPlayed?.trackId ?? liked?.trackId ?? first?.id ?? null;
    }

    if (!seedId) return { unavailableSeed: false as const, seedTrackId: null, tracks: [] };

    // Reuse the proven CLAP/MusiCNN similarity service; a cold library can
    // still start Flow using ordinary available tracks if analysis is pending.
    let similar: Awaited<ReturnType<typeof findSimilarTracks>> = [];
    try {
        similar = await findSimilarTracks(seedId, 150);
    } catch {
        // Similarity is optional for the initial experience.
    }
    const similarityMap = new Map(similar.map(t => [t.id, t.similarity]));
    // A bounded number of recent explicit choices influence tracks that
    // sound similar to what this listener likes or dislikes. Only the
    // originating Kima server performs these optional vector queries.
    const tasteSeeds = await prisma.novaFlowFeedback.findMany({
        where: { userId, track: eligible },
        orderBy: { updatedAt: "desc" },
        take: MAX_TASTE_SEEDS,
        select: { trackId: true, value: true },
    });
    const neighborhoods: TasteNeighborhood[] = await Promise.all(tasteSeeds.map(async signal => {
        try {
            const neighbors = await findSimilarTracks(signal.trackId, TASTE_NEIGHBOR_LIMIT);
            return {
                value: signal.value === 1 ? 1 : -1,
                neighbors: neighbors.map(track => ({ id: track.id, similarity: track.similarity })),
            };
        } catch {
            return { value: signal.value === 1 ? 1 : -1, neighbors: [] };
        }
    }));
    const tasteAffinities = buildFlowTasteAffinities(neighborhoods);
    const positiveSuggestions = neighborhoods
        .filter(neighborhood => neighborhood.value === 1)
        .flatMap(neighborhood => neighborhood.neighbors)
        .filter(track => track.similarity >= 0.70)
        .map(track => track.id);
    const poolIds = [...new Set([...similar.map(t => t.id), ...positiveSuggestions])]
        .filter(id => id !== seedId && !exclude.has(id)).slice(0, 330);
    let catalog = poolIds.length > 0
        ? await prisma.track.findMany({
            where: { ...acceptable, id: { in: poolIds } },
            select: selectFlowTrack,
        })
        : [];

    // Broaden the pool for discovery or incomplete audio enrichment.
    // Sample a bounded library window, never load the whole catalog in memory.
    if (catalog.length < options.limit * 3 || options.discovery >= 35) {
        const excluded = [...exclude, seedId, ...catalog.map(t => t.id)];
        const where = { ...acceptable, id: { notIn: excluded } };
        const count = await prisma.track.count({ where });
        const take = Math.min(140, count);
        if (take > 0) {
            const skip = Math.floor(Math.random() * (count - take + 1));
            const extra = await prisma.track.findMany({
                where, orderBy: { id: "asc" }, skip, take, select: selectFlowTrack,
            });
            catalog = [...catalog, ...extra];
        }
    }

    const includeSeed = !exclude.has(seedId);
    const seed = includeSeed ? await prisma.track.findFirst({
        where: { ...eligible, id: seedId },
        select: selectFlowTrack,
    }) : null;

    const ids = catalog.map(t => t.id);
    const [plays, favorites] = ids.length ? await Promise.all([
        prisma.play.findMany({
            where: { userId, trackId: { in: ids } },
            orderBy: { playedAt: "desc" },
            take: 400,
            select: { trackId: true },
        }),
        prisma.likedTrack.findMany({
            where: { userId, trackId: { in: ids } },
            select: { trackId: true },
        }),
    ]) : [[], []];

    const playCounts = new Map<string, number>();
    for (const p of plays) playCounts.set(p.trackId, (playCounts.get(p.trackId) ?? 0) + 1);
    const likedIds = new Set(favorites.map(x => x.trackId));
    const ratedIds = [...new Set([...ids, ...(seed ? [seed.id] : [])])];
    const explicitFeedback = ratedIds.length ? await prisma.novaFlowFeedback.findMany({
        where: { userId, trackId: { in: ratedIds } },
        select: { trackId: true, value: true },
    }) : [];
    const feedbackMap = new Map(explicitFeedback.map(x => [x.trackId, x.value]));

    const ranked = rankFlowCandidates(catalog.map(track => ({
        id: track.id,
        artistId: track.album.artist.id,
        albumId: track.album.id,
        similarity: similarityMap.get(track.id) ?? null,
        energy: track.energy ?? track.arousal ?? null,
        recentPlays: playCounts.get(track.id) ?? 0,
        liked: likedIds.has(track.id),
        taste: feedbackMap.get(track.id) === 1 ? 1 : feedbackMap.get(track.id) === -1 ? -1 : 0,
        tasteAffinity: tasteAffinities.get(track.id) ?? 0,
    })), options, Math.max(0, options.limit - (seed ? 1 : 0)));

    const tracksById = new Map(catalog.map(t => [t.id, t]));
    const toResult = (track: NonNullable<typeof seed>, reason: string) => ({
        id: track.id,
        title: track.title,
        duration: track.duration,
        artist: { id: track.album.artist.id, name: track.album.artist.name },
        album: { id: track.album.id, title: track.album.title, coverArt: track.album.coverUrl },
        reason,
        feedback: feedbackMap.get(track.id) === 1 ? "more"
            : feedbackMap.get(track.id) === -1 ? "less" : null,
    });

    return {
        unavailableSeed: false as const,
        seedTrackId: seedId,
        tracks: [
            ...(seed ? [toResult(seed, "seed")] : []),
            ...ranked.flatMap(c => {
                const track = tracksById.get(c.id);
                return track ? [toResult(track, flowReason(c, options))] : [];
            }),
        ],
    };
}
