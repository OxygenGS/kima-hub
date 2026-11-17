import {
    buildFlowTasteAffinities, MAX_TASTE_SEEDS, TASTE_NEIGHBOR_LIMIT,
} from "../novaFlowTaste";

describe("Local Music DNA similarity influence", () => {
    it("transfers a positive choice to similar songs, never unrelated ones", () => {
        const m = buildFlowTasteAffinities([{
            value: 1, neighbors: [
                { id: "very-similar", similarity: 0.98 },
                { id: "far", similarity: 0.35 },
            ],
        }]);
        expect(m.get("very-similar")).toBeGreaterThan(0.9);
        expect(m.has("far")).toBe(false);
    });

    it("makes related negative choices reduce affinity instead of silently excluding all neighboring songs", () => {
        const m = buildFlowTasteAffinities([{
            value: -1, neighbors: [{ id: "candidate", similarity: 0.97 }],
        }]);
        expect(m.get("candidate")).toBeLessThan(-0.8);
    });

    it("balances conflicting positive and negative seeds deterministically", () => {
        const m = buildFlowTasteAffinities([
            { value: 1, neighbors: [{ id: "mixed", similarity: 1 }] },
            { value: -1, neighbors: [{ id: "mixed", similarity: 0.85 }] },
        ]);
        expect(m.get("mixed")).toBeGreaterThan(0.45);
        expect(m.get("mixed")).toBeLessThan(0.55);
    });

    it("bounds the number of analyzed preferences and result IDs", () => {
        const extra = Array.from({ length: TASTE_NEIGHBOR_LIMIT + 50 }, (_, i) =>
            ({ id: "n" + i, similarity: 1 }));
        const batch = Array.from({ length: MAX_TASTE_SEEDS + 5 }, () => ({
            value: 1 as const, neighbors: extra,
        }));
        const m = buildFlowTasteAffinities(batch);
        expect(m.size).toBe(TASTE_NEIGHBOR_LIMIT);
        expect(m.has("n" + TASTE_NEIGHBOR_LIMIT)).toBe(false);
    });

    it("ignores invalid similarity data and clamps out-of-range scores", () => {
        const m = buildFlowTasteAffinities([{
            value: 1, neighbors: [
                { id: "nan", similarity: NaN },
                { id: "infinite", similarity: Infinity },
                { id: "clamped", similarity: 14 },
            ],
        }]);
        expect(m.has("nan")).toBe(false);
        expect(m.has("infinite")).toBe(false);
        expect(m.get("clamped")).toBe(1);
    });
});
