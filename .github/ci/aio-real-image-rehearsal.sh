#!/usr/bin/env bash
# Real upstream v1.10.0 AIO -> fork candidate -> independent upstream rollback.
# Uses only throwaway synthetic credentials/data and isolated GitHub-hosted CI.
set -euo pipefail

if [ "${GITHUB_ACTIONS:-}" != "true" ]; then
    echo "Refusing to run real-image migration outside GitHub Actions" >&2
    exit 1
fi

original_image="chevron7locked/kima:v1.10.0"
candidate_image="kima-hub:aio-ci-smoke"
old="kima-ci-real-old"
upgraded="kima-ci-real-upgraded"
restored="kima-ci-real-rollback"
old_data="kima-ci-real-old-data"
new_data="kima-ci-real-new-data"
restore_data="kima-ci-real-restore-data"
music="kima-ci-real-music"
tmp="$(mktemp -d)"
url="http://127.0.0.1:3132"
admin="ci_real_image_admin"
member="ci_real_image_listener"
admin_pass="$(openssl rand -hex 20)"
member_pass="$(openssl rand -hex 20)"

cleanup() {
    echo "---- Real-image AIO test diagnostic logs ----"
    for c in "$old" "$upgraded" "$restored"; do
        docker logs --tail 70 "$c" 2>/dev/null || true
        docker rm -f "$c" >/dev/null 2>&1 || true
    done
    docker volume rm -f "$old_data" "$new_data" "$restore_data" "$music" >/dev/null 2>&1 || true
    rm -rf "$tmp"
}
trap cleanup EXIT

# Fail rather than reuse any preexisting Docker volume/container.
for c in "$old" "$upgraded" "$restored"; do
    if docker container inspect "$c" >/dev/null 2>&1; then
        echo "Unexpected test container already exists: $c" >&2
        exit 1
    fi
done
for v in "$old_data" "$new_data" "$restore_data" "$music"; do
    if docker volume inspect "$v" >/dev/null 2>&1; then
        echo "Unexpected test volume already exists: $v" >&2
        exit 1
    fi
done
docker image inspect "$candidate_image" >/dev/null

echo "---- Pull original upstream image (not latest) ----"
docker pull --platform linux/amd64 "$original_image"
docker image inspect "$original_image" >/dev/null
docker volume create "$old_data" >/dev/null
docker volume create "$music" >/dev/null

# Start either actual monolithic image, using the same exact isolated /music
# but separate /data copies. Publish HTTP ONLY to localhost of CI runner.
start_image() {
    local name="$1" data="$2" image="$3"
    docker run -d --name "$name" \
        --memory=6g \
        -p 127.0.0.1:3132:3030 \
        -v "$data":/data \
        -v "$music":/music \
        -e DISABLE_CLAP=true \
        "$image" >/dev/null
}
wait_healthy() {
    local name="$1" healthy=false status
    for i in $(seq 1 120); do
        status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name")"
        if [ "$status" = healthy ]; then healthy=true; break; fi
        if [ "$(docker inspect --format '{{.State.Status}}' "$name")" != running ]; then break; fi
        sleep 5
    done
    if [ "$healthy" != true ]; then
        echo "Container failed to become healthy: $name" >&2
        return 1
    fi
    curl -fsS --max-time 30 "$url/login" -o /dev/null
}
json_user() {
    CI_USERNAME="$1" CI_PASSWORD="$2" CI_ROLE="$3" python3 -c '
import json,os
v={"username":os.environ["CI_USERNAME"],"password":os.environ["CI_PASSWORD"]}
if os.environ["CI_ROLE"]: v["role"]=os.environ["CI_ROLE"]
print(json.dumps(v))
'
}
login_token() {
    local username="$1" pass="$2"
    local data
    data="$(curl -fsS --max-time 30 -H 'Content-Type: application/json' \
        -d "$(json_user "$username" "$pass" "")" "$url/api/auth/login")"
    printf '%s' "$data" | python3 -c '
import json,sys
obj=json.load(sys.stdin)
assert "token" in obj and not obj.get("requires2FA")
print(obj["token"])
'
}
check_records() {
    local name="$1" mode="$2"
    local post
    post="$(docker exec -u postgres "$name" psql -d kima -Atc \
        "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='User' AND column_name IN ('canRequestAlbums','canDownloadTracks')")"
    if [ "$mode" = before ]; then test "$post" = 0; else test "$post" = 2; fi
    docker exec -u postgres "$name" psql -d kima -v ON_ERROR_STOP=1 -Atc \
      "SELECT 1 FROM \"Track\" WHERE id='ci-real-old-track' AND title='Original CI Track' AND \"filePath\"='ci-real-old-track.wav'" | grep -qx 1
    docker exec -u postgres "$name" psql -d kima -v ON_ERROR_STOP=1 -Atc \
      "SELECT 1 FROM \"Playlist\" WHERE id='ci-real-old-playlist' AND name='Original Playlist'" | grep -qx 1
    docker exec -u postgres "$name" psql -d kima -v ON_ERROR_STOP=1 -Atc \
      "SELECT 1 FROM \"PlaylistItem\" WHERE id='ci-real-old-playlist-item' AND \"trackId\"='ci-real-old-track'" | grep -qx 1
    curl -fsS --max-time 30 -H "Authorization: Bearer $(login_token "$admin" "$admin_pass")" \
      "$url/api/auth/me" | python3 -c '
import json,sys
user=json.load(sys.stdin)
assert user["username"]=="ci_real_image_admin" and user["role"]=="admin"
'
    curl -fsS --max-time 30 -H "Authorization: Bearer $(login_token "$member" "$member_pass")" \
      "$url/api/auth/me" | python3 -c '
import json,sys
user=json.load(sys.stdin)
assert user["username"]=="ci_real_image_listener" and user["role"]=="user"
'
    test "$(docker exec "$name" sha256sum /data/secrets/session_secret | cut -d' ' -f1)" = "$session_hash"
    test "$(docker exec "$name" sha256sum /data/secrets/encryption_key | cut -d' ' -f1)" = "$encryption_hash"
    echo "Real-image $mode: original accounts, playlist, track and secrets preserved"
}

