#!/usr/bin/env bash
# Sourced only by the generated, exact-source disposable recovery rehearsal.
if [ "${GITHUB_ACTIONS:-}" != true ] || [ "${GITHUB_REPOSITORY:-}" != OxygenGS/kima-hub ] || [ "${RUNNER_ENVIRONMENT:-}" != github-hosted ]; then
    echo 'Refusing non-disposable recovery execution' >&2; exit 1
fi
if [ -n "${DOCKER_HOST:-}" ] || [ "$(docker context show)" != default ]; then
    echo 'Refusing a remote or non-default Docker context' >&2; exit 1
fi
case "${NONROOT_RECOVERY_TRACK:-}" in
    ci-real-old-track|ci-v111-old-track) ;;
    *) echo 'Unexpected synthetic track identifier' >&2; exit 1 ;;
esac

nonroot_manifest() {
    local action="$1" volume="$2"
    case "$volume" in
        kima-ci-real-old-data|kima-ci-real-new-data|kima-ci-real-restore-data|kima-ci-v111-old-data|kima-ci-v111-new-data|kima-ci-v111-restore-data) ;;
        *) echo 'Unexpected snapshot volume' >&2; return 1 ;;
    esac
    local mode=ro
    if [ "$action" = create ]; then mode=rw; fi
    docker run --rm --network none --entrypoint python3 \
        -e KIMA_RECOVERY_MANIFEST=disposable-ci-only \
        -v "$volume":/source:ro -v "$tmp":/backup:"$mode" \
        --mount "type=bind,src=$PWD/.github/ci/nonroot-recovery,dst=/ci-recovery,readonly" \
        "$candidate_image" -B /ci-recovery/prepare.py "$action"
}

nonroot_seed_old() {
    docker exec -e CI_TRACK="$NONROOT_RECOVERY_TRACK" "$old" sh -eu -c '
        test ! -e /data/cache/ci-nonroot-recovery
        mkdir -p /data/cache/ci-nonroot-recovery /data/gpu-onnx/recovery-fixture
        printf "%s\n" "synthetic-original-cache-preserved" > /data/cache/ci-nonroot-recovery/sentinel
        printf "#!/bin/sh\nexit 0\n" > /data/gpu-onnx/recovery-fixture/tool
        chown -R 0:0 /data/cache/ci-nonroot-recovery /data/gpu-onnx/recovery-fixture
        chmod 700 /data/cache/ci-nonroot-recovery /data/gpu-onnx/recovery-fixture
        chmod 600 /data/cache/ci-nonroot-recovery/sentinel
        chmod 700 /data/gpu-onnx/recovery-fixture/tool
        # An explicitly readable synthetic library, not a production chmod.
        chmod 444 "/music/$CI_TRACK.wav"
        chmod 555 /music
    '
    nonroot_music_metadata="$(docker exec "$old" stat -c '%u:%g:%a' /music "/music/$NONROOT_RECOVERY_TRACK.wav")"
    echo 'Seeded private root-owned legacy cache and executable GPU-state fixture'
}

nonroot_wait() {
    local name="$1" service state ready
    for service in backend audio-analyzer audio-analyzer-clap; do
        ready=0
        for i in $(seq 1 60); do
            state="$(docker exec "$name" supervisorctl -c /etc/supervisor/supervisord.conf status "$service" 2>&1 || true)"
            if [[ "$state" == *' RUNNING '* ]]; then ready=1; break; fi
            sleep 2
        done
        test "$ready" = 1 || { echo "Service not running: $service: $state" >&2; return 1; }
    done
}

nonroot_stream() {
    local name="$1" token status
    token="$(login_token "$member" "$member_pass")"
    local stream="$url/api/library/tracks/$NONROOT_RECOVERY_TRACK/stream?quality=original"
    status="$(curl -sS --max-time 45 -o "$tmp/recovery-full.wav" -w '%{http_code}' -H "Authorization: Bearer $token" "$stream")"
    test "$status" = 200
    cmp "$tmp/$NONROOT_RECOVERY_TRACK.wav" "$tmp/recovery-full.wav"
    status="$(curl -sS --max-time 30 -o "$tmp/recovery-range.wav" -w '%{http_code}' -H "Authorization: Bearer $token" -H 'Range: bytes=1024-2047' "$stream")"
    test "$status" = 206
    dd if="$tmp/$NONROOT_RECOVERY_TRACK.wav" of="$tmp/recovery-expected.wav" bs=1024 skip=1 count=1 status=none
    cmp "$tmp/recovery-expected.wav" "$tmp/recovery-range.wav"
    test "$(docker exec "$name" stat -c '%u:%g:%a' /music "/music/$NONROOT_RECOVERY_TRACK.wav")" = "$nonroot_music_metadata"
    echo 'Original listener streams original audio and seeks byte-for-byte; music owner/mode unchanged: PASS'
}

