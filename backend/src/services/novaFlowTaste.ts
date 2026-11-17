/**
 * Local Music DNA: bounded, explainable influence of explicit listener
 * preferences on similarly sounding library tracks. No external API/model.
 * Weights never turn a user-selected track into an automatic download.
 */
export type FlowTasteSignal = -1 | 1;

export interface TasteNeighborhood {
    value: FlowTasteSignal;
    neighbors: ReadonlyArray<{ id: string; similarity: number }>;
}

export const MAX_TASTE_SEEDS = 4;
export const TASTE_NEIGHBOR_LIMIT = 45;

function strength(similarity: number): number {
    if (!Number.isFinite(similarity)) return 0;
    // Only fairly strong matches matter; distant matches stay neutral.
    return Math.max(0, Math.min(1, (similarity - 0.70) / 0.30));
}

/** Returns a per-track signed affinity in [-1, 1], without any user IDs. */
export function buildFlowTasteAffinities(neighborhoods: TasteNeighborhood[]): Map<string, number> {
    const positive = new Map<string, number>();
    const negative = new Map<string, number>();

    for (const neighborhood of neighborhoods.slice(0, MAX_TASTE_SEEDS)) {
        const map = neighborhood.value === 1 ? positive : negative;
        for (const { id, similarity } of neighborhood.neighbors.slice(0, TASTE_NEIGHBOR_LIMIT)) {
            if (!id) continue;
            const influence = strength(similarity);
            if (influence > (map.get(id) ?? 0)) map.set(id, influence);
        }
    }

    const affinities = new Map<string, number>();
    for (const id of new Set([...positive.keys(), ...negative.keys()])) {
        const affinity = (positive.get(id) ?? 0) - (negative.get(id) ?? 0);
        if (affinity !== 0) affinities.set(id, affinity);
    }
    return affinities;
}
