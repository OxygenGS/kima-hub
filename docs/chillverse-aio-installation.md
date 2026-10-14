# Kima Hub — archived AIO development installation notes

**Archived historical document (October 2026).** This describes the retired CT 105 development setup, not a supported installation method. For current installation instructions, use the [README](../README.md) and the published `ghcr.io/oxygengs/kima-hub` image.

This document describes the former **development build**, not the current published release. The AIO image is built locally on the isolated CT 105 test system from `feature/user-permissions`. Do not use upstream Kima release image names for Chillverse. Do not apply these commands to CT 101.

## Requirements and isolation

- Docker Engine with Compose plugin, sufficient free disk space for a roughly 7.6 GB image plus intermediate build layers.
- The CT 105 test used 8 GiB RAM and a roughly 100 GiB root disk. These are **observed test resources**, not certified minimum production requirements.
- Dedicated Docker volumes for `/data` and `/music`. Never point test volumes to a production library or database.
- Default test binding is `127.0.0.1:3130`, with port 3030 in the AIO container. Access remotely through an SSH tunnel.
- The four-container DEV stack on port 3030 can remain running; its data and ports must stay separate.

## Build the isolated development AIO

From a clean checkout of the development branch:

```sh
git switch feature/user-permissions
git pull --ff-only origin feature/user-permissions
docker compose -f docker-compose.chillverse-aio-test.yml config --quiet
docker compose -f docker-compose.chillverse-aio-test.yml build aio
docker compose -f docker-compose.chillverse-aio-test.yml up -d --no-build
docker compose -f docker-compose.chillverse-aio-test.yml ps
```

The Compose file names the image `chillverse-listen:aio-test-local` and gives the volumes unique AIO-test names. The test configuration sets `DISABLE_CLAP=true` to reduce memory usage. It does not publish an image or update other Compose projects.

For browser access from another computer, prefer a tunnel:

```sh
ssh -L 3130:127.0.0.1:3130 root@10.0.0.23
```

Then browse to `http://127.0.0.1:3130`. A LAN-only binding can be configured with `AIO_TEST_BIND_ADDRESS`, but do not expose an onboarding instance to the Internet.

## First start

1. Wait for `docker inspect chillverse-listen-aio-test-aio-1 --format '{{.State.Health.Status}}'` to report `healthy`.
2. Complete administrator onboarding using a new, unique credential.
3. Set an instance name/tagline under branding settings.
4. Create a regular account and verify admin-only pages and denied download/request controls are absent.
5. Restart **only** the AIO service and verify accounts, saved branding and permissions persist.

## Music playback smoke test

Use a disposable audio file in the AIO-only `/music` volume, scan the library, then verify real speaker playback, Play/Pause, seeking, volume and end-of-track behavior in a browser. The CT 105 test on 2026-10-13 used a 30-second 440 Hz MP3. Next/previous and mobile remain open checks.

## Backup and upgrade

- Before any changes to an existing deployment, take an **offline, restorable backup** of the old `/data` volume and music/configuration mounts. A database dump alone is not a complete AIO rollback.
- Verify the old-image startup using an **independent restored copy** of the pre-upgrade backup. Never point an old image at a database that newer migrations have modified.
- Database migrations default `canRequestAlbums` and `canDownloadTracks` to `false` for existing non-admin users. Admins must review access after upgrading.
- Only synthetic legacy database migrations have been validated in CI. An actual old monolithic Kima-image-to-Chillverse-image rollback rehearsal is still required before a production upgrade.

## Security and release blockers

The candidate is **not yet production-ready**. The AIO currently uses hardcoded internal PostgreSQL credentials and `INTERNAL_API_SECRET`; some application processes inherit root. The security review and final image dependency scan remain open. No stable tags, GHCR/Docker Hub publication, `main` merge or production CT 101 changes are authorized.

See `docs/security-review-chillverse.md`, `docs/release-readiness.md` and `docs/chillverse-dev-rollout.md` for the remaining gates. Never commit real passwords, API keys, database dumps or media.
