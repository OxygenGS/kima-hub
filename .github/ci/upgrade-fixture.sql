-- Disposable SQL fixtures seeded into the upstream Kima 1.10.0 schema.
-- These are invented records, never user or production data.
\set ON_ERROR_STOP on
BEGIN;

INSERT INTO "User" ("id","username","passwordHash","role","onboardingComplete","tokenVersion")
VALUES
  ('upgrade-admin', 'ci_upgrade_admin', 'fixture-only-hash-admin', 'admin', true, 9),
  ('upgrade-listener', 'ci_upgrade_listener', 'fixture-only-hash-user', 'user', true, 4);

INSERT INTO "UserSettings" ("userId","playbackQuality","wifiOnly","offlineEnabled","maxCacheSizeMb")
VALUES ('upgrade-listener', 'lossless', true, true, 3072);

INSERT INTO "SystemSettings" ("id","registrationOpen","autoSync","musicPath","downloadPath","updatedAt")
VALUES ('default', true, false, '/music/fixture-collection', '/downloads/fixture', NOW());

INSERT INTO "Artist" ("id","mbid","name","identityKey","summary")
VALUES ('upgrade-artist', 'ci-fixture-artist-mbid', 'Fixture Artist', 'fixture-artist-key', 'Preserve this artist');

INSERT INTO "Album" ("id","rgMbid","artistId","title","primaryType","identityKey","year","genres")
VALUES ('upgrade-album', 'ci-fixture-album-mbid', 'upgrade-artist', 'Fixture Album', 'Album', 'fixture-album-key', 2024, '["Rock","Indie"]'::jsonb);

-- A metadata-only track: no audio file is needed for migration testing.
INSERT INTO "Track" ("id","albumId","title","trackNo","duration","filePath",
    "fileModified","fileSize","updatedAt","moodTags","essentiaGenres")
VALUES ('upgrade-track', 'upgrade-album', 'Fixture Track', 1, 195,
    '/music/fixture-track.flac', NOW(), 1234567, NOW(),
    ARRAY['relaxed']::text[], ARRAY['Rock']::text[]);

INSERT INTO "Playlist" ("id","userId","name","isPublic","updatedAt")
VALUES ('upgrade-playlist', 'upgrade-listener', 'Keep This Playlist', true, NOW());

INSERT INTO "PlaylistItem" ("id","playlistId","trackId","sort","rank")
VALUES ('upgrade-playlist-item', 'upgrade-playlist', 'upgrade-track', 0, 'a0');

INSERT INTO "LikedTrack" ("userId","trackId")
VALUES ('upgrade-listener', 'upgrade-track');

INSERT INTO "Play" ("id","userId","trackId","source")
VALUES ('upgrade-play', 'upgrade-listener', 'upgrade-track', 'LIBRARY');

INSERT INTO "PlaybackState" ("userId","playbackType","trackId","queue",
    "currentIndex","isShuffle","position","updatedAt")
VALUES ('upgrade-listener', 'track', 'upgrade-track', '["upgrade-track"]'::jsonb,
    0, true, 12345, NOW());

COMMIT;
\echo 'Synthetic legacy records inserted successfully.'
