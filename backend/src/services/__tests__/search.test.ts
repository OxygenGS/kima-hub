/**
 * SearchService.queryToTsquery, through a subclass that exposes it.
 */

// All mocks must be before imports
jest.mock('../../utils/db', () => ({
    prisma: {
        artist: { findMany: jest.fn() },
        album: { findMany: jest.fn(), count: jest.fn() },
        track: { findMany: jest.fn() },
        podcast: { findMany: jest.fn() },
        podcastEpisode: { findMany: jest.fn() },
        audiobook: { findMany: jest.fn() },
        $queryRaw: jest.fn(),
    },
}));

jest.mock('../../utils/logger', () => ({
    logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../utils/redis', () => ({
    redisClient: { get: jest.fn().mockResolvedValue(null), setex: jest.fn().mockResolvedValue('OK') },
}));

import { SearchService } from '../search';

// Expose the private method for direct testing
class TestableSearchService extends SearchService {
    public tsquery(query: string): string {
        return (this as any).queryToTsquery(query);
    }
}

const svc = new TestableSearchService();

describe('SearchService.queryToTsquery', () => {
    describe('single terms', () => {
        it('converts a single word to prefix tsquery form', () => {
            expect(svc.tsquery('radiohead')).toBe('radiohead:*');
        });

        it('handles a single uppercase word', () => {
            expect(svc.tsquery('Radiohead')).toBe('Radiohead:*');
        });

        it('handles a numeric term', () => {
            expect(svc.tsquery('1984')).toBe('1984:*');
        });
    });

    describe('multi-word queries', () => {
        it('joins two terms with &', () => {
            expect(svc.tsquery('radio head')).toBe('radio:* & head:*');
        });

        it('joins three terms with & between each', () => {
            expect(svc.tsquery('alice in chains')).toBe('alice:* & in:* & chains:*');
        });

        it('collapses multiple spaces into separate terms', () => {
            expect(svc.tsquery('tool   lateralus')).toBe('tool:* & lateralus:*');
        });
    });

    describe('& operator handling', () => {
        it('converts & surrounded by spaces to "and" term', () => {
            // "of mice & men" -> "of mice and men" -> four terms
            const result = svc.tsquery('of mice & men');
            expect(result).toBe('of:* & mice:* & and:* & men:*');
        });
    });

    describe('special character stripping', () => {
        it('strips semicolons and SQL injection chars', () => {
            expect(svc.tsquery("'; DROP TABLE tracks; --")).toBe('DROP:* & TABLE:* & tracks:*');
        });

        it('strips leading/trailing punctuation from terms', () => {
            expect(svc.tsquery('!hello!')).toBe('hello:*');
        });

        it('strips parentheses', () => {
            expect(svc.tsquery('tool (band)')).toBe('tool:* & band:*');
        });

        it('strips hyphens from terms', () => {
            expect(svc.tsquery('alt-J')).toBe('altJ:*');
        });

        it('strips apostrophes from terms', () => {
            expect(svc.tsquery("it's")).toBe('its:*');
        });
    });

    describe('Unicode music names', () => {
        it('preserves accented letters in PostgreSQL search terms', () => {
            expect(svc.tsquery('Beyoncé')).toBe('Beyoncé:*');
            expect(svc.tsquery('Sigur Rós')).toBe('Sigur:* & Rós:*');
        });

        it('normalizes decomposed accents and keeps non-Latin letters', () => {
            expect(svc.tsquery('Beyonce\u0301')).toBe('Beyoncé:*');
            expect(svc.tsquery('東京')).toBe('東京:*');
            expect(svc.tsquery('Björk')).toBe('Björk:*');
        });
    });

    describe('empty / whitespace / null-like input', () => {
        it('returns empty string for empty string', () => {
            expect(svc.tsquery('')).toBe('');
        });

        it('returns empty string for whitespace-only string', () => {
            expect(svc.tsquery('   ')).toBe('');
        });

        it('returns empty string when all chars are non-word', () => {
            // Every character is stripped, leaving no terms
            expect(svc.tsquery('!@#$%^*()')).toBe('');
        });
    });

    describe('normalized Unicode cache keys', () => {
        it('treats composed and decomposed titles identically', () => {
            const { normalizeCacheQuery } = require('../search');
            expect(normalizeCacheQuery('  BEYONCE\u0301  ')).toBe('beyoncé');
            expect(normalizeCacheQuery('Beyoncé')).toBe('beyoncé');
        });
    });

    describe('normalizeCacheQuery', () => {
        it('lowercases and collapses whitespace', () => {
            const { normalizeCacheQuery } = require('../search');
            expect(normalizeCacheQuery('  Radio HEAD  ')).toBe('radio head');
        });

        it('handles leading and trailing spaces', () => {
            const { normalizeCacheQuery } = require('../search');
            expect(normalizeCacheQuery('  tool  ')).toBe('tool');
        });
    });
});

