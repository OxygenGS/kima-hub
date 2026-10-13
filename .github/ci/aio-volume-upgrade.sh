#!/usr/bin/env bash
# GitHub-hosted, synthetic-data-only test:
# an existing upstream PostgreSQL /data/postgres volume gets mounted into
# the new Chillverse all-in-one image, migrated, restarted, and verified.
# No real account data, music, production mounts, or image publishing.
set -euo pipefail

old="chillverse-ci-legacy-pg"
aio="chillverse-ci-aio-upgrade"
data="chillverse-ci-upgrade-data"
music="chillverse-ci-upgrade-music"
image="chillverse-listen:aio-ci-smoke"
url="http://127.0.0.1:3131"

cleanup() {
    echo "---- AIO upgrade test logs (if present) ----"
    docker logs --tail 100 "$aio" 2>/dev/null || true
    docker logs --tail 35 "$old" 2>/dev/null || true
    docker rm -f "$aio" "$old" >/dev/null 2>&1 || true
    docker volume rm -f "$music" "$data" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# The upstream database was PostgreSQL 16. The temporary PG container
# mimics its durable directory, /data/postgres, without running a second
# expensive all-in-one image.
docker volume create "$data" >/dev/null
docker volume create "$music" >/dev/null
docker run -d --name "$old" \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=kima \
    -e POSTGRES_DB=kima \
    -e PGDATA=/var/lib/postgresql/data/postgres \
    -p 127.0.0.1:5435:5432 \
    -v "$data":/var/lib/postgresql/data \
    pgvector/pgvector:pg16 >/dev/null

old_ready=false
for i in $(seq 1 60); do
    if docker exec "$old" pg_isready -U postgres -d kima >/dev/null 2>&1; then
        old_ready=true
        break
    fi
    if [ "$(docker inspect --format '{{.State.Status}}' "$old")" != "running" ]; then
        break
    fi
    sleep 2
done
if [ "$old_ready" != true ]; then
    echo "Legacy PostgreSQL failed to start"
    exit 1
fi

# The AIO startup script expects the built-in postgres superuser and a
# separate login role named 'kima' owning the app's kima database.
docker exec "$old" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "CREATE USER kima WITH PASSWORD 'kima';"
docker exec "$old" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -c "ALTER DATABASE kima OWNER TO kima;"
docker exec "$old" psql -v ON_ERROR_STOP=1 -U postgres -d kima \
    -c "CREATE EXTENSION IF NOT EXISTS vector;"

echo "---- Deploying the pristine, pre-fork Kima database schema ----"
(
    cd backend
    DATABASE_URL="postgresql://kima:kima@127.0.0.1:5435/kima" \
        npx prisma migrate deploy --schema ../baseline/backend/prisma/schema.prisma
)

# Validate that this really is a pre-fork database.
original_permissions="$(docker exec "$old" psql -U postgres -d kima -Atc \
    "SELECT COUNT(*) FROM information_schema.columns WHERE table_name='User' AND column_name IN ('canRequestAlbums','canDownloadTracks')")"
test "$original_permissions" = "0"

docker exec -i "$old" psql -v ON_ERROR_STOP=1 -U postgres -d kima \
    < .github/ci/upgrade-fixture.sql
echo "Legacy PostgreSQL data volume prepared with synthetic Kima accounts and music"

# A clean shutdown removes active PostgreSQL server resources before the
# same persistent database volume is handed to the newer all-in-one image.
docker stop -t 45 "$old" >/dev/null
docker rm "$old" >/dev/null

start_aio() {
    docker run -d --name "$aio" \
        --memory=6g \
        -p 127.0.0.1:3131:3030 \
        -v "$data":/data \
        -v "$music":/music \
        -e DISABLE_CLAP=true \
        "$image" >/dev/null
}

wait_aio() {
    local ready=false
    local health state
    for i in $(seq 1 120); do
        health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$aio")"
        state="$(docker inspect --format '{{.State.Status}}' "$aio")"
        if [ "$health" = "healthy" ]; then
            ready=true
            break
        fi
        if [ "$state" = "exited" ] || [ "$state" = "dead" ]; then
            echo "AIO stopped during an upgrade: $state"
            break
        fi
        sleep 5
    done
    if [ "$ready" != true ]; then
        echo "AIO upgrade did not become healthy within 10 minutes"
        return 1
    fi
}

echo "---- Booting new AIO image with OLD persistent /data volume ----"
start_aio
wait_aio

curl -fsS --max-time 20 "$url/login" -o /dev/null
docker exec -i -u postgres "$aio" psql -v ON_ERROR_STOP=1 -d kima \
    < .github/ci/assert-upgrade.sql

echo "---- Simulating customization after the upgrade ----"
docker exec -i -u postgres "$aio" psql -v ON_ERROR_STOP=1 -d kima <<'SQL'
UPDATE "User"
SET "canRequestAlbums"=true, "canDownloadTracks"=true
WHERE "id"='upgrade-listener';

INSERT INTO "BrandingSettings"
    ("id","name","tagline","accentColor","backgroundColor","updatedAt")
VALUES
    ('default','Chillverse Upgrade Fixture','Kept across migrations',
     '#3dacdb','#0a0a0a',NOW());
SQL

curl -fsS --max-time 20 "$url/api/branding" | python3 -c \
    'import sys,json; d=json.load(sys.stdin); assert d["name"]=="Chillverse Upgrade Fixture",d; print("Custom branding served by upgraded AIO")'

echo "---- Removing the upgraded AIO container, preserving /data ----"
docker stop -t 45 "$aio" >/dev/null
docker rm "$aio" >/dev/null
start_aio
wait_aio

docker exec -i -u postgres "$aio" psql -v ON_ERROR_STOP=1 -d kima \
    < .github/ci/assert-upgrade-second-pass.sql

curl -fsS --max-time 20 "$url/api/branding" | python3 -c \
    'import sys,json; d=json.load(sys.stdin); assert d["name"]=="Chillverse Upgrade Fixture",d; assert d["accentColor"]=="#3dacdb",d; print("Branding survived AIO container replacement")'

docker exec "$aio" sh -c \
    'test -s /data/secrets/session_secret && test -s /data/secrets/encryption_key'
echo "AIO old-volume upgrade, persisted data, regenerated container and stored encryption secrets: PASS"
