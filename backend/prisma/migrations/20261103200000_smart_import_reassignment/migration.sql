-- Additive, opt-in, reversible database-only album reclassification.
-- No audio files, tags, ownership histories or existing Track rows are rewritten.

ALTER TABLE "Track" ADD COLUMN "manualAlbumId" TEXT;

ALTER TABLE "Track" ADD CONSTRAINT "Track_manualAlbumId_fkey"
  FOREIGN KEY ("manualAlbumId") REFERENCES "Album"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Track_manualAlbumId_idx" ON "Track" ("manualAlbumId");

CREATE TABLE "SmartImportRepair" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "trackId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "previousAlbumId" TEXT NOT NULL,
  "newAlbumId" TEXT NOT NULL,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "undoneAt" TIMESTAMP(3),
  CONSTRAINT "SmartImportRepair_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SmartImportRepair_jobId_userId_undoneAt_idx"
  ON "SmartImportRepair" ("jobId", "userId", "undoneAt");
CREATE INDEX "SmartImportRepair_trackId_undoneAt_idx"
  ON "SmartImportRepair" ("trackId", "undoneAt");

-- Retain all historical repairs, but only one ACTIVE repair can own a
-- downloaded track or job. Violations abort the whole surrounding transaction.
CREATE UNIQUE INDEX "SmartImportRepair_active_track_key"
  ON "SmartImportRepair" ("trackId") WHERE "undoneAt" IS NULL;
CREATE UNIQUE INDEX "SmartImportRepair_active_job_key"
  ON "SmartImportRepair" ("jobId") WHERE "undoneAt" IS NULL;

-- A user-approved album choice wins over a later scanner upsert, including
-- races with a concurrent scan. Clearing manualAlbumId as part of undo
-- atomically permits the original albumId to be restored.
CREATE FUNCTION "apply_manual_track_album_override"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."manualAlbumId" IS NOT NULL THEN
    NEW."albumId" := NEW."manualAlbumId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Track_manualAlbum_guard"
BEFORE INSERT OR UPDATE OF "albumId", "manualAlbumId" ON "Track"
FOR EACH ROW EXECUTE FUNCTION "apply_manual_track_album_override"();
