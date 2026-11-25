#!/usr/bin/env bash
# Additional generated audio for real-browser release acceptance, never real music.
set -euo pipefail
if [ "${GITHUB_ACTIONS:-}" != true ] || [ "${GITHUB_REPOSITORY:-}" != OxygenGS/kima-hub ]; then
    echo "Refusing to seed outside the disposable repository CI runner" >&2
    exit 1
fi
if [ -n "${DOCKER_HOST:-}" ] || [ "${DOCKER_CONTEXT:-default}" != default ]; then
    echo "Refusing a non-default Docker connection" >&2
    exit 1
fi

# Both existing smoke workflows call this helper. Accept exactly one known
# disposable container, with its own matching volumes and loopback-only port.
containers=()
for candidate in kima-ci-v111-aio kima-aio-ci-smoke; do
    if docker container inspect "$candidate" >/dev/null 2>&1; then
        containers+=("$candidate")
    fi
done
test "${#containers[@]}" = 1 || { echo "Expected exactly one disposable AIO fixture" >&2; exit 1; }
name="${containers[0]}"
case "$name" in
    kima-ci-v111-aio) prefix=kima-ci-v111 ;;
    kima-aio-ci-smoke) prefix=kima-ci-aio ;;
    *) exit 1 ;;
esac
test "$(docker inspect --format '{{.State.Running}}' "$name")" = true
test "$(docker inspect --format '{{.Config.Image}}' "$name")" = kima-hub:aio-ci-smoke
test "$(docker inspect --format '{{range (index .NetworkSettings.Ports "3030/tcp")}}{{println .HostIp .HostPort}}{{end}}' "$name")" = '127.0.0.1 3130'
for mapping in "volume ${prefix}-data /data" "volume ${prefix}-music /music"; do
    docker inspect --format '{{range .Mounts}}{{println .Type .Name .Destination}}{{end}}' "$name" | grep -Fxq "$mapping"
done
count="$(docker exec -u postgres "$name" psql -d kima -Atc "SELECT count(*) FROM \"Artist\" WHERE id='ci-ui-artist'")"
test "$count" = 0 || { echo "Refusing to overwrite an existing release UI fixture" >&2; exit 1; }

# Exercise the actual shipped analyzer and its bounded FFmpeg reads with
# generated signals, on both native architectures. No library data is used.
docker exec -i "$name" sh -c 'cd /app/audio-analyzer && python3 -' < .github/ci/check-dj-cue-runtime.py

docker exec "$name" sh -c 'mkdir -p /music/ci-release-ui && ffmpeg -nostdin -hide_banner -loglevel error -y -f lavfi -i "sine=frequency=440:sample_rate=44100:duration=120" -af volume=0.02 -ac 2 -c:a pcm_s16le /music/ci-release-ui/one.wav && cp /music/ci-release-ui/one.wav /music/ci-release-ui/two.wav && cp /music/ci-release-ui/one.wav /music/ci-release-ui/three.wav'
size="$(docker exec "$name" stat -c %s /music/ci-release-ui/one.wav)"
[[ "$size" =~ ^[0-9]+$ ]]
test "$size" -gt 10000000

# Ground-truth pulse times are known from the generated PCM; these are
# synthetic cue fixtures for the browser scheduler, not extractor claims.
dj_profiles="$(docker exec -i "$name" sh -c 'cd /app/audio-analyzer && python3 - /music/ci-release-ui' < .github/ci/seed-dj-timing.py)"
mapfile -t dj_profile <<< "$dj_profiles"
test "${#dj_profile[@]}" = 2
dj_size="$(docker exec "$name" stat -c %s /music/ci-release-ui/dj-one.wav)"
test "$dj_size" = "$(docker exec "$name" stat -c %s /music/ci-release-ui/dj-two.wav)"
[[ "$dj_size" =~ ^[0-9]+$ ]]

