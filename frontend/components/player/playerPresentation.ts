/** Presentation-only gesture thresholds; no playback state is owned here. */
export function horizontalSwipe(dx: number, dy: number, threshold: number): -1 | 0 | 1 {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || threshold <= 0 ||
        Math.abs(dx) <= threshold || Math.abs(dx) <= Math.abs(dy)) return 0;
    return dx > 0 ? 1 : -1;
}

export function boundedProgress(progress: number): number {
    return Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;
}