echo "---- Start real upstream v1.10.0 AIO image ----"
start_image "$old" "$old_data" "$original_image"
wait_healthy "$old"

registration="$(curl -fsS --max-time 30 -H 'Content-Type: application/json' \
    -d "$(json_user "$admin" "$admin_pass" "")" "$url/api/onboarding/register")"
printf '%s' "$registration" | python3 -c '
import json,sys
obj=json.load(sys.stdin)
assert obj["user"]["role"]=="admin"
'
unset registration
admin_token="$(login_token "$admin" "$admin_pass")"
curl -fsS --max-time 60 -o /dev/null -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $admin_token" -d '{}' "$url/api/onboarding/complete"
member_info="$(curl -fsS --max-time 30 -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $admin_token" \
    -d "$(json_user "$member" "$member_pass" user)" "$url/api/auth/create-user")"
member_id="$(printf '%s' "$member_info" | python3 -c '
import json,sys,re
u=json.load(sys.stdin)
assert u["role"]=="user"
assert re.fullmatch(r"[a-z0-9-]{10,80}",u["id"])
print(u["id"])
')"
unset member_info admin_token

# Seed a real synthetic WAV plus music and playlist records IN THE OLD IMAGE.
python3 - "$tmp/ci-real-old-track.wav" <<'PY'
import math, struct, sys, wave
with wave.open(sys.argv[1], "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(44100)
    w.writeframes(b"".join(struct.pack("<h",int(4000*math.sin(i*440*2*math.pi/44100))) for i in range(44100)))
PY
docker cp "$tmp/ci-real-old-track.wav" "$old:/music/ci-real-old-track.wav"
size="$(wc -c < "$tmp/ci-real-old-track.wav")"
docker exec -i -u postgres "$old" psql -d kima -v ON_ERROR_STOP=1 \
    -v fixture_user="$member_id" -v wav_size="$size" <<'SQL'
INSERT INTO "Artist" ("id","mbid","name","identityKey","normalizedName")
VALUES ('ci-real-old-artist','ci-real-old-artist-mbid','Original CI Artist','ci-real-old-artist-key','original ci artist');
INSERT INTO "Album" ("id","rgMbid","artistId","title","primaryType","identityKey","year")
VALUES ('ci-real-old-album','ci-real-old-album-mbid','ci-real-old-artist','Original CI Album','Album','ci-real-old-album-key',2026);
INSERT INTO "Track" ("id","albumId","title","trackNo","duration","filePath",
    "fileModified","fileSize","updatedAt","moodTags","essentiaGenres")
VALUES ('ci-real-old-track','ci-real-old-album','Original CI Track',1,1,
    'ci-real-old-track.wav',NOW(),:wav_size,NOW(),ARRAY[]::text[],ARRAY[]::text[]);
INSERT INTO "Playlist" ("id","userId","name","updatedAt")
VALUES ('ci-real-old-playlist',:'fixture_user','Original Playlist',NOW());
INSERT INTO "PlaylistItem" ("id","playlistId","trackId","sort","rank")
VALUES ('ci-real-old-playlist-item','ci-real-old-playlist','ci-real-old-track',0,'a0');
SQL

session_hash="$(docker exec "$old" sha256sum /data/secrets/session_secret | cut -d' ' -f1)"
encryption_hash="$(docker exec "$old" sha256sum /data/secrets/encryption_key | cut -d' ' -f1)"
check_records "$old" before

echo "---- Cold snapshot of the ENTIRE actual original image /data volume ----"
docker stop -t 60 "$old" >/dev/null
docker rm "$old" >/dev/null
docker run --rm --entrypoint tar \
    -v "$old_data":/source:ro -v "$tmp":/backup \
    alpine:3.20 -C /source -cpf /backup/original-data.tar .
test -s "$tmp/original-data.tar"

# Independent copies: upgrading one must never contaminate the rollback one.
for volume in "$new_data" "$restore_data"; do
    docker volume create "$volume" >/dev/null
    docker run --rm --entrypoint tar \
        -v "$volume":/restore -v "$tmp":/backup:ro \
        alpine:3.20 -C /restore -xpf /backup/original-data.tar
done

echo "---- Start new fork image using a COPY of upstream's full /data ----"
start_image "$upgraded" "$new_data" "$candidate_image"
wait_healthy "$upgraded"
check_records "$upgraded" after
bash .github/ci/check-aio-db-credential.sh "$upgraded"
docker exec -u postgres "$upgraded" psql -d kima -v ON_ERROR_STOP=1 -Atc \
    "SELECT 1 FROM \"User\" WHERE username='ci_real_image_listener' AND NOT \"canRequestAlbums\" AND NOT \"canDownloadTracks\"" | grep -qx 1
echo "PASS: original monolithic AIO -> fork image preserved full data and role defaults"

echo "---- Restore original unchanged snapshot in actual upstream AIO image ----"
docker stop -t 60 "$upgraded" >/dev/null
docker rm "$upgraded" >/dev/null
start_image "$restored" "$restore_data" "$original_image"
wait_healthy "$restored"
check_records "$restored" before
echo "PASS: original monolithic AIO runs independently restored old /data volume"
echo "Full actual-image upgrade and independent old-image rollback: PASS"
