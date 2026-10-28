#!/usr/bin/env bash
# Additional generated audio for real-browser release acceptance, never real music.
set -euo pipefail
if [ "${GITHUB_ACTIONS:-}" != true ] || [ "${GITHUB_REPOSITORY:-}" != OxygenGS/kima-hub ]; then
    echo "Refusing to seed outside the disposable repository CI runner" >&2
    exit 1
fi
name=kima-ci-v111-aio
test "$(docker inspect --format '{{.Config.Image}}' "$name")" = kima-hub:aio-ci-smoke
for mapping in 'kima-ci-v111-data /data' 'kima-ci-v111-music /music'; do
    docker inspect --format '{{range .Mounts}}{{println .Name .Destination}}{{end}}' "$name" | grep -Fxq "$mapping"
done
count="$(docker exec -u postgres "$name" psql -d kima -Atc "SELECT count(*) FROM \"Artist\" WHERE id='ci-ui-artist'")"
test "$count" = 0 || { echo "Refusing to overwrite an existing release UI fixture" >&2; exit 1; }

docker exec "$name" sh -c 'mkdir -p /music/ci-release-ui && ffmpeg -nostdin -hide_banner -loglevel error -y -f lavfi -i "sine=frequency=440:sample_rate=44100:duration=120" -af volume=0.02 -ac 2 -c:a pcm_s16le /music/ci-release-ui/one.wav && cp /music/ci-release-ui/one.wav /music/ci-release-ui/two.wav && cp /music/ci-release-ui/one.wav /music/ci-release-ui/three.wav'
size="$(docker exec "$name" stat -c %s /music/ci-release-ui/one.wav)"
[[ "$size" =~ ^[0-9]+$ ]]
test "$size" -gt 10000000

docker exec -i -u postgres "$name" psql -d kima -v ON_ERROR_STOP=1 <<SQL
INSERT INTO "Artist" ("id","mbid","name","identityKey","normalizedName")
VALUES ('ci-ui-artist','ci-ui-fixture-artist','CI Interface Artist','ci-ui-artist','ci interface artist');
INSERT INTO "Album" ("id","rgMbid","artistId","title","primaryType","identityKey","year")
VALUES ('ci-ui-album','ci-ui-fixture-album','ci-ui-artist','CI Interface Album','Album','ci-ui-album',2026);
INSERT INTO "Track" ("id","albumId","title","trackNo","duration","filePath","fileModified","fileSize","updatedAt","moodTags","essentiaGenres") VALUES
('ci-ui-track-one','ci-ui-album','CI Interface Track One',1,120,'ci-release-ui/one.wav',NOW(),$size,NOW(),ARRAY[]::text[],ARRAY[]::text[]),
('ci-ui-track-two','ci-ui-album','CI Interface Track Two',2,120,'ci-release-ui/two.wav',NOW(),$size,NOW(),ARRAY[]::text[],ARRAY[]::text[]),
('ci-ui-track-three','ci-ui-album','CI Interface Track Three',3,120,'ci-release-ui/three.wav',NOW(),$size,NOW(),ARRAY[]::text[],ARRAY[]::text[]);
SQL
echo "Generated three disposable two-minute tracks for application playback acceptance"
