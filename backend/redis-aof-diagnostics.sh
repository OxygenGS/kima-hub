#!/bin/sh
# Safe startup diagnostics. NEVER repairs, deletes, truncates or writes AOF files.
set -u

data_dir="${REDIS_DATA_DIR:-/data/redis}"
printf '%s\n' "[redis-diagnostic] Redis is not answering; checking append-only persistence read-only."

if [ ! -d "$data_dir" ]; then
    printf '%s\n' "[redis-diagnostic] Redis data directory is absent or not mounted."
    exit 3
fi

manifest="$data_dir/appendonlydir/appendonly.aof.manifest"
legacy="$data_dir/appendonly.aof"
if [ -f "$manifest" ]; then
    target="$manifest"
elif [ -f "$legacy" ]; then
    target="$legacy"
else
    printf '%s\n' "[redis-diagnostic] No AOF manifest or legacy AOF found. Redis may have another startup failure."
    exit 0
fi

if [ ! -r "$target" ]; then
    printf '%s\n' "[redis-diagnostic] AOF exists but cannot be read. Inspect permissions as the Redis user."
    exit 3
fi
if ! command -v redis-check-aof >/dev/null 2>&1 || ! command -v timeout >/dev/null 2>&1; then
    printf '%s\n' "[redis-diagnostic] Read-only verifier unavailable. Inspect Redis service logs."
    exit 3
fi

# The verifier can be slow on large AOFs; a timeout is inconclusive.
# Do not pass --fix, even on failure.
timeout 15s redis-check-aof "$target" >/dev/null 2>&1
status=$?
case "$status" in
    0)
        printf '%s\n' "[redis-diagnostic] AOF structure passed the read-only check. Inspect Redis logs for the actual failure."
        exit 0 ;;
    124|137)
        printf '%s\n' "[redis-diagnostic] Read-only AOF check exceeded 15 seconds; result unknown."
        exit 3 ;;
    *)
        printf '%s\n' "[redis-diagnostic] POSSIBLE Redis AOF corruption (read-only check failed)."
        printf '%s\n' "[redis-diagnostic] STOP writers and BACK UP the complete /data volume before recovery."
        printf '%s\n' "[redis-diagnostic] Do NOT delete AOF files, flush queues or run a repair automatically."
        printf '%s\n' "[redis-diagnostic] See docs/redis-recovery.md; no data was modified."
        exit 2 ;;
esac
