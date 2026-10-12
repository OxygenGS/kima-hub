-- Verify a second migration pass is idempotent and does not overwrite
-- post-upgrade custom permissions, branding, or original data.
\set ON_ERROR_STOP on
DO $checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "User"
    WHERE "id"='upgrade-listener' AND "username"='ci_upgrade_listener'
      AND "canRequestAlbums" AND "canDownloadTracks"
      AND "tokenVersion"=4
  ) THEN RAISE EXCEPTION 'Granted permissions or account data did not survive the second deploy'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "BrandingSettings"
    WHERE "id"='default' AND "name"='Chillverse Upgrade Fixture'
      AND "tagline"='Kept across migrations'
      AND "accentColor"='#3dacdb' AND "backgroundColor"='#0a0a0a'
  ) THEN RAISE EXCEPTION 'Custom instance branding did not survive the second deploy'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "PlaylistItem"
    WHERE "id"='upgrade-playlist-item' AND "playlistId"='upgrade-playlist'
      AND "trackId"='upgrade-track'
  ) THEN RAISE EXCEPTION 'Original music data lost after second migration deploy'; END IF;

  IF (SELECT COUNT(*) FROM "_prisma_migrations"
       WHERE "migration_name" IN (
         '20261012000000_add_music_permissions',
         '20261012210000_add_instance_branding')
       AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL) <> 2
  THEN RAISE EXCEPTION 'Migration history changed unexpectedly on second deploy'; END IF;
END
$checks$;
\echo 'Idempotent migrations: original data and post-upgrade customization retained.'
