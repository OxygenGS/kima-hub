#!/usr/bin/env bash
# Validates the database credential inside a disposable GitHub Actions AIO.
set -euo pipefail
if [ "${GITHUB_ACTIONS:-}" != true ] || [ "${GITHUB_REPOSITORY:-}" != "OxygenGS/kima-hub" ] || [ "$#" -ne 1 ]; then
    echo "Refusing to inspect any non-CI AIO" >&2
    exit 1
fi
case "$1" in
    kima-ci-v111-aio|kima-ci-v111-upgraded) ;;
    *) echo "Unexpected disposable AIO name" >&2; exit 1 ;;
esac
docker exec "$1" bash -c '
set -euo pipefail
test -f /data/secrets/database_password
test "$(stat -c %a /data/secrets/database_password)" = 600
password="$(cat /data/secrets/database_password)"
[[ "$password" =~ ^[0-9a-f]{64}$ ]]
PGPASSWORD="$password" psql -h 127.0.0.1 -U kima -d kima -Atc "SELECT 1" | grep -qx 1
'
echo "Disposable AIO has a persistent random credential accepted by PostgreSQL: PASS"
