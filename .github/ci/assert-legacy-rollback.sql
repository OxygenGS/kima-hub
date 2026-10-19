-- Independently restored PRE-FORK database, from a full offline /data snapshot.
-- This validation must run against a NEW throwaway legacy PostgreSQL container,
-- never against migrated /data or any user's original Docker volume.
\set ON_ERROR_STOP on
DO $legacy$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_name='User'
        AND column_name IN ('canRequestAlbums','canDownloadTracks')) <> 0
  THEN RAISE EXCEPTION 'Restored snapshot unexpectedly contains fork permissions'; END IF;

  IF to_regclass('public."BrandingSettings"') IS NOT NULL
  THEN RAISE EXCEPTION 'Restored snapshot unexpectedly contains new branding table'; END IF;

  IF NOT EXISTS (
      SELECT 1 FROM "User"
      WHERE id='upgrade-admin' AND username='ci_upgrade_admin'
        AND "passwordHash"='fixture-only-hash-admin'
        AND role='admin' AND "tokenVersion"=9
  ) OR NOT EXISTS (
      SELECT 1 FROM "User"
      WHERE id='upgrade-listener' AND username='ci_upgrade_listener'
        AND "passwordHash"='fixture-only-hash-user'
        AND role='user' AND "tokenVersion"=4
  ) THEN RAISE EXCEPTION 'Original users/credentials not restored'; END IF;

  IF EXISTS (SELECT 1 FROM "User" WHERE id='upgrade-new-listener')
  THEN RAISE EXCEPTION 'Restored old data was contaminated by the upgrade'; END IF;

  IF NOT EXISTS (
      SELECT 1 FROM "UserSettings"
      WHERE "userId"='upgrade-listener' AND "playbackQuality"='lossless'
        AND "wifiOnly" AND "offlineEnabled" AND "maxCacheSizeMb"=3072
  ) THEN RAISE EXCEPTION 'Original playback preferences not restored'; END IF;

  IF NOT EXISTS (
      SELECT 1 FROM "SystemSettings"
      WHERE id='default' AND "registrationOpen" AND NOT "autoSync"
        AND "musicPath"='/music/fixture-collection'
  ) THEN RAISE EXCEPTION 'Original system settings not restored'; END IF;

  IF NOT EXISTS (
      SELECT 1 FROM "Track"
      WHERE id='upgrade-track' AND "albumId"='upgrade-album'
        AND title='Fixture Track' AND "filePath"='/music/fixture-track.flac'
  ) OR NOT EXISTS (
      SELECT 1 FROM "PlaylistItem"
      WHERE id='upgrade-playlist-item' AND "playlistId"='upgrade-playlist'
        AND "trackId"='upgrade-track'
  ) OR NOT EXISTS (
      SELECT 1 FROM "LikedTrack"
      WHERE "userId"='upgrade-listener' AND "trackId"='upgrade-track'
  ) OR NOT EXISTS (
      SELECT 1 FROM "Play"
      WHERE id='upgrade-play' AND "trackId"='upgrade-track'
  ) OR NOT EXISTS (
      SELECT 1 FROM "PlaybackState"
      WHERE "userId"='upgrade-listener' AND "trackId"='upgrade-track'
        AND "position"=12345
  ) THEN RAISE EXCEPTION 'Original music, playlist, playback or history not restored'; END IF;
END
$legacy$;
\echo 'Original pre-migration users, preferences and music restored independently.'
