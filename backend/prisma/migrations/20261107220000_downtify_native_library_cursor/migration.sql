-- Additive follow-up: capture Downtify mobile-library sync sequence
-- separately from the durable ledger schema migration. A server that
-- already applied the initial ledger migration remains upgradeable.
-- Migration changes no existing audio files, jobs or enablement defaults.
ALTER TABLE "DowntifyIntegration"
  ADD COLUMN "nativeImportLibraryCursor" INTEGER;
