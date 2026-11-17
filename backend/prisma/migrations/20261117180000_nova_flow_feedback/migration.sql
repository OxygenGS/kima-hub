-- Project NOVA: additive account-private listener feedback for Kima Flow.
-- No existing favorites, playlists, media files or playback queues are changed.
-- Both foreign keys cascade: deleting a user or library track removes only
-- that entity's own feedback. The DB check prevents invalid signal values.
CREATE TABLE "NovaFlowFeedback" (
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NovaFlowFeedback_pkey" PRIMARY KEY ("userId","trackId"),
    CONSTRAINT "NovaFlowFeedback_value_check" CHECK ("value" IN (-1, 1))
);

CREATE INDEX "NovaFlowFeedback_userId_value_idx" ON "NovaFlowFeedback"("userId", "value");
CREATE INDEX "NovaFlowFeedback_trackId_idx" ON "NovaFlowFeedback"("trackId");

ALTER TABLE "NovaFlowFeedback" ADD CONSTRAINT "NovaFlowFeedback_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NovaFlowFeedback" ADD CONSTRAINT "NovaFlowFeedback_trackId_fkey"
    FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;
