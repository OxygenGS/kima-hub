#!/usr/bin/env bash
# Real but completely disposable v1.11 fork AIO runtime smoke.
# This script NEVER accepts a remote host, Docker registry, host data mount,
# or production credentials. It runs only on GitHub-hosted CI.
set -euo pipefail
if [ "${GITHUB_ACTIONS:-}" != true ] || [ "${GITHUB_REPOSITORY:-}" != "OxygenGS/kima-hub" ]; then
    echo "Refusing to start outside the repository's disposable GitHub Actions runner" >&2
    exit 1
fi

image="kima-hub:aio-ci-smoke"
name="kima-ci-v111-aio"
data="kima-ci-v111-data"
music="kima-ci-v111-music"
url="http://127.0.0.1:3130"

for container in "$name"; do
    if docker container inspect "$container" >/dev/null 2>&1; then
        echo "Refusing to reuse an existing test container" >&2
        exit 1
    fi
done
for volume in "$data" "$music"; do
    if docker volume inspect "$volume" >/dev/null 2>&1; then
        echo "Refusing to reuse an existing Docker volume: $volume" >&2
        exit 1
    fi
done
docker image inspect "$image" >/dev/null
docker volume create "$data" >/dev/null
docker volume create "$music" >/dev/null

cleanup() {
    echo "---- Disposable AIO diagnostic logs ----"
    docker logs --tail 130 "$name" 2>/dev/null || true
    docker rm -f "$name" >/dev/null 2>&1 || true
    docker volume rm -f "$data" "$music" >/dev/null 2>&1 || true
}
trap cleanup EXIT

start_aio() {
    local options=()
    # Only the experiment opts into actual CLAP service startup.
    if [ "${AIO_SMOKE_WITH_CLAP:-0}" != "1" ]; then
        options+=(-e DISABLE_CLAP=true)
    fi
    if [ -n "${AIO_SMOKE_OFFICIAL_MODELS_DIR:-}" ]; then
        # No image modification. Read-only, transient runner-host model files.
        test -d "$AIO_SMOKE_OFFICIAL_MODELS_DIR"
        test -f "$GITHUB_WORKSPACE/services/audio-analyzer/musicnn_onnx.py"
        options+=(-v "$AIO_SMOKE_OFFICIAL_MODELS_DIR:/app/models:ro")
        options+=(-v "$GITHUB_WORKSPACE/services/audio-analyzer/musicnn_onnx.py:/app/audio-analyzer/musicnn_onnx.py:ro")
    fi
    docker run -d --name "$name" \
        --memory=6g \
        -p 127.0.0.1:3130:3030 \
        -v "$data":/data \
        -v "$music":/music \
        "${options[@]}" \
        "$image" >/dev/null
}
assert_official_upf_runtime() {
    if [ -z "\${AIO_SMOKE_OFFICIAL_MODELS_DIR:-}" ]; then return; fi
    docker exec "$name" bash -c 'cd /app/models && sha256sum --status -c official-upf-onnx.sha256'
    docker exec -i "$name" python3 - <<'PY'
import sys
import numpy as np
sys.path.insert(0, '/app/audio-analyzer')
from musicnn_onnx import MusicnnOnnx
m = MusicnnOnnx('/app/models', use_gpu=False, threads=1)
assert m.body._embedding_output == 'embeddings', 'UPF model must use 200d embedding output'
patches = np.random.default_rng(2026).uniform(0,1,size=(2,187,96)).astype(np.float32)
data = m.body.run(patches)
assert data.shape == (2,200), f'UPF embeddings shape {data.shape}'
heads = m.heads()
assert len(heads) == 10, heads
for name in heads:
    result=m.predict(name,data)
    assert result is not None and result.shape[0] == 2 and np.isfinite(result).all(), name
print('Official UPF ONNX production loader: 200d embeddings + all 10 classification heads PASS')
PY
}

assert_clap_started() {
    if [ "${AIO_SMOKE_WITH_CLAP:-0}" != "1" ]; then return; fi
    local state=""
    for i in $(seq 1 40); do
        state="$(docker exec "$name" supervisorctl -c /etc/supervisor/supervisord.conf status audio-analyzer-clap 2>&1 || true)"
        if [[ "$state" == *" RUNNING "* ]]; then
            echo "PASS: CLAP analyzer active with default AIO configuration"
            return
        fi
        sleep 3
    done
    echo "FAIL: CLAP analyzer did not enter RUNNING state: $state" >&2
    return 1
}
wait_ready() {
    local healthy=false
    for i in $(seq 1 120); do
        local status state
        status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name")"
        state="$(docker inspect --format '{{.State.Status}}' "$name")"
        if [ "$status" = healthy ]; then healthy=true; break; fi
        if [ "$state" != running ]; then break; fi
        sleep 5
    done
    if [ "$healthy" != true ]; then
        echo "Actual fork AIO failed to start and become healthy" >&2
        return 1
    fi
    curl -fsS --max-time 25 "$url/onboarding" -o /dev/null
}