docker exec -i -u postgres "$name" psql -d kima -v ON_ERROR_STOP=1 \
    -v "dj_one=${dj_profile[0]}" -v "dj_two=${dj_profile[1]}" <<SQL
BEGIN;
INSERT INTO "Artist" ("id","mbid","name","identityKey","normalizedName")
VALUES ('ci-ui-artist','ci-ui-fixture-artist','CI Interface Artist','ci-ui-artist','ci interface artist');
INSERT INTO "Album" ("id","rgMbid","artistId","title","primaryType","identityKey","year")
VALUES ('ci-ui-album','ci-ui-fixture-album','ci-ui-artist','CI Interface Album','Album','ci-ui-album',2026);
-- The real album API derives owned status from this relation, not track count.
-- OwnedAlbum has a composite artistId/rgMbid key, not id or albumId columns.
INSERT INTO "OwnedAlbum" ("artistId","rgMbid","source")
VALUES ('ci-ui-artist','ci-ui-fixture-album','import');
INSERT INTO "Track" ("id","albumId","title","trackNo","duration","filePath","fileModified","fileSize","updatedAt","moodTags","essentiaGenres") VALUES
('ci-ui-track-one','ci-ui-album','CI Interface Track One',1,120,'ci-release-ui/one.wav',NOW(),$size,NOW(),ARRAY[]::text[],ARRAY[]::text[]),
('ci-ui-track-two','ci-ui-album','CI Interface Track Two',2,120,'ci-release-ui/two.wav',NOW(),$size,NOW(),ARRAY[]::text[],ARRAY[]::text[]),
('ci-ui-track-three','ci-ui-album','CI Interface Track Three',3,120,'ci-release-ui/three.wav',NOW(),$size,NOW(),ARRAY[]::text[],ARRAY[]::text[]);
-- Separate rhythmic fixture: do not change the existing sine-tone,
-- album-size, artist-overview or EQ acceptance fixture.
INSERT INTO "Artist" ("id","mbid","name","identityKey","normalizedName")
VALUES ('ci-dj-timing-artist','ci-dj-timing-fixture-artist','CI DJ Timing Artist','ci-dj-timing-artist','ci dj timing artist');
INSERT INTO "Album" ("id","rgMbid","artistId","title","primaryType","identityKey","year")
VALUES ('ci-dj-timing-album','ci-dj-timing-fixture-album','ci-dj-timing-artist','CI DJ Timing Album','Album','ci-dj-timing-album',2026);
INSERT INTO "OwnedAlbum" ("artistId","rgMbid","source")
VALUES ('ci-dj-timing-artist','ci-dj-timing-fixture-album','import');
INSERT INTO "Track" ("id","albumId","title","trackNo","duration","filePath","fileModified","fileSize","updatedAt","moodTags","essentiaGenres","analysisStatus","analyzedAt","bpm") VALUES
('ci-dj-timing-one','ci-dj-timing-album','CI DJ Timing One',1,48,'ci-release-ui/dj-one.wav',NOW(),$dj_size,NOW(),ARRAY[]::text[],ARRAY[]::text[],'completed',NOW(),120),
('ci-dj-timing-two','ci-dj-timing-album','CI DJ Timing Two',2,48,'ci-release-ui/dj-two.wav',NOW(),$dj_size,NOW(),ARRAY[]::text[],ARRAY[]::text[],'completed',NOW(),120);
INSERT INTO "TrackDjCue" ("trackId","sourcePath","sourceModified","sourceSize","sourceAnalyzedAt","profile")
VALUES
('ci-dj-timing-one','ci-release-ui/dj-one.wav',NOW(),$dj_size,NOW(),:'dj_one'::jsonb),
('ci-dj-timing-two','ci-release-ui/dj-two.wav',NOW(),$dj_size,NOW(),:'dj_two'::jsonb);
COMMIT;
SQL
echo "Generated three owned disposable two-minute tracks and two separate pulse-audio DJ timing fixtures"
