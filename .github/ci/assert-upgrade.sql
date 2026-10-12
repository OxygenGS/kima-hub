-- Validate that applying fork migrations to a restored upstream database
-- retains the original records, account roles, music, links and settings.
\set ON_ERROR_STOP on
DO $checks$
BEGIN
  IF (SELECT COUNT(*) FROM "User" WHERE "id" IN ('upgrade-admin','upgrade-listener')) <> 2 THEN
    RAISE EXCEPTION 'Upgrade lost user accounts';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "User"
    WHERE "id"='upgrade-admin' AND "username"='ci_upgrade_admin'
      AND "passwordHash"='fixture-only-hash-admin' AND "role"='admin'
      AND "onboardingComplete" AND "tokenVersion"=9
  ) THEN RAISE EXCEPTION 'Admin account changed during upgrade'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "User"
    WHERE "id"='upgrade-listener' AND "username"='ci_upgrade_listener'
      AND "passwordHash"='fixture-only-hash-user' AND "role"='user'
      AND "onboardingComplete" AND "tokenVersion"=4
  ) THEN RAISE EXCEPTION 'Listener account changed during upgrade'; END IF;

  -- New fields must be present and false for EXISTING users (including admins,
  -- whose effective permission is granted by the backend's admin bypass).
  IF EXISTS (
    SELECT 1 FROM "User"
    WHERE "id" IN ('upgrade-admin','upgrade-listener')
      AND ("canRequestAlbums" IS DISTINCT FROM false
        OR "canDownloadTracks" IS DISTINCT FROM false)
  ) THEN RAISE EXCEPTION 'Existing users did not default to denied permissions'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "UserSettings"
    WHERE "userId"='upgrade-listener' AND "playbackQuality"='lossless'
      AND "wifiOnly" AND "offlineEnabled" AND "maxCacheSizeMb"=3072
  ) THEN RAISE EXCEPTION 'User playback settings changed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "SystemSettings"
    WHERE "id"='default' AND "registrationOpen" AND NOT "autoSync"
      AND "musicPath"='/music/fixture-collection'
      AND "downloadPath"='/downloads/fixture'
  ) THEN RAISE EXCEPTION 'Instance settings changed'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "Artist"
    WHERE "id"='upgrade-artist' AND "name"='Fixture Artist'
      AND "identityKey"='fixture-artist-key' AND "summary"='Preserve this artist'
  ) THEN RAISE EXCEPTION 'Artist metadata changed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "Album"
    WHERE "id"='upgrade-album' AND "artistId"='upgrade-artist'
      AND "title"='Fixture Album' AND "year"=2024
      AND "genres"='["Rock","Indie"]'::jsonb
  ) THEN RAISE EXCEPTION 'Album metadata changed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "Track"
    WHERE "id"='upgrade-track' AND "albumId"='upgrade-album'
      AND "title"='Fixture Track' AND "filePath"='/music/fixture-track.flac'
      AND "duration"=195 AND "fileSize"=1234567
  ) THEN RAISE EXCEPTION 'Track metadata changed'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "Playlist"
    WHERE "id"='upgrade-playlist' AND "userId"='upgrade-listener'
      AND "name"='Keep This Playlist' AND "isPublic"
  ) OR NOT EXISTS (
    SELECT 1 FROM "PlaylistItem"
    WHERE "id"='upgrade-playlist-item' AND "playlistId"='upgrade-playlist'
      AND "trackId"='upgrade-track' AND "sort"=0 AND "rank"='a0'
  ) THEN RAISE EXCEPTION 'Playlist or track ordering changed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "LikedTrack"
    WHERE "userId"='upgrade-listener' AND "trackId"='upgrade-track'
  ) OR NOT EXISTS (
    SELECT 1 FROM "Play"
    WHERE "id"='upgrade-play' AND "userId"='upgrade-listener'
      AND "trackId"='upgrade-track' AND "source"='LIBRARY'
  ) THEN RAISE EXCEPTION 'Listening history or likes changed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM "PlaybackState"
    WHERE "userId"='upgrade-listener' AND "trackId"='upgrade-track'
      AND "position"=12345 AND "isShuffle"
      AND "queue"='["upgrade-track"]'::jsonb
  ) THEN RAISE EXCEPTION 'Saved playback position or queue changed'; END IF;

  IF to_regclass('public."BrandingSettings"') IS NULL THEN
    RAISE EXCEPTION 'Instance branding table is missing';
  END IF;

  IF (SELECT COUNT(*) FROM "_prisma_migrations"
       WHERE "migration_name" IN (
         '20261012000000_add_music_permissions',
         '20261012210000_add_instance_branding')
       AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL) <> 2
  THEN RAISE EXCEPTION 'New migrations not recorded as applied'; END IF;
END
$checks$;

-- Verify default deny also applies to users created after an upgrade.
INSERT INTO "User" ("id","username","passwordHash")
VALUES ('upgrade-new-listener', 'ci_upgrade_new_listener', 'fixture-only-new-hash');
DO $checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "User"
    WHERE "id"='upgrade-new-listener' AND "role"='user'
      AND NOT "canRequestAlbums" AND NOT "canDownloadTracks"
  ) THEN RAISE EXCEPTION 'New non-admin account permissions not default-denied'; END IF;
END
$checks$;

\echo 'Upgraded schema, access defaults, original accounts and library data preserved.'
