-- Additive, OFF-by-default device pairing. No changes to DownloadJob,
-- SpotifyDownloadIntent, music scanner, mounts, existing Importer v5 or files.
CREATE TABLE "DowntifyIntegration" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "baseUrl" TEXT NOT NULL,
    "deviceTokenEncrypted" TEXT NOT NULL,
    "ownerKimaUserId" TEXT NOT NULL,
    "expectedUsername" TEXT NOT NULL,
    "expectedUserId" INTEGER NOT NULL,
    "expectedServerId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "spotifyIntentsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "trackSubmissionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "reconciliationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DowntifyIntegration_pkey" PRIMARY KEY ("id")
);
