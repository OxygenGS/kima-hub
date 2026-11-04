-- Additive v1.18.0 staging table: NO remote download, import, or file writes.
-- Prepared intent keys are unique within a Kima account and durable over
-- browser refresh and simultaneous requests. Existing DownloadJob and Track
-- records, music locations, and scanner-owned tables are unchanged.
CREATE TABLE "SpotifyDownloadIntent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "spotifyId" TEXT NOT NULL,
  "canonicalUrl" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'prepared',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SpotifyDownloadIntent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpotifyDownloadIntent_userId_kind_spotifyId_key"
  ON "SpotifyDownloadIntent"("userId", "kind", "spotifyId");

CREATE INDEX "SpotifyDownloadIntent_userId_createdAt_idx"
  ON "SpotifyDownloadIntent"("userId", "createdAt");

ALTER TABLE "SpotifyDownloadIntent"
  ADD CONSTRAINT "SpotifyDownloadIntent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
