/** Move only upcoming positions; never mutate the supplied queue or cross the playing item. */
export function moveUpcomingTrack<T>(queue: T[], currentIndex: number, index: number, direction: -1 | 1): T[] {
    const destination = index + direction;
    if (!Number.isInteger(index) || !Number.isInteger(currentIndex) ||
        index < 0 || index >= queue.length || destination < 0 || destination >= queue.length ||
        index <= currentIndex || destination <= currentIndex) return queue;
    const reordered = [...queue];
    [reordered[index], reordered[destination]] = [reordered[destination], reordered[index]];
    return reordered;
}
