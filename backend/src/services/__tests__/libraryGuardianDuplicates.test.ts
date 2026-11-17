jest.mock("../../utils/db", () => ({
    prisma: { $queryRaw: jest.fn() },
}));

import { prisma } from "../../utils/db";
import {
    assessDuplicateEvidence, getLibraryGuardianDuplicates, groupGuardianCandidates,
} from "../libraryGuardianDuplicates";

const mbid1 = "550e8400-e29b-41d4-a716-446655440000";
const mbid2 = "550e8400-e29b-41d4-a716-446655440001";
const mbid3 = "550e8400-e29b-41d4-a716-446655440002";

const row = (overrides: Record<string, unknown> = {}) => ({
    recordingMbid: mbid1, copies: 2, trackId: "a", title: "Great Song",
    duration: 212, filePath: "Artist/Album A/01.flac",
    albumId: "album-1", albumTitle: "Album A", artistName: "Artist",
    fingerprintDigest: "digest-a",
    ...overrides,
});

const query = prisma.$queryRaw as jest.Mock;
beforeEach(() => {
    jest.resetAllMocks();
    query.mockResolvedValue([]);
});

describe("Library Guardian duplicate evidence", () => {
    it("requires two similar-duration acoustic signatures for the strongest label", () => {
        expect(assessDuplicateEvidence([
            row(), row({ trackId: "b", filePath: "Artist/Album B/01.flac", duration: 214 }),
        ])).toBe("matching-acoustic-fingerprint");
        expect(assessDuplicateEvidence([
            row(), row({ trackId: "b", fingerprintDigest: "other", duration: 214 }),
        ])).toBe("same-recording-close-duration");
        expect(assessDuplicateEvidence([
            row(), row({ trackId: "b", duration: 233 }),
        ])).toBe("shared-recording-id");
        expect(assessDuplicateEvidence([
            row({ fingerprintDigest: null }), row({ trackId: "b", fingerprintDigest: null }),
        ])).toBe("same-recording-close-duration");
    });

    it("does not call distinct editions safe to delete or expose fingerprints", async () => {
        query.mockResolvedValueOnce([
            row(),
            row({ trackId: "b", albumId: "album-2", albumTitle: "Album B",
                filePath: "Artist/Album B/01.flac", duration: 213 }),
        ]);
        const result = await getLibraryGuardianDuplicates(8);
        expect(result).toMatchObject({
            basis: "indexed-recording-metadata", readOnly: true, groupLimit: 8,
            sampleLimit: 4, hasMore: false,
        });
        expect(result.candidates).toHaveLength(1);
        expect(result.candidates[0]).toEqual({
            recordingMbid: mbid1, indexedCopies: 2,
            evidence: "matching-acoustic-fingerprint",
            tracks: [
                { id: "a", title: "Great Song", duration: 212, filePath: "Artist/Album A/01.flac",
                    albumId: "album-1", albumTitle: "Album A", artistName: "Artist" },
                { id: "b", title: "Great Song", duration: 213, filePath: "Artist/Album B/01.flac",
                    albumId: "album-2", albumTitle: "Album B", artistName: "Artist" },
            ],
        });
        expect(JSON.stringify(result)).not.toContain("digest-a");
        expect(JSON.stringify(result)).not.toContain("delete");
    });

    it("returns no fabricated candidates from an empty or failed scan", async () => {
        expect((await getLibraryGuardianDuplicates()).candidates).toEqual([]);
        query.mockRejectedValueOnce(new Error("database unavailable"));
        await expect(getLibraryGuardianDuplicates()).rejects.toThrow("database unavailable");
    });

    it("sends exactly one bounded, read-only SQL query and no media operations", async () => {
        await getLibraryGuardianDuplicates(999);
        expect(query).toHaveBeenCalledTimes(1);
        const args = query.mock.calls[0] as [TemplateStringsArray, ...number[]];
        const sql = args[0].join("?");
        expect(sql).toContain('a.location = \'LIBRARY\'');
        expect(sql).toContain('t."missingSince" IS NULL');
        expect(sql).toContain('t.corrupt = false');
        expect(sql).toContain('HAVING COUNT(*) > 1');
        expect(sql).toContain("CROSS JOIN LATERAL");
        expect(args.slice(1)).toEqual([13, 4]);
        expect(sql).not.toMatch(/\b(delete|update|insert|truncate|drop)\s+(from|into|table)/i);
    });

    it("caps rows per candidate and reports when more groups were found", () => {
        const input = [
            ...Array.from({ length: 8 }, (_, i) => row({ trackId: "a" + i })),
            row({ recordingMbid: mbid2, trackId: "b", copies: 2 }),
            row({ recordingMbid: mbid3, trackId: "c", copies: 2 }),
            row({ recordingMbid: "not-a-valid-mbid", trackId: "invalid", copies: 2 }),
        ];
        const result = groupGuardianCandidates(input, 2);
        expect(result.hasMore).toBe(true);
        expect(result.candidates).toHaveLength(2);
        expect(result.candidates[0].tracks).toHaveLength(4);
        expect(result.candidates.map(x => x.recordingMbid)).toEqual([mbid1, mbid2]);
    });

    it("keeps the recording label cautious even if samples have different titles", () => {
        expect(assessDuplicateEvidence([
            row({ title: "Original", fingerprintDigest: null }),
            row({ title: "Radio Edit", fingerprintDigest: null, trackId: "b", duration: 212 }),
        ])).toBe("shared-recording-id");
    });
});
