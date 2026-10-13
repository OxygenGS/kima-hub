# Chillverse Listen — DEV AIO rollout gate

Status: **preparation only**. Development branch: `feature/user-permissions`. No images published; no production deployment authorized.

## Environments

- CT 101 is production: **never update or remount** during DEV verification.
- CT 105 contains the known-good four-service DEV setup. **Do not replace it** with AIO.
- `main` and release/publish workflows remain unchanged.
- A disposable GitHub Actions runner is the current tested AIO environment. Prefer this for automated tests.
- Before attempting a manual AIO test, select a dedicated disposable VM/CT or assess CT 105 memory, CPU, storage and backup strategy. Existing local AIO compose defaults to 6 GB RAM and is intentionally not suitable for unassessed hosts.

## Phase 1 — preflight

1. Confirm all six pull request jobs pass at the candidate commit, including database restoration, AIO boot and synthetic audio streaming.
2. Resolve or explicitly accept the security findings tracked in `docs/security-review-chillverse.md` (internal DB credential, internal API secret, root processes, network exposure and image CVEs).
3. Verify the image registry, namespace, tagging and ownership to prevent publishing over the upstream Kima image.
4. Record test host capacity: available RAM, disk capacity for Docker layers plus persistent volumes, CPU, network access and backup method.
5. Keep generated secrets and private library content out of the repository and GitHub Actions logs.

## Phase 2 — disposable DEV deployment

Only after approved host selection and resource checks:

1. Build the AIO image from a pinned development commit, using a **fork-specific local image name**. Never pull or push upstream `latest`.
2. Start with separate empty `/data` and `/music` volumes; publish UI on `127.0.0.1:3130` only. Use an SSH tunnel for browser access.
3. Verify health, onboarding, admin login, custom branding, normal-user permissions, library upload/import and playback in a real desktop browser.
4. Verify Play/Pause, seek, volume, next/previous, speaker audio, browser refresh, image restart and persistence. Check mobile where available.
5. Negative test regular-user album requests, track downloads, offline downloads, keep-track, branding edits, token reuse and administrative settings.
6. Verify only the frontend is exposed. Inspect bound ports for PostgreSQL (5432), Redis (6379), backend (3006) and UI (3030) from host and neighboring containers.
7. Save sanitized result logs and record all shortcomings in the release-readiness checklist.

## Phase 3 — upgrade/rollback rehearsal

Use synthetic test-only data and a **separate backup copy** of an old pre-fork `/data` volume. Do not touch real music or live user DBs.

1. Back up, checksum and test restore of the original old volume.
2. Rehearse an actual old AIO image -> forked candidate upgrade on a cloned volume; the current CI test only rehearses a legacy PostgreSQL data directory, not a complete old image.
3. Confirm migrated records, permissions default-deny, secret continuity, media mapping, and branding settings.
4. Stop the candidate and prove rollback by restoring the **old snapshot** into a clean volume before starting the old image. Never start an old image on a migrated database without restoring its old backup.

## Phase 4 — Release Candidate gate

Only after security, interactive browser, upgrade, rollback, documentation and image ownership checks pass:

- Choose a fork-specific candidate tag (not `latest`) and registry path.
- Request explicit human approval before tagging/publishing.
- Pull the published candidate digest to a disposable environment and repeat fresh/upgrade smoke tests.
- Leave `main` and CT 101 untouched until separately approved.

## Currently unresolved

- Internal hardcoded PostgreSQL password and internal API secret.
- Existing legacy `/data` PostgreSQL configuration may listen on broader interfaces. The fresh-install loopback hardening does not rewrite legacy files.
- Non-root service execution in the single-container architecture.
- Complete acquisition-route audit and browser E2E with audible playback.
- Real old-image rollback test, publication ownership and a dedicated DEV host/resource assessment.
