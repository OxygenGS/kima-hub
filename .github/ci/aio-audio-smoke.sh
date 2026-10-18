#!/usr/bin/env bash
# Disposable hosted AIO audio smoke. Only generated 3s WAV / synthetic accounts.
# Covers HTTP audio streaming and playback APIs, NOT audible browser playback.
set -euo pipefail
name="$1"
url="$2"
track="ci-audio-track"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

assert_status() {
    if [ "$2" != "$1" ]; then
        echo "FAIL: $3 (expected HTTP $1, got $2)"
        return 1
    fi
    echo "PASS: $3 (HTTP $2)"
}

echo "---- Generate three seconds of stereo WAV on temporary /music ----"
docker exec "$name" sh -c \
    'mkdir -p /music/ci-audio && ffmpeg -nostdin -hide_banner -loglevel error -y -f lavfi -i "sine=frequency=440:sample_rate=44100:duration=3" -ac 2 -c:a pcm_s16le /music/ci-audio/playback-fixture.wav'
docker cp "$name:/music/ci-audio/playback-fixture.wav" "$tmp/original.wav"
file_size="$(wc -c < "$tmp/original.wav" | tr -d ' ')"
test "$file_size" -gt 100000
python3 - "$tmp/original.wav" <<'PY'
import sys, wave
with wave.open(sys.argv[1], "rb") as wav:
    assert wav.getnchannels() == 2
    assert wav.getframerate() == 44100
    assert 2.9 < wav.getnframes() / wav.getframerate() < 3.1
print("Valid generated WAV")
PY

echo "---- Create synthetic library records in disposable PostgreSQL ----"
docker exec -i -u postgres "$name" psql -d kima -v ON_ERROR_STOP=1 <<SQL
INSERT INTO "Artist" ("id","mbid","name","identityKey","normalizedName")
VALUES ('ci-audio-artist','ci-fixture-streaming-mbid','CI Audio Artist',
        'ci-audio-artist','ci audio artist');
INSERT INTO "Album" ("id","rgMbid","artistId","title","primaryType","identityKey","year")
VALUES ('ci-audio-album','ci-fixture-streaming-album-mbid','ci-audio-artist',
        'CI Audio Album','Album','ci-audio-album',2026);
INSERT INTO "Track" ("id","albumId","title","trackNo","duration","filePath",
        "fileModified","fileSize","updatedAt","moodTags","essentiaGenres")
VALUES ('ci-audio-track','ci-audio-album','CI Generated 440Hz Tone',1,3,
        'ci-audio/playback-fixture.wav',NOW(),$file_size,NOW(),
        ARRAY[]::text[],ARRAY[]::text[]);
SQL

echo "---- Register and sign in first admin via real app API ----"
admin_register="$(curl -fsS --max-time 30 -H 'Content-Type: application/json' \
    -d '{"username":"ci_audio_admin","password":"ci-fixture-only-passphrase"}' \
    "$url/api/onboarding/register")"
printf '%s' "$admin_register" | python3 -c \
    'import json,sys; d=json.load(sys.stdin); assert d["user"]["role"]=="admin",d'
admin_login="$(curl -fsS --max-time 30 -H 'Content-Type: application/json' \
    -d '{"username":"ci_audio_admin","password":"ci-fixture-only-passphrase"}' \
    "$url/api/auth/login")"
admin_token="$(printf '%s' "$admin_login" | python3 -c \
    'import json,sys; d=json.load(sys.stdin); assert d["user"]["role"]=="admin"; print(d["token"])')"
admin_refresh="$(printf '%s' "$admin_login" | python3 -c \
    'import json,sys; print(json.load(sys.stdin)["refreshToken"])')"
test -n "$admin_token" && test -n "$admin_refresh"

curl -fsS --max-time 20 -H "Authorization: Bearer $admin_token" \
    "$url/api/library/tracks?limit=10" | python3 -c \
    'import json,sys; d=json.load(sys.stdin); assert any(t["id"]=="ci-audio-track" for t in d["tracks"]),d; print("Track visible via library API")'

stream="$url/api/library/tracks/$track/stream?quality=original"
status="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' "$stream")"
assert_status 401 "$status" "Anonymous streaming denied"
status="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $admin_refresh" "$stream")"
assert_status 401 "$status" "Refresh token cannot authenticate streaming"

