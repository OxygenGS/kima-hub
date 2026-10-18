# v1.11.0 service privilege hardening feasibility — isolated planning evidence

**Status: INVESTIGATION ONLY. Not implemented, not approved to merge or publish.**
Source reviewed: combined Draft PR #7 head `a980e0e381adb377e2d75fc704ef08d9a680ebef`, 18 October 2026. This file exists on the separate security-verification branch so release CI is not unnecessarily rebuilt for a planning document. This is not a deployable configuration and contains no private-host specifics.

## Baseline confirmed in AIO Dockerfile

| Process | Supervisor user | Security state |
| --- | --- | --- |
| PostgreSQL 16 | `postgres` | Unprivileged |
| Redis | `redis` | Unprivileged |
| Next.js frontend | `kimaweb` | Unprivileged; runtime AIO test asserts effective UID |
| Node backend | Inherits `root` | **Not hardened** |
| Essentia analyzer | Inherits `root` | **Not hardened** |
| CLAP analyzer | Inherits `root` | **Not hardened** |

The container entrypoint and supervisor initially need elevated privileges to prepare PostgreSQL data, local secrets, migrations and user-owned service directories. This **does not itself justify running** the network-facing backend and audio analyzers as root after startup.

## Why adding `user=...` alone is unsafe

1. **Backend database readiness:** `/app/wait-for-db.sh` currently reads `/data/secrets/database_password`. The root-owned secret directory is mode **0700** and the persistent password file mode **0600**. A non-root backend would fail the readiness check unless credential distribution is explicitly redesigned. Do **not** globally relax the directory to world-readable.
2. **Backend .env:** `/app/backend/.env` is written with mode **0600** by root on every startup. A backend service UID must be able to read only its own generated configuration without granting frontend/other workers access; restarting against older volumes must be tested.
3. **Writable media/caches:** backend needs `/data/cache/transcodes`, cover/cache locations and possibly writes to `/music` for acquired tracks. Existing operator-provided **bind mounts** can have arbitrary owners/groups. A blanket recursive `chown /music` would mutate real library permissions and is explicitly prohibited; do not use it as an attempted fix. Assess whether configurable UID/GID/group mapping is needed.
4. **Existing persisted data:** avoid recursively rewriting large historical `/data` content or changing PostgreSQL/Redis ownership. Scope any permissions migration to necessary per-service paths and test copies of real old-volume metadata.
5. **CLAP offline model cache:** the Dockerfile bakes Hugging Face artifacts into `/root/.cache/huggingface`. Moving CLAP to a dedicated UID requires a deliberately accessible, checksum-verified and *offline* model directory; merely switching supervisor user will break model loading.
6. **Runtime GPU toggles:** the optional GPU package manager writes/downloads runtime material under `/data`. Analyze ownership and access for both CPU and GPU paths before an analyzer UID migration.
7. **Music-library confidentiality:** an analyzer should read mounted audio, not receive backend session-encryption secrets or database passwords needlessly. Preserve the current API authorization and separation between frontend and privileged backend directories.
8. **Docker bootstrapping:** keep root privileges where needed for PostgreSQL initialization/migrations, then drop supervisor *individual child processes* after preparing specific permissions. Do not change `USER` of the entire AIO container without a complete bootstrap redesign.

## Isolated verification plan for a proposed code change

- Use a **new experimental branch** based on current combined PR #7; do not merge or publish it before validation. Make backend/analyzer UID changes in measured increments, not all at once.
- Extend `.github/ci/check-aio-service-boundaries.sh` to assert the **actual effective UID** of backend, frontend and both analyzers, plus read/write denial of each other's private credentials; do not rely only on static Dockerfile text.
- Add explicit checks for read-only external music bind mounts and writable disposable music mounts with non-root UID/GID mapping; non-root **must not silently disable acquisitions** on supported installations.
- Validate restart and existing-volume upgrade (secret persistence, migrations, schema readiness, cache write, HTTP 401/403, downloaded-track workflow) with **throwaway data** before attempting representative backups.
- Prove full real audio transcoding, 400-point waveform, music scan and analyzer processing, both CPU-only and relevant optional GPU pathways.
- Re-run the native AMD64 and ARM64 **full AIO image** suites and original upstream v1.10/v1.11 copied-volume upgrades and independent rollback, image vulnerability scans and shipped-license checks.
- Document any design requiring host-side ownership changes as a separate operator migration step with rollback; it cannot be silently included in v1.11.0.
- Only integrate after clear compatibility evidence. Any new candidate image requires **separate user authorization**. Do not inspect or modify any independently operated installation.

**Decision:** root process privileges are an unresolved release security gate; this plan establishes dependencies and tests rather than falsely marking the gate resolved. Human/maintainer risk acceptance or tested mitigation is still required before the stable release decision.
