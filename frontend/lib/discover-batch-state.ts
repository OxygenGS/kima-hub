/**
 * UI-only status helpers for Discover Weekly generation.
 * Batch IDs, SSE payloads, timers and backend endpoints are unchanged.
 */
export function shouldReloadDiscoverAfterBatch(
    wasActive: boolean,
    isActive: boolean,
): boolean {
    return wasActive && !isActive;
}

/** Delay remaining before an unconfirmed optimistic batch is considered idle. */
export function remainingDiscoverStartGrace(
    startedAtMs: number | null,
    nowMs: number,
    graceMs = 5000,
): number {
    return startedAtMs === null ? 0 : Math.max(0, graceMs - (nowMs - startedAtMs));
}
