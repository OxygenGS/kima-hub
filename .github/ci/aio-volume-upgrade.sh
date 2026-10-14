#!/usr/bin/env bash
# GitHub-hosted, synthetic-data-only test:
# an existing upstream PostgreSQL /data/postgres volume gets mounted into
# the new Kima Hub all-in-one image, migrated, restarted, and verified.
# No real account data, music, production mounts, or image publishing.
set -euo pipefail

old="kima-ci-legacy-pg"
aio="kima-ci-aio-upgrade"
data="kima-ci-upgrade-data"
music="kima-ci-upgrade-music"
rollback_old="kima-ci-legacy-rollback"
rollback_data="kima-ci-rollback-data"
backup_dir="$(mktemp -d)"
image="kima-hub:aio-ci-smoke"
url="http://127.0.0.1:3131"

cleanup() {
    echo "---- AIO upgrade test logs (if present) ----"
    docker logs --tail 100 "$aio" 2>/dev/null || true
    docker logs --tail 35 "$old" 2>/dev/null || true
    docker logs --tail 35 "$rollback_old" 2>/dev/null || true
    docker rm -f "$aio" "$old" "$rollback_old" >/dev/null 2>&1 || true
    docker volume rm -f "$music" "$data" "$rollback_data" >/dev/null 2>&1 || true
    rm -rf "$backup_dir"
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

# Snapshot the ENTIRE original /data volume *while Postgres is shut down*.
# A logical dump alone does not cover other durable instance files. Include
# a harmless original-install marker to prove those files also get restored.
# The archive stays on this disposable runner and is never published.
docker run --rm --user 0 --entrypoint sh \
    -v "$data":/legacy \
    pgvector/pgvector:pg16 \
    -c 'printf "ci-original-data-volume" > /legacy/ci-original-marker'
docker run --rm --user 0 --entrypoint tar \
    -v "$data":/legacy:ro \
    -v "$backup_dir":/archive \
    pgvector/pgvector:pg16 \
    -C /legacy -cpf /archive/pre-upgrade-data.tar .
test -s "$backup_dir/pre-upgrade-data.tar"
echo "Whole original /data snapshot created before migrations"

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
    ('default','Kima Hub Upgrade Fixture','Kept across migrations',
     '#3dacdb','#0a0a0a',NOW());
SQL

curl -fsS --max-time 20 "$url/api/branding" | python3 -c \
    'import sys,json; d=json.load(sys.stdin); assert d["name"]=="Kima Hub Upgrade Fixture",d; print("Custom branding served by upgraded AIO")'

echo "---- Removing the upgraded AIO container, preserving /data ----"
docker stop -t 45 "$aio" >/dev/null
docker rm "$aio" >/dev/null
start_aio
wait_aio

docker exec -i -u postgres "$aio" psql -v ON_ERROR_STOP=1 -d kima \
    < .github/ci/assert-upgrade-second-pass.sql

curl -fsS --max-time 20 "$url/api/branding" | python3 -c \
    'import sys,json; d=json.load(sys.stdin); assert d["name"]=="Kima Hub Upgrade Fixture",d; assert d["accentColor"]=="#3dacdb",d; print("Branding survived AIO container replacement")'

docker exec "$aio" sh -c \
    'test -s /data/secrets/session_secret && test -s /data/secrets/encryption_key'
echo "AIO old-volume upgrade, persisted data, regenerated container and stored encryption secrets: PASS"

# Prove a full, UNMODIFIED pre-migration volume snapshot can be recovered on
# an independent legacy PostgreSQL 16 instance. Never try to boot old code
# against the migrated original volume. No port is published.
echo "---- Restoring separate original /data snapshot for legacy rollback ----"
docker stop -t 45 "$aio" >/dev/null
docker rm "$aio" >/dev/null
docker volume create "$rollback_data" >/dev/null
docker run --rm --user 0 --entrypoint tar \
    -v "$rollback_data":/restored \
    -v "$backup_dir":/archive:ro \
    pgvector/pgvector:pg16 \
    -C /restored -xpf /archive/pre-upgrade-data.tar
marker="$(docker run --rm --entrypoint cat \
    -v "$rollback_data":/restored:ro \
    pgvector/pgvector:pg16 /restored/ci-original-marker)"
test "$marker" = "ci-original-data-volume"

docker run -d --name "$rollback_old" \
    -e PGDATA=/var/lib/postgresql/data/postgres \
    -v "$rollback_data":/var/lib/postgresql/data \
    pgvector/pgvector:pg16 >/dev/null

rollback_ready=false
for i in $(seq 1 60); do
    if docker exec "$rollback_old" pg_isready -U postgres -d kima >/dev/null 2>&1; then
        rollback_ready=true
        break
    fi
    if [ "$(docker inspect --format '{{.State.Status}}' "$rollback_old")" != "running" ]; then
        break
    fi
    sleep 2
done
if [ "$rollback_ready" != true ]; then
    echo "Restored pre-fork PostgreSQL failed to start" >&2
    exit 1
fi
docker exec -i "$rollback_old" psql -v ON_ERROR_STOP=1 -U postgres -d kima \
    < .github/ci/assert-legacy-rollback.sql

echo "Independent original-schema /data snapshot restore: PASS"
