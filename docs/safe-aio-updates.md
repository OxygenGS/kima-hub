# Safe AIO updates and rollback — Docker Compose / Dockge

This guide covers OxygenGS Kima Hub **all-in-one (AIO)** installs with a Docker **named volume** mounted at /data. It is not a ready-made procedure for multi-container stacks or custom host-directory bind mounts. Backups can contain user data, account credentials and encryption/session secrets: protect them accordingly.

**Warning:** upgrading the image can migrate the database automatically. Changing back to the old Docker image does NOT undo a database migration. Never point an old image at a migrated /data volume.

## Before touching the installation

1. Read the [published release notes](https://github.com/OxygenGS/kima-hub/releases) and choose an explicit image tag (not :latest).
2. Save the existing Compose/Dockge configuration, environment settings, original image version and **Compose project / Dockge stack name** somewhere private.
3. Inspect the existing running container while using the **same Compose project directory**:

```bash
docker compose config
cid="$(docker compose ps -q kima)"
test -n "$cid" || { echo "No running kima service in this Compose project"; exit 1; }
docker inspect "$cid" --format '{{range .Mounts}}{{if eq .Destination "/data"}}type={{.Type}} source={{.Source}} name={{.Name}}{{println}}{{end}}{{end}}'
```

Confirm the /data mount is **type=volume**; note the exact volume name, for example oldstack_kima_data. If /data is **type=bind**, do not use the named-volume examples below. Use a filesystem backup procedure that preserves ownership, permissions and the original directory instead. Renaming a Dockge stack or Compose project can create a *new empty volume*, even if the Compose file still says kima_data.

## Cold backup of the complete /data volume

Run in the same Compose project and ensure *all writers* to /data are stopped. Pull the backup helper image **before** the downtime: `docker image pull alpine:3.20`. Backups are written **outside** the Compose/source directory to prevent accidental Git commits. For a one-container AIO stack, stopping the Kima service stops its embedded PostgreSQL and Redis.

```bash
cid="$(docker compose ps -q kima)"
test -n "$cid" || exit 1
kind="$(docker inspect "$cid" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Type}}{{end}}{{end}}')"
volume="$(docker inspect "$cid" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}')"
test "$kind" = volume && test -n "$volume" || { echo "Expected a named /data volume"; exit 1; }

backup_dir="$HOME/kima-backups"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
backup_file="kima-data-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
docker compose stop kima
docker run --rm \
  --mount "type=volume,source=$volume,destination=/source,readonly" \
  --mount "type=bind,source=$backup_dir,destination=/backup" \
  alpine:3.20 tar -C /source -czpf "/backup/$backup_file" .
test -s "$backup_dir/$backup_file" && tar -tzf "$backup_dir/$backup_file" >/dev/null
sha256sum "$backup_dir/$backup_file" > "$backup_dir/$backup_file.sha256"
echo "Saved: $backup_dir/$backup_file; original volume: $volume"
```

**Keep this archive separately from the Docker volume**, preferably on another machine. Check available storage first. The archive contains the database and persistent secrets, and requires restricted access. Listing a tarball checks archive integrity only; a **restore to a separate volume** is needed to prove recoverability. If not upgrading immediately, use docker compose start kima to bring the original container back online.

## Update the existing stack

Only after verifying the backup: change the image version (or VERSION variable) in the **same Dockge/Compose stack**. Keep the original music mount, /data volume and project name. In Dockge, save your stack, pull the image and redeploy. In the Compose directory:

```bash
docker compose config
docker compose pull kima
docker compose up -d --no-deps kima
docker compose ps
```

Verify the health check, login, existing library, playlists, integration settings and permissions. The fork's permission migration defaults existing non-admin users to **no album requests** and **no track downloads** until an admin re-enables them. Do not mistake these intentionally restrictive defaults for lost data.

## Independent rollback after a migration

**Never start an older version against a migrated volume.** Stop Kima and keep the upgraded volume for investigation. Restore the *pre-upgrade* tar archive into a **new Docker volume**, not into the original or running database.

```bash
recovery_volume="kima_rollback_$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="REPLACE_WITH_VERIFIED_BACKUP.tar.gz"
backup_dir="$HOME/kima-backups"
test -s "$backup_dir/$backup_file" || { echo "Backup missing"; exit 1; }
(cd "$backup_dir" && sha256sum -c "$backup_file.sha256") || exit 1
docker volume create "$recovery_volume"
docker run --rm -e "BACKUP_FILE=$backup_file" \
  --mount "type=volume,source=$recovery_volume,destination=/restore" \
  --mount "type=bind,source=$backup_dir,destination=/backup,readonly" \
  alpine:3.20 sh -c 'tar -xzpf "/backup/$BACKUP_FILE" -C /restore'
echo "Restored to: $recovery_volume"
```

In your **original Compose/Dockge project**, pin the **old known-good image version** and point the existing `kima_data:/data` mount at this *newly restored* volume by changing its top-level declaration to:

```yaml
volumes:
  kima_data:
    external: true
    name: REPLACE_WITH_RECOVERY_VOLUME_NAME
```

Review docker compose config to confirm that the /data mount resolves to the restored volume; then start the old image and validate users, saved settings and media. Preserve the original backup and migrated volume until recovery has been verified.

**Never run docker compose down -v, Docker volume prune, or a restore into a running PostgreSQL database.** A backup is only reliable if it was made while database writers were stopped and independently verified.

## What we have tested

GitHub CI successfully (commit 7129428) took a cold full-volume snapshot of a **synthetic pre-fork PostgreSQL** /data directory, upgraded a copy to the new AIO container, then restored the untouched snapshot into an independent PostgreSQL 16 container. Accounts, settings, library, playback state and an ordinary file outside the database survived the restore.

This is not yet proof of rollback using the *original monolithic Kima AIO image*, historical encrypted secrets, a real library or external services. Before a production upgrade, rehearse the complete old-image → candidate-image and independent old-image rollback process on disposable copies.
