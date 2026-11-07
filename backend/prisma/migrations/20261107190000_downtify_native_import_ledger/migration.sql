-- Schema only: the native importer is disabled. No queue, filesystem,
-- timers, existing Downtify devices or Importer v5 services are changed.
-- Back up /data before a future deployment; image downgrade does not
-- roll back PostgreSQL migrations.

ALTER TABLE "DowntifyIntegration"
  ADD COLUMN "nativeImportEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "nativeImportBaselineAt" TIMESTAMP(3);

CREATE TABLE "DowntifyNativeImport" (
  "id" TEXT NOT NULL,
  "ownerKimaUserId" TEXT NOT NULL,
  "remoteServerId" TEXT NOT NULL,
  "remoteUserId" INTEGER NOT NULL,
  "spotifyTrackId" TEXT NOT NULL,
  "remoteLibraryTrackId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'baseline',
  "claimedAt" TIMESTAMP(3),
  "claimToken" TEXT,
  "expectedBytes" INTEGER,
  "outputRelativePath" TEXT,
  "fullSha256" TEXT,
  "indexedTrackId" TEXT,
  "reviewReason" TEXT,
  "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DowntifyNativeImport_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DowntifyNativeImport" ADD CONSTRAINT "DowntifyNativeImport_ownerKimaUserId_fkey"
  FOREIGN KEY ("ownerKimaUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "DowntifyNativeImport_remoteServerId_remoteUserId_spotifyTrackId_key"
  ON "DowntifyNativeImport"("remoteServerId", "remoteUserId", "spotifyTrackId");

CREATE UNIQUE INDEX "DowntifyNativeImport_claimToken_key"
  ON "DowntifyNativeImport"("claimToken");

CREATE INDEX "DowntifyNativeImport_ownerKimaUserId_status_idx"
  ON "DowntifyNativeImport"("ownerKimaUserId", "status");

CREATE INDEX "DowntifyNativeImport_status_updatedAt_idx"
  ON "DowntifyNativeImport"("status", "updatedAt");