echo "---- Full WAV via Next.js reverse proxy ----"
status="$(curl -sS --max-time 45 -o "$tmp/full.wav" -D "$tmp/full.headers" \
    -w '%{http_code}' -H "Authorization: Bearer $admin_token" "$stream")"
assert_status 200 "$status" "Full WAV stream"
cmp "$tmp/original.wav" "$tmp/full.wav"
grep -qi '^content-type: audio/wav' "$tmp/full.headers"
grep -qi '^accept-ranges: bytes' "$tmp/full.headers"
echo "PASS: Stream matches original audio byte-for-byte"

echo "---- HTTP Range and ETag ----"
status="$(curl -sS --max-time 20 -o "$tmp/range.wav" -D "$tmp/range.headers" \
    -w '%{http_code}' -H 'Range: bytes=1024-2047' \
    -H "Authorization: Bearer $admin_token" "$stream")"
assert_status 206 "$status" "Range seek"
grep -qi "^content-range: bytes 1024-2047/$file_size" "$tmp/range.headers"
dd if="$tmp/original.wav" of="$tmp/expected-range.wav" bs=1024 skip=1 count=1 status=none
cmp "$tmp/expected-range.wav" "$tmp/range.wav"
status="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $admin_token" \
    -H 'Range: bytes=999999999-' "$stream")"
assert_status 416 "$status" "Unsatisfiable range"
etag="$(awk 'tolower($1)=="etag:" {$1=""; sub(/^ /,""); sub(/\r$/,""); print; exit}' "$tmp/full.headers")"
test -n "$etag"
status="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $admin_token" -H "If-None-Match: $etag" "$stream")"
assert_status 304 "$status" "Conditional ETag response"

echo "---- Low-bitrate MP3 transcode, verified by ffprobe ----"
status="$(curl -sS --max-time 130 -o "$tmp/low.mp3" -D "$tmp/low.headers" \
    -w '%{http_code}' -H "Authorization: Bearer $admin_token" \
    "$url/api/library/tracks/$track/stream?quality=low")"
assert_status 200 "$status" "MP3 transcode stream"
grep -qi '^content-type: audio/mpeg' "$tmp/low.headers"
test "$(wc -c < "$tmp/low.mp3")" -gt 2000
docker cp "$tmp/low.mp3" "$name:/tmp/ci-smoke-transcoded.mp3"
codec="$(docker exec "$name" ffprobe -v error -select_streams a:0 \
    -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 \
    /tmp/ci-smoke-transcoded.mp3 | tr -d '\r')"
test "$codec" = mp3
echo "PASS: MP3 is independently recognized by ffprobe"

echo "---- Real waveform decode through authenticated HTTP API ----"
waveform="$url/api/library/tracks/$track/waveform"
status="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' "$waveform")"
assert_status 401 "$status" "Anonymous waveform denied"
status="$(curl -sS --max-time 45 -o "$tmp/waveform.json" -w '%{http_code}' \
    -H "Authorization: Bearer $admin_token" "$waveform")"
assert_status 200 "$status" "Authenticated real FFmpeg waveform"
python3 - "$tmp/waveform.json" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as handle:
    payload = json.load(handle)
peaks = payload["peaks"]
assert payload["count"] == 400 and len(peaks) == 400, payload
assert all(isinstance(x, (int, float)) and 0 <= x <= 1 for x in peaks)
assert max(peaks) > 0.5, "Non-silent fixture decoded as silence"
print("PASS: system FFmpeg decoded non-silent PCM into 400 normalized waveform peaks")
PY
curl -fsS --max-time 20 -H "Authorization: Bearer $admin_token" \
    "$waveform" -o "$tmp/waveform-cached.json"
cmp "$tmp/waveform.json" "$tmp/waveform-cached.json"
echo "PASS: cached waveform API response matches first computation"


echo "---- Stream-scoped ticket and negative authorization cases ----"
ticket="$(curl -fsS --max-time 20 -X POST \
    -H "Authorization: Bearer $admin_token" \
    "$url/api/auth/stream-ticket" | python3 -c \
    'import json,sys; d=json.load(sys.stdin); assert d["expiresIn"]>0; print(d["ticket"])')"
