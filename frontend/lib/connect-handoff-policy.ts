import type { ConnectHandoff } from "@/lib/api";

const MAX_SOURCE_DRIFT_SECONDS = 20;

type HandoffReceipt = Pick<ConnectHandoff,
    "sourceTrackId" | "positionSeconds" | "createdAt" | "serverNow">;
type LocalPlayer = {
    isPlaying: boolean;
    playbackType: string | null;
    currentTrackId: string | null;
    currentTime: number;
};

/**
 * A delayed receipt is not permission to interrupt newly selected music.
 * Compare track identity and projected position using SERVER elapsed time:
 * source and target browser clocks need not agree with the Docker host.
 */
export function shouldPauseSourceForHandoff(receipt: HandoffReceipt, player: LocalPlayer): boolean {
    if (!player.isPlaying || player.playbackType !== "track" ||
        player.currentTrackId !== receipt.sourceTrackId) return false;
    if (![player.currentTime, receipt.positionSeconds, receipt.createdAt, receipt.serverNow]
        .every(Number.isFinite)) return false;
    if (receipt.serverNow < receipt.createdAt) return false;

    const expected = receipt.positionSeconds +
        (receipt.serverNow - receipt.createdAt) / 1000;
    return Math.abs(player.currentTime - expected) <= MAX_SOURCE_DRIFT_SECONDS;
}
