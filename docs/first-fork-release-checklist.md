# First post-v1.10.0 release — OxygenGS fork

Last reviewed: **2026-10-14**. This is the **current** release checklist for PR [#5](https://github.com/OxygenGS/kima-hub/pull/5); `docs/release-readiness.md` is an archived checklist for earlier PR #1.

**Do not merge, publish a container, create a tag/release, or update CT 101 until explicitly approved.** Production CT 101 remains at upstream v1.10.0. The OxygenGS repository already published its own `v1.10.0` tag on 13 October 2026. Pick a **new, unique version** for the combined fork features; do not reuse that tag.

## Verified evidence

- [x] PR #5 commit `1c364c1`: all three GitHub Actions workflows passed, including security, lint/unit tests, frontend/backend TypeScript, a legacy naming audit, a pre-fork database backup/restore and migration, Docker build, and AIO fresh-install/audio/legacy-volume upgrade.
- [x] The disposable AIO ran **six real-login Playwright tests**: admin and regular user each verified locale switch across Settings/Search and reload, mobile language selection, and translated Collection UI while preserving the fixture's original song title. Details: AIO job `116067800418` (three tests passed per role).
- [x] Browser-only CI also covers first-run locale choice, same-origin cross-tab persistence, invalid saved locale, and mock authenticated Settings without real credentials.
- [x] Only synthetic AIO music/accounts were used; Docker images were built locally on GitHub runners **without publishing**. No production database or mounts were tested or modified.
- [x] Fork-owned release image destination identified: `ghcr.io/oxygengs/kima-hub`. Both `docker-compose.prod.yml` and `docker-compose.server.yml` use that registry and pin the currently published `v1.10.0` by default. Set `VERSION` explicitly for later releases. CI validates image origin, `/music` and `/data` mounts and supported Compose sysctls.

## Open before merging or publishing anything

- [ ] **Recheck CI on the final PR commit.** Any code, metadata or workflow changes must be retested on the new head. For a release candidate, build and check **both amd64 and arm64** (the PR Docker build targets an ordinary runner and does not independently guarantee the release's multi-architecture build).
- [ ] **Manual acceptance** in a disposable install: English/Dutch desktop and mobile, keyboard accessibility, screen readers, and TV views. Include onboarding, service integration failures, permissions (admin and normal user), album/artist/playlist dialogs, downloads, search, Vibe, playback/queue, and error recovery.
- [ ] **Original-image upgrade and restore rehearsal.** CI now also takes an offline whole-volume snapshot of its *synthetic pre-fork PostgreSQL* `/data` and attempts to recover the old schema and data in a **separate** PostgreSQL 16 container (pending current-head CI). This verifies an independent data-volume backup path but **does not** boot a real old monolithic AIO image or validate genuine historical encryption/session material. Before release, also test a **full original image** -> candidate upgrade on a copied volume and a separately restored old-image rollback. Never downgrade a migrated database.
- [ ] **Permissions migration communication.** Existing non-admin accounts receive `canRequestAlbums=false` and `canDownloadTracks=false` by default during upgrade (fail-closed); administrators must review and restore desired access.
- [ ] **Review image security findings.** The publishing workflow's Trivy image report is informational, **not blocking**. Review its actionable findings before approving public images; CI dependency security gates are a separate check.
- [ ] **Release instructions and version.** Choose a new version newer than the fork's existing `v1.10.0`; update the frontend/backend package versions and lockfile root versions **together**, the changelog, pinned Compose examples, README release-channel statements, and support/backup notes. Verify license and upstream attribution.
- [ ] **Test the actual published candidate image** in a separate test stack with fresh and restored old data, after explicit approval to publish a pre-release. Do not push to `:latest` for candidate testing.
- [ ] **Human sign-off** before marking PR #5 ready, merging to `main`, making a new stable tag, or publishing a registry image. A separate production CT 101 update requires its **own** approval, backup and rollback plan.

## Release-channel guard

- Stable images: `ghcr.io/oxygengs/kima-hub:vMAJOR.MINOR.PATCH` and `:latest`. The stable `.github/workflows/docker-publish.yml` accepts **tag pushes only**, requires strict `vMAJOR.MINOR.PATCH` and a commit reachable from the default branch, and uses serialized publishing. No manual stable release dispatch. Protect version tags from force updates in repository settings. Confirm workflow validation in CI and before release.
- Pre-release images: manual dispatch **only** via `.github/workflows/prerelease.yml`, with `:prerelease` and unique `:prerelease-<sha>` tags. Arbitrary workflow input is suffix-validated before use. This is a **publishing** action: never dispatch without approval.
- Both normal and extended AIO Compose files default to published `v1.10.0` until a new version is approved; override with an explicitly chosen `VERSION` when updating. Preserve the Dockge/Compose project name and original `/data` volume (renaming a stack may allocate a fresh named volume).
- `vm.overcommit_memory` is a host-level kernel parameter and cannot be applied through Compose container `sysctls`. Do not ask Compose to modify it; only a host administrator may choose an appropriate host setting.
- Back up the complete existing `/data` volume and encryption/session material alongside Compose and database backups; test rollback with an independent pre-upgrade volume copy. Do not use `docker compose down -v` for an existing installation containing data to preserve.

## Recommended sequence

1. Finish review and all final-head tests while the PR remains draft.
2. Verify a copied old installation's upgrade and independent backup-based rollback, plus manual UX and accessibility.
3. Select the version and prepare notes, reproducible Compose instructions and a candidate.
4. With explicit approval, publish an isolated pre-release image, pull it from GHCR, and test it.
5. With explicit approval, merge the reviewed PR and publish a stable tag/release. Rollout to any existing server is a **separate decision**.
