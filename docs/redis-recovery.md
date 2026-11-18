# Redis startup and AOF recovery in Kima AIO

The all-in-one container uses Redis for sessions and background-job state.
After a host runs out of disk space, Redis may fail to load its append-only
file (AOF), causing a generic login failure. This does not necessarily mean
that the password or database is wrong.

The v1.27 startup gate can run a strictly read-only Redis AOF diagnostic after
a Redis readiness timeout. A failure does not trigger an automatic repair.

## Diagnosis

1. Verify the physical disk or network share is **actually mounted**, has free
   bytes and inodes, and is writable. The mere existence of a folder proves
   nothing about the underlying mount.
2. Read Docker logs for Redis messages such as "Bad file format reading the
   append only file", "No space left on device", or "Permission denied".
3. With the v1.27 AIO image, run the following read-only helper explicitly:

       docker exec --user redis kima /bin/sh /app/redis-aof-diagnostics.sh

   The helper checks a Redis 7 multi-part AOF manifest (or legacy AOF) with
   redis-check-aof, never with its destructive repair flag. It does not display
   keys or file contents and it stops verification after 15 seconds. A timeout
   is **inconclusive**, not evidence that the AOF is damaged.

## Recovery

- Stop **all** writers to the persistent /data volume before any recovery
  action. A partial Redis backup does not prove consistency with PostgreSQL
  or ongoing downloads.
- Make a **complete cold backup of the entire /data volume** outside the
  container, preserving file ownership and secrets. Test that the backup can
  be restored independently. See [safe AIO updates](safe-aio-updates.md).
- Prefer restoring a complete known-good /data snapshot into a **new** volume,
  with the image version that originally used it. Treat work since the snapshot
  as potentially missing; reconcile downloads and imports before retries.
- Only as an explicit advanced last resort, consider repairing a **separate
  copy** of the Redis AOF data after reviewing the official Redis guidance.
  Such a repair may truncate records and lose queued work. Kima never runs
  this action automatically.
- Do **not** delete /data/redis, issue FLUSHALL, run docker compose down -v,
  prune Docker volumes, or overwrite a running database merely to restore
  login access.

These instructions cover the named-volume **all-in-one** deployment. For a
bind mount or split services, verify your actual mounts and adapt the backup
procedure rather than copying commands intended for another topology.