describe('SearchService.searchArtists', () => {
    const { prisma } = require('../../utils/db');

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns empty array for empty query', async () => {
        const result = await svc.searchArtists({ query: '' });
        expect(result).toEqual([]);
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('returns empty array for whitespace-only query', async () => {
        const result = await svc.searchArtists({ query: '   ' });
        expect(result).toEqual([]);
    });

    it('falls back to LIKE search when tsquery returns empty', async () => {
        // All-special-chars query -> empty tsquery -> fallback path
        (prisma.artist.findMany as jest.Mock).mockResolvedValue([]);
        const result = await svc.searchArtists({ query: '!!!' });
        expect(result).toEqual([]);
        expect(prisma.artist.findMany).toHaveBeenCalled();
    });

    it('uses $queryRaw for normal queries', async () => {
        const mockResult = [{ id: '1', name: 'Radiohead', mbid: null, heroUrl: null, rank: 0.8 }];
        (prisma.$queryRaw as jest.Mock).mockResolvedValue(mockResult);

        const result = await svc.searchArtists({ query: 'radiohead' });
        expect(result).toEqual(mockResult);
        expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('falls back to LIKE search when $queryRaw throws', async () => {
        (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('DB error'));
        (prisma.artist.findMany as jest.Mock).mockResolvedValue([]);

        const result = await svc.searchArtists({ query: 'radiohead' });
        expect(result).toEqual([]);
        expect(prisma.artist.findMany).toHaveBeenCalled();
    });
});


describe('SearchService indexed typo fallback', () => {
    const { prisma } = require('../../utils/db');

    beforeEach(() => {
        (prisma.$queryRaw as jest.Mock).mockReset();
        (prisma.artist.findMany as jest.Mock).mockReset().mockResolvedValue([]);
        (prisma.album.findMany as jest.Mock).mockReset().mockResolvedValue([]);
        (prisma.track.findMany as jest.Mock).mockReset().mockResolvedValue([]);
    });

    it('returns indexed typo results only after FTS and substring matching are empty', async () => {
        const match = { id: 'a', name: 'Radiohead', mbid: null, heroUrl: null, rank: 0.6 };
        (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([match]);
        expect(await svc.searchArtists({ query: 'Raidohead' })).toEqual([match]);
        expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
        const sql = (prisma.$queryRaw as jest.Mock).mock.calls[1][0].join('');
        expect(sql).toContain('a.name % ');
        expect(sql).toContain('EXISTS (SELECT 1 FROM "Album"');
    });

    it('does not run fuzzy search when full-text already has hits', async () => {
        const exact = { id: 'a', name: 'Radiohead', mbid: null, heroUrl: null, rank: 0.9 };
        (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([exact]);
        expect(await svc.searchArtists({ query: 'Radiohead' })).toEqual([exact]);
        expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
        const sql = (prisma.$queryRaw as jest.Mock).mock.calls[0][0].join('');
        expect(sql).toContain('CASE WHEN lower(a.name)');
    });

    it('does not broaden short queries into noisy typo matches', async () => {
        (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]);
        expect(await svc.searchArtists({ query: 'AB' })).toEqual([]);
        expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('supports album-title typos without changing unrelated audiobook search', async () => {
        const match = { id: 'al', title: 'In Rainbows', artistId: 'a', artistName: 'Radiohead', rank: 0.6 };
        (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([match]);
        expect(await svc.searchAlbums({ query: 'In Rainbws' })).toEqual([match]);
        expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
        expect((prisma.$queryRaw as jest.Mock).mock.calls[1][0].join('')).toContain('a.title % ');
    });

    it('never offers missing tracks from the typo fallback', async () => {
        const match = { id: 't', title: 'Weird Fishes', albumId: 'al', albumTitle: 'In Rainbows', artistId: 'a', artistName: 'Radiohead', duration: 120, rank: 0.7 };
        (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([match]);
        expect(await svc.searchTracks({ query: 'Weird Fshes' })).toEqual([match]);
        const sql = (prisma.$queryRaw as jest.Mock).mock.calls[1][0].join('');
        expect(sql).toContain('t.title % ');
        expect(sql).toContain('t."missingSince" IS NULL');
    });

    it('fails safely back to an empty result when trigram lookup is unavailable', async () => {
        (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('missing extension'));
        expect(await svc.searchArtists({ query: 'Raidohead' })).toEqual([]);
        expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    });
});
