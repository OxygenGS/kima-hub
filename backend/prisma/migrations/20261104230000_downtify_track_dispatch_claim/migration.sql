-- Additive v1.18.0 only: remote task claims are separate from Kima DownloadJob.
-- Existing prepared rows remain prepared; no engine calls or music I/O.
ALTER TABLE "SpotifyDownloadIntent"
  ADD COLUMN "remoteSongId" TEXT,
  ADD COLUMN "dispatchStartedAt" TIMESTAMP(3);

CREATE INDEX "SpotifyDownloadIntent_userId_status_idx"
  ON "SpotifyDownloadIntent"("userId", "status");
