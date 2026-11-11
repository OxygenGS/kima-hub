-- Downtify v2: additive, OFF-by-default Lidarr-managed handoff fields.
-- These are durable receipts and intent markers, not a destructive migration.
-- Existing RC6 music, Kima scanner tracks, owner baselines and review claims
-- remain untouched. Never use a Docker downgrade as database rollback.
ALTER TABLE "DowntifyIntegration"
  ADD COLUMN "nativeImportTarget" TEXT NOT NULL DEFAULT 'kima',
  ADD COLUMN "nativeLidarrLocalDownloads" TEXT,
  ADD COLUMN "nativeLidarrRemoteDownloads" TEXT,
  ADD COLUMN "nativeLidarrRemoteMusic" TEXT,
  ADD COLUMN "nativeLidarrStageMountProof" TEXT;

ALTER TABLE "DowntifyNativeImport"
  ADD COLUMN "importTarget" TEXT NOT NULL DEFAULT 'kima',
  ADD COLUMN "stagedRelativePath" TEXT,
  ADD COLUMN "stagedSha256" TEXT,
  ADD COLUMN "stagedBytes" INTEGER,
  ADD COLUMN "stagedArtist" TEXT,
  ADD COLUMN "stagedAlbum" TEXT,
  ADD COLUMN "stagedTitle" TEXT,
  ADD COLUMN "stagedDurationMs" INTEGER,
  ADD COLUMN "lidarrArtistId" INTEGER,
  ADD COLUMN "lidarrAlbumId" INTEGER,
  ADD COLUMN "lidarrReleaseId" INTEGER,
  ADD COLUMN "lidarrTrackId" INTEGER,
  ADD COLUMN "lidarrCommandId" INTEGER,
  ADD COLUMN "lidarrTrackFileId" INTEGER,
  ADD COLUMN "lidarrSubmittedAt" TIMESTAMP(3);

CREATE INDEX "DowntifyNativeImport_importTarget_status_idx"
  ON "DowntifyNativeImport"("importTarget", "status");
