import { prisma } from "../utils/db";
import { LIBRARY_TRACK_WHERE } from "./libraryFilters";
import { NOT_MISSING } from "../utils/libraryEligibility";

export type FlowFeedbackChoice = "more" | "less";
export type FlowFeedbackValue = -1 | 1;

/** Persist an explicit choice for this authenticated listener, never globally. */
export async function setNovaFlowFeedback(
    userId: string,
    trackId: string,
    choice: FlowFeedbackChoice,
): Promise<FlowFeedbackChoice | null> {
    // Only actually indexed, streamable local-library tracks may be rated.
    const valid = await prisma.track.findFirst({
        where: { ...LIBRARY_TRACK_WHERE, ...NOT_MISSING, corrupt: false, id: trackId },
        select: { id: true },
    });
    if (!valid) return null;

    const value: FlowFeedbackValue = choice === "more" ? 1 : -1;
    await prisma.novaFlowFeedback.upsert({
        where: { userId_trackId: { userId, trackId } },
        create: { userId, trackId, value },
        update: { value },
        select: { value: true },
    });
    return choice;
}

/** Undo a rating. This is idempotent and cannot affect another account. */
export async function clearNovaFlowFeedback(userId: string, trackId: string): Promise<void> {
    await prisma.novaFlowFeedback.deleteMany({ where: { userId, trackId } });
}
