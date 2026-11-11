-- Optional Lidarr artist-creation consent, OFF for all existing installs.
ALTER TABLE "DowntifyIntegration"
  ADD COLUMN "nativeLidarrAllowArtistCreation" BOOLEAN NOT NULL DEFAULT false;