echo "---- Boot actual fresh merged v1.11 AIO with empty data and music ----"
start_aio
wait_ready
assert_clap_started
assert_official_upf_runtime
bash .github/ci/check-aio-service-boundaries.sh "$name"

echo "---- Confirm vendored CLAP audio license ships with runtime ----"
docker exec "$name" test -r /app/audio-analyzer-clap/LICENSE.huggingface-transformers-apache-2.0
docker exec "$name" grep -Fq 'Apache License' /app/audio-analyzer-clap/LICENSE.huggingface-transformers-apache-2.0
echo "---- Assert deployed Python runtime is transformers-free ----"
docker exec "$name" python3 -c 'import importlib.util,tokenizers; assert importlib.util.find_spec("transformers") is None, "vulnerable transformers runtime unexpectedly shipped"; print("Pinned Rust tokenizer present; transformers absent: PASS")'
echo "---- Verify fork-specific schema, branding, PG isolation ----"
curl -fsS --max-time 25 "$url/api/branding" | python3 -c '
import json,sys
brand=json.load(sys.stdin)
assert brand["name"] == "Kima", brand
assert brand["accentColor"] == "#fca200", brand
print("New fork AIO serves its default instance branding")
'
count="$(docker exec -u postgres "$name" psql -d kima -Atc "SELECT count(*) FROM information_schema.columns WHERE table_name='User' AND column_name IN ('canRequestAlbums','canDownloadTracks')")"
test "$count" = 2
for table in BrandingSettings ReleaseAcknowledgement; do
    n="$(docker exec -u postgres "$name" psql -d kima -Atc "SELECT count(*) FROM information_schema.tables WHERE table_name='$table'")"
    test "$n" = 1
done
listen="$(docker exec -u postgres "$name" psql -d kima -Atc "SHOW listen_addresses")"
test "$listen" = localhost || { echo "PostgreSQL unexpectedly bound to: $listen" >&2; exit 1; }
status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 \
    -X POST -H 'Content-Type: application/json' \
    -d '{"name":"Not allowed"}' "$url/api/branding")"
test "$status" = 401 || test "$status" = 403
echo "---- Verify AIO API is loopback-only inside its Docker network ----"
container_ip="$(docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$name")"
if [ -z "$container_ip" ]; then
    echo "Cannot determine disposable container IP for isolation test" >&2
    exit 1
fi
docker exec -e TEST_CONTAINER_IP="$container_ip" "$name" node -e '
const net = require("node:net");
function probe(host) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({host, port: 3006});
    socket.setTimeout(4000);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); reject(new Error("Connection timed out: " + host)); });
    socket.once("error", err => {
      socket.destroy();
      if (err.code === "ECONNREFUSED") resolve(false);
      else reject(err);
    });
  });
}
(async () => {
  if (!(await probe("127.0.0.1"))) throw new Error("AIO backend not listening on loopback");
  if (await probe(process.env.TEST_CONTAINER_IP)) throw new Error("AIO backend exposed on container network interface");
  console.log("AIO API loopback-only network isolation: PASS");
})().catch(err => { console.error(err); process.exitCode = 1; });
'
bash .github/ci/check-aio-db-credential.sh "$name"
db_secret_before="$(docker exec "$name" sha256sum /data/secrets/database_password | cut -d' ' -f1)"
echo "Fork-specific persisted schema, unauthenticated write denial and PostgreSQL isolation: PASS"

# Creates only synthetic 440Hz audio, an admin, a listener, playlists/history.
bash .github/ci/aio-audio-smoke.sh "$name" "$url"

# Uses the real AIO frontend and two real synthetic login accounts.
bash .github/ci/aio-auth-locale-smoke.sh "$url"

echo "---- Verify data survives removing/recreating the same AIO container ----"
secret_before="$(docker exec "$name" sha256sum /data/secrets/session_secret | cut -d' ' -f1)"
docker stop -t 45 "$name" >/dev/null
docker rm "$name" >/dev/null
start_aio
wait_ready
assert_clap_started
assert_official_upf_runtime
bash .github/ci/check-aio-service-boundaries.sh "$name"
secret_after="$(docker exec "$name" sha256sum /data/secrets/session_secret | cut -d' ' -f1)"
test "$secret_before" = "$secret_after"
test "$db_secret_before" = "$(docker exec "$name" sha256sum /data/secrets/database_password | cut -d' ' -f1)"
bash .github/ci/check-aio-db-credential.sh "$name"
n="$(docker exec -u postgres "$name" psql -d kima -Atc "SELECT count(*) FROM \"User\" WHERE username IN ('ci_audio_admin','ci_audio_listener')")"
test "$n" = 2
n="$(docker exec -u postgres "$name" psql -d kima -Atc "SELECT count(*) FROM \"Track\" WHERE id='ci-audio-track'")"
test "$n" = 1
echo "Full merged v1.11 AIO fresh-install, real auth/audio/UI and persisted-volume smoke: PASS"