nonroot_check() {
    local name="$1" token status codec
    bash .github/ci/check-aio-service-boundaries.sh "$name"
    docker exec "$name" python3 /app/nonroot-experiment.py audit
    test "$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/music"}}{{.RW}}{{end}}{{end}}' "$name")" = false
    # Even the root diagnostic process cannot write to this actual RO mount.
    if docker exec "$name" touch /music/ci-recovery-must-not-write 2>/dev/null; then
        echo 'Read-only library unexpectedly writable' >&2; return 1
    fi
    test "$(docker exec -u kimabackend "$name" cat /data/cache/ci-nonroot-recovery/sentinel)" = synthetic-original-cache-preserved
    test "$(docker exec "$name" stat -c %u /data/cache/ci-nonroot-recovery/sentinel)" = "$(docker exec "$name" id -u kimabackend)"
    for user in kimaaudio kimaweb; do
        if docker exec -u "$user" "$name" test -r /data/cache/ci-nonroot-recovery/sentinel; then
            echo "Private backend cache readable by $user" >&2; return 1
        fi
    done
    docker exec -u kimabackend "$name" sh -eu -c 'printf "%s\n" nonroot-cache-write > /data/cache/ci-nonroot-recovery/write-test'
    docker exec -u kimaaudio "$name" test -x /data/gpu-onnx/recovery-fixture/tool
    test "$(docker exec "$name" stat -c %u /data/gpu-onnx/recovery-fixture/tool)" = "$(docker exec "$name" id -u kimaaudio)"
    nonroot_stream "$name"
    token="$(login_token "$member" "$member_pass")"
    status="$(curl -sS --max-time 130 -o "$tmp/recovery-low.mp3" -w '%{http_code}' -H "Authorization: Bearer $token" "$url/api/library/tracks/$NONROOT_RECOVERY_TRACK/stream?quality=low")"
    test "$status" = 200
    docker cp "$tmp/recovery-low.mp3" "$name:/tmp/ci-recovery-low.mp3"
    codec="$(docker exec "$name" ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 /tmp/ci-recovery-low.mp3)"
    test "$codec" = mp3
    status="$(curl -sS --max-time 45 -o "$tmp/recovery-waveform.json" -w '%{http_code}' -H "Authorization: Bearer $token" "$url/api/library/tracks/$NONROOT_RECOVERY_TRACK/waveform")"
    test "$status" = 200
    python3 - "$tmp/recovery-waveform.json" <<'PY'
import json, math, sys
with open(sys.argv[1]) as handle:
    data = json.load(handle)
peaks = data['peaks']
assert data['count'] == 400 and len(peaks) == 400
assert all(isinstance(x, (int, float)) and math.isfinite(x) and 0 <= x <= 1 for x in peaks)
assert max(peaks) > 0.5
print('Real migrated-library MP3 transcode and non-silent waveform: PASS')
PY
    echo 'Legacy private cache ownership/write isolation and executable GPU fixture survived: PASS'
}

nonroot_check_rollback() {
    local name="$1"
    test "$(docker exec "$name" stat -c '%u:%g:%a' /data/cache/ci-nonroot-recovery)" = 0:0:700
    test "$(docker exec "$name" stat -c '%u:%g:%a' /data/cache/ci-nonroot-recovery/sentinel)" = 0:0:600
    test "$(docker exec "$name" stat -c '%u:%g:%a' /data/gpu-onnx/recovery-fixture/tool)" = 0:0:700
    test "$(docker exec "$name" cat /data/cache/ci-nonroot-recovery/sentinel)" = synthetic-original-cache-preserved
    docker exec "$name" test ! -e /data/cache/ci-nonroot-recovery/write-test
    nonroot_stream "$name"
    echo 'Independent original-image rollback preserved original owners/modes and excluded candidate-only writes: PASS'
}
