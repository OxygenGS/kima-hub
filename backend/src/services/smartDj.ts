/**
 * Adaptive Smart DJ: bounded, user-specific selections using only playable,
 * owned tracks. No migrations, file writes, remote provider requests or
 * changes to the existing audio engine / queue.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../utils/db";
import { logger } from "../utils/logger";
import { findSimilarTracks } from "./hybridSimilarity";
import { LIBRARY_TRACK_WHERE } from "./libraryFilters";
import { NOT_MISSING } from "../utils/libraryEligibility";

export type SmartDjPreset = "flow" | "explore" | "focus" | "energy";

export interface SmartDjOptions {
    preset: SmartDjPreset;
    limit: number;
    seedTrackId?: string;
    excludeIds?: string[];
}

export interface SmartDjCandidate {
    id: string;
    title: string;
    duration: number;
    energy: number | null;
    bpm: number | null;
    valence: number | null;
    album: {
        id: string;
        title: string;
        coverUrl: string | null;
        artist: { id: string; name: string };
    };
}

export interface SmartDjContext {
    preset: SmartDjPreset;
    limit: number;
    userId: string;
    seedTrackId?: string;
    excludeIds: ReadonlySet<string>;
    recentlyPlayedIds: readonly string[];
    likedIds: ReadonlySet<string>;
    dislikedIds: ReadonlySet<string>;
    similarities: ReadonlyMap<string, number>;
}

export interface SmartDjPick {
    track: SmartDjCandidate;
    reason: "similar-sound" | "liked-track" | "not-yet-played" | "calm-sound" | "high-energy" | "library-pick";
}

const ELIGIBLE: Prisma.TrackWhereInput = {
    ...LIBRARY_TRACK_WHERE,
    ...NOT_MISSING,
    corrupt: false,
};

const TRACK_SELECT = {
    id: true,
    title: true,
    displayTitle: true,
    duration: true,
    energy: true,
    bpm: true,
    valence: true,
    album: {
        select: {
            id: true,
            title: true,
            coverUrl: true,
            artist: { select: { id: true, name: true, displayName: true } },
        },
    },
} satisfies Prisma.TrackSelect;

function candidateFromRow(row: Prisma.TrackGetPayload<{ select: typeof TRACK_SELECT }>): SmartDjCandidate {
    return {
        id: row.id,
        title: row.displayTitle || row.title,
        duration: row.duration,
        energy: row.energy,
        bpm: row.bpm,
        valence: row.valence,
        album: {
            id: row.album.id,
            title: row.album.title,
            coverUrl: row.album.coverUrl,
            artist: { id: row.album.artist.id, name: row.album.artist.displayName || row.album.artist.name },
        },
    };
}

/** Stable tie-breaker per user/day: different listeners do not get the same first-page order. */
function variation(userId: string, trackId: string, day: number): number {
    const text = userId + ":" + trackId + ":" + day;
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return ((hash >>> 0) % 1000) / 5000;
}

function reasonFor(track: SmartDjCandidate, ctx: SmartDjContext, plays: number): SmartDjPick["reason"] {
    if (ctx.similarities.has(track.id)) return "similar-sound";
    if (ctx.likedIds.has(track.id)) return "liked-track";
    if (ctx.preset === "explore" && plays === 0) return "not-yet-played";
    if (ctx.preset === "focus" && track.energy !== null && track.energy < 0.45) return "calm-sound";
    if (ctx.preset === "energy" && track.energy !== null && track.energy >= 0.65) return "high-energy";
    return "library-pick";
}

/**
 * Pure selection pass for easy regression testing.
 * A selected track can only occur once, and recent history belongs to the
 * requesting user. Diversity restrictions are relaxed only if needed to fill.
 */
