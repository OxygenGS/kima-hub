-- Optional measured DJ metadata: no reset or backfill of existing analysis.
CREATE TABLE "TrackDjCue" (
    "trackId" TEXT NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "sourceModified" TIMESTAMP(3) NOT NULL,
    "sourceSize" INTEGER NOT NULL,
    "sourceAnalyzedAt" TIMESTAMP(3) NOT NULL,
    "profile" JSONB NOT NULL,
    CONSTRAINT "TrackDjCue_pkey" PRIMARY KEY ("trackId")
);

ALTER TABLE "TrackDjCue" ADD CONSTRAINT "TrackDjCue_trackId_fkey"
    FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;