test -n "$ticket"
status="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' \
    -H 'Range: bytes=0-127' \
    "$url/api/library/tracks/$track/stream?quality=original&token=$ticket")"
assert_status 206 "$status" "Stream ticket permitted on stream path"
status="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' \
    "$url/api/library/tracks?token=$ticket")"
assert_status 401 "$status" "Ticket denied on non-stream API"
status="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $ticket" "$url/api/library/tracks")"
assert_status 401 "$status" "Ticket denied as non-stream Bearer"

echo "---- Standard listener with downloads disabled can listen ----"
viewer="$(curl -fsS --max-time 30 -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $admin_token" \
    -d '{"username":"ci_audio_listener","password":"ci-listener-fixture-only","role":"user"}' \
    "$url/api/auth/create-user")"
printf '%s' "$viewer" | python3 -c \
    'import json,sys; d=json.load(sys.stdin); assert d["role"]=="user"; assert d["canDownloadTracks"] is False; assert d["canRequestAlbums"] is False; print("Default permissions verified")'
viewer_token="$(curl -fsS --max-time 30 -H 'Content-Type: application/json' \
    -d '{"username":"ci_audio_listener","password":"ci-listener-fixture-only"}' \
    "$url/api/auth/login" | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')"
status="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $viewer_token" -H 'Range: bytes=0-127' "$stream")"
assert_status 206 "$status" "Regular user can listen without download permission"

echo "---- Save and reload player state and queue ----"
curl -fsS --max-time 20 -H "Authorization: Bearer $viewer_token" \
    -H 'Content-Type: application/json' \
    -d '{"playbackType":"track","trackId":"ci-audio-track","queue":[{"id":"ci-audio-track","title":"CI Generated 440Hz Tone","duration":3}],"currentIndex":0,"isShuffle":true}' \
    "$url/api/playback-state" | python3 -c \
    'import json,sys; d=json.load(sys.stdin); assert d["trackId"]=="ci-audio-track" and d["isShuffle"]; print("Playback state accepted")'
curl -fsS --max-time 20 -H "Authorization: Bearer $viewer_token" \
    "$url/api/playback-state" | python3 -c \
    'import json,sys; d=json.load(sys.stdin); assert d["trackId"]=="ci-audio-track"; assert d["queue"][0]["id"]=="ci-audio-track"; assert d["isShuffle"]; print("Queue persisted")'

echo "---- Verify streaming does not fabricate a completed listen ----"
# The source is only three seconds long. v1.11 requires a separate POST /plays
# with actual listened time, and never records tracks <= 30 seconds.
count="$(docker exec -u postgres "$name" psql -d kima -Atc \
    "SELECT count(*) FROM \"Play\" WHERE \"trackId\"='$track'")"
test "$count" = 0
curl -fsS --max-time 20 -H "Authorization: Bearer $viewer_token" \
    -H 'Content-Type: application/json' -d "{\"trackId\":\"$track\",\"secondsListened\":3}" \
    "$url/api/plays" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d == {"recorded":False,"reason":"too-short"}, d'
count="$(docker exec -u postgres "$name" psql -d kima -Atc \
    "SELECT count(*) FROM \"Play\" WHERE \"trackId\"='$track'")"
test "$count" = 0
echo "PASS: Short streams and explicit short play reports do not inflate history"

echo "---- Reject traversal beyond the music library ----"
docker exec -i -u postgres "$name" psql -d kima -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO "Track" ("id","albumId","title","trackNo","duration","filePath",
        "fileModified","fileSize","updatedAt","moodTags","essentiaGenres")
VALUES ('ci-traversal-track','ci-audio-album','Invalid Traversal',2,3,
        '../../etc/passwd',NOW(),42,NOW(),ARRAY[]::text[],ARRAY[]::text[]);
SQL
status="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer $admin_token" \
    "$url/api/library/tracks/ci-traversal-track/stream")"
assert_status 404 "$status" "Out-of-library audio path refused"

echo "AIO synthetic WAV playback/API, seek, MP3 transcode, auth and queue: PASS"