export function selectSmartDjTracks(
    candidates: readonly SmartDjCandidate[],
    ctx: SmartDjContext,
    day = Math.floor(Date.now() / 86_400_000),
): SmartDjPick[] {
    const excluded = new Set([...ctx.excludeIds, ...ctx.dislikedIds]);
    if (ctx.seedTrackId) excluded.add(ctx.seedTrackId);
    const recentCounts = new Map<string, number>();
    ctx.recentlyPlayedIds.forEach((id) => recentCounts.set(id, (recentCounts.get(id) || 0) + 1));
    const veryRecent = new Set(ctx.recentlyPlayedIds.slice(0, 12));
    const unique = new Map<string, SmartDjCandidate>();
    for (const track of candidates) {
        if (!excluded.has(track.id) && !unique.has(track.id) && track.duration > 0) {
            unique.set(track.id, track);
        }
    }

    const ranked = [...unique.values()].map((track) => {
        const plays = recentCounts.get(track.id) || 0;
        const liked = ctx.likedIds.has(track.id);
        const similar = ctx.similarities.get(track.id) || 0;
        let score = 0.3 + 0.8 * similar + variation(ctx.userId, track.id, day);
        if (liked) score += ctx.preset === "explore" ? 0.15 : 0.55;

        if (ctx.preset === "explore") {
            score += plays === 0 ? 1.05 : -Math.min(0.9, plays * 0.25);
        } else if (ctx.preset === "flow") {
            score += plays > 0 ? 0.15 : 0.28;
        } else if (ctx.preset === "focus") {
            if (track.energy !== null) score += 0.85 * (1 - Math.abs(track.energy - 0.22));
            if (track.bpm !== null) score += 0.25 * (1 - Math.min(1, Math.abs(track.bpm - 90) / 80));
        } else if (ctx.preset === "energy") {
            if (track.energy !== null) score += 0.9 * Math.max(0, Math.min(1, track.energy));
            if (track.bpm !== null) score += 0.25 * Math.min(1, Math.max(0, (track.bpm - 95) / 65));
        }
        if (veryRecent.has(track.id)) score -= 1.8;
        return { track, plays, score };
    }).sort((a, b) => b.score - a.score || a.track.id.localeCompare(b.track.id));

    const selected: SmartDjPick[] = [];
    const picked = new Set<string>();
    const artists = new Map<string, number>();
    const albums = new Map<string, number>();

    // First pass maintains strong variety; later passes allow repeated artists
    // from small collections but never repeat tracks.
    for (const [artistCap, albumCap, spacing] of [[2, 1, 3], [3, 2, 1], [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 0]]) {
        for (const { track, plays } of ranked) {
            if (selected.length >= ctx.limit) break;
            if (picked.has(track.id)) continue;
            const artistId = track.album.artist.id;
            const albumId = track.album.id;
            if ((artists.get(artistId) || 0) >= artistCap || (albums.get(albumId) || 0) >= albumCap) continue;
            if (spacing && selected.slice(-spacing).some((pick) => pick.track.album.artist.id === artistId)) continue;
            selected.push({ track, reason: reasonFor(track, ctx, plays) });
            picked.add(track.id);
            artists.set(artistId, (artists.get(artistId) || 0) + 1);
            albums.set(albumId, (albums.get(albumId) || 0) + 1);
        }
        if (selected.length >= ctx.limit) break;
    }
    return selected;
}

export async function generateSmartDj(userId: string, options: SmartDjOptions) {
    const seed = options.seedTrackId
        ? await prisma.track.findFirst({
            where: { ...ELIGIBLE, id: options.seedTrackId },
            select: { id: true },
        })
        : null;
    const seedTrackId = seed?.id;
    const [plays, likes, dislikes] = await Promise.all([
        prisma.play.findMany({
            where: { userId },
            orderBy: { playedAt: "desc" },
            take: 180,
            select: { trackId: true },
        }),
        prisma.likedTrack.findMany({
            where: { userId },
            orderBy: { likedAt: "desc" },
            take: 150,
            select: { trackId: true },
        }),
        prisma.dislikedEntity.findMany({
            where: { userId, entityType: { in: ["track", "TRACK"] } },
            take: 300,
            select: { entityId: true },
        }),
    ]);
    const likedIds = new Set(likes.map((row) => row.trackId));
    const recentIds = plays.map((row) => row.trackId);

    let similarIds: string[] = [];
    const similarities = new Map<string, number>();
    if (seedTrackId) {
        try {
            const matches = await findSimilarTracks(seedTrackId, 100);
            for (const match of matches) {
                similarIds.push(match.id);
                similarities.set(match.id, Math.max(0, Math.min(1, match.similarity)));
            }
        } catch (error) {
            logger.warn("[SmartDJ] Similarity lookup unavailable; using library fallback", error);
        }
    }

    // All cohorts are bounded and filtered to existing, owned, non-corrupt music.
    // Recent additions, older deep cuts, unheard tracks and favourites supply
    // variety even if audio analysis / embeddings are not ready.
    const [newer, older, unheard, personalized] = await Promise.all([
        prisma.track.findMany({
            where: ELIGIBLE, select: TRACK_SELECT,
            orderBy: { fileModified: "desc" }, take: 180,
        }),
        prisma.track.findMany({
            where: ELIGIBLE, select: TRACK_SELECT,
            orderBy: { fileModified: "asc" }, take: 120,
        }),
        prisma.track.findMany({
            where: { ...ELIGIBLE, plays: { none: { userId } } },
            select: TRACK_SELECT, orderBy: { fileModified: "desc" }, take: 150,
        }),
        prisma.track.findMany({
            where: { ...ELIGIBLE, id: { in: [...new Set([...similarIds, ...likedIds])].slice(0, 250) } },
            select: TRACK_SELECT, take: 250,
        }),
    ]);
    const candidates = [...newer, ...older, ...unheard, ...personalized].map(candidateFromRow);
    const picks = selectSmartDjTracks(candidates, {
        preset: options.preset,
        limit: options.limit,
        userId,
        seedTrackId,
        excludeIds: new Set((options.excludeIds || []).slice(0, 120)),
        recentlyPlayedIds: recentIds,
        likedIds,
        dislikedIds: new Set(dislikes.map((row) => row.entityId)),
        similarities,
    });

    return {
        preset: options.preset,
        tracks: picks.map(({ track, reason }) => ({
            id: track.id,
            title: track.title,
            duration: track.duration,
            artist: track.album.artist,
            album: { id: track.album.id, title: track.album.title, coverArt: track.album.coverUrl },
            audioFeatures: { energy: track.energy, bpm: track.bpm, valence: track.valence },
            djReason: reason,
        })),
        hasMore: picks.length === options.limit,
    };
}
