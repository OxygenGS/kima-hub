# First post-v1.10.0 release — OxygenGS fork

Last reviewed: **2026-10-18**. This checklist covers the combined Draft [#5](https://github.com/OxygenGS/kima-hub/pull/5) → [#6](https://github.com/OxygenGS/kima-hub/pull/6) → [#7](https://github.com/OxygenGS/kima-hub/pull/7) application. Only PR #7 directly targets main for the eventual single integration; private installation settings and IDs must stay out of this repository.

**Do not merge, publish a container, create a tag/release, or deploy to an independently operated production installation without explicit approval.** The OxygenGS repository describes the product; personal container IDs, host resources and installation details are not release metadata. The OxygenGS repository already published its own `v1.10.0` tag on 13 October 2026. The proposed **unpublished** combined fork version is `v1.11.0` (the existing v1.10.0 tag must never be reused); check tag availability again before any stable publication.

## Verified evidence

- [x] PR #5 commit `1c364c1`: all three GitHub Actions workflows passed, including security, lint/unit tests, frontend/backend TypeScript, a legacy naming audit, a pre-fork database backup/restore and migration, Docker build, and AIO fresh-install/audio/legacy-volume upgrade.
- [x] The disposable AIO ran **six real-login Playwright tests**: admin and regular user each verified locale switch across Settings/Search and reload, mobile language selection, and translated Collection UI while preserving the fixture's original song title. Details: AIO job `116067800418` (three tests passed per role).
- [x] Browser-only CI also covers first-run locale choice, same-origin cross-tab persistence, invalid saved locale, and mock authenticated Settings without real credentials.
- [x] The early smoke tests used synthetic AIO music and accounts and locally built no-push Docker images. **Later, with approval, rc2 was separately published and verified from real GHCR images.** Neither phase touched a private installation.
- [x] Fork-owned release image destination identified: `ghcr.io/oxygengs/kima-hub`. Both `docker-compose.prod.yml` and `docker-compose.server.yml` use that registry and pin the currently published `v1.10.0` by default. Set `VERSION` explicitly for later releases. CI validates image origin, `/music` and `/data` mounts and supported Compose sysctls.

- [x] Offline full-volume snapshot and independently restored legacy PostgreSQL 16 data **passed** on `7129428` (AIO job `116107289812`), preserving account records, preferences, library and a non-database marker. This does **not** complete the genuine old-monolithic-AIO rollback requirement.
- [x] [AIO Docker Compose and Dockge update/recovery guide](safe-aio-updates.md) added. Its full old-image procedure still requires a separate manual rehearsal.

## v1.11 integrated prerelease checkpoint — 18 October 2026

- The combined code lives in one [Draft #7 → main](https://github.com/OxygenGS/kima-hub/pull/7), including preparatory Drafts #5 (EN/NL) and #6 (upstream). Do **not** merge #5 or #6 separately; they are not separate release images.
- Experimental `35b5e5a` passed [eight/eight GitHub Actions jobs](https://github.com/OxygenGS/kima-hub/actions/runs/38875081664), including both locally built no-push AIO architectures, actual official upstream v1.10.0/v1.11.0 upgrade/independent rollback, full backend tests, and public EN/NL browser switching.
- The combined Draft PR #7 checkpoint `680a8e0` passed [8/8 GitHub Actions jobs](https://github.com/OxygenGS/kima-hub/actions/runs/38891763823), including original upstream v1.10 and v1.11 independent recovery, real disposable admin/listener EN/NL scenarios, and both image architectures. **Any newer commit requires its own CI; this is not release approval.**
- **Published current runtime evidence:** rc2 from app SHA `ec44b98d9f69175b08bd2c6c88b0fb6552d6581c`, GHCR manifest `sha256:c566c59b2aabb150d63cb623c61c5335a41122b224bb08b1df4c55b3a8a2fe56`; [publisher succeeded](https://github.com/OxygenGS/kima-hub/actions/runs/39069358767), [real-image verification 3/3](https://github.com/OxygenGS/kima-hub/actions/runs/39070979565), and [published-image security audit 2/2](https://github.com/OxygenGS/kima-hub/actions/runs/39101135942). Final publisher/documentation-only changes to Draft #7 require exact-commit validation before merge. No stable v1.11.0 tag or deployment.
- Official upstream base is v1.11.0 (12 October 2026); OxygenGS rc2 is a **candidate image only**, not a stable release. Existing Compose defaults and stable fork remain pinned to v1.10.0.
- The **remaining manual and publication gates** are defined in [the v1.11 acceptance matrix](v111-release-acceptance.md). Individual production installations are outside this source-code validation.

## Open before merging or publishing anything

- [ ] **Recheck CI on the final PR commit.** Any code, metadata or workflow changes must be retested on the new head. For a release candidate, build and check **both amd64 and arm64** (the PR Docker build targets an ordinary runner and does not independently guarantee the release's multi-architecture build).
- [ ] **Manual acceptance** in a disposable install: English/Dutch desktop and mobile, keyboard accessibility, screen readers, and TV views. Include onboarding, service integration failures, permissions (admin and normal user), album/artist/playlist dialogs, downloads, search, Vibe, playback/queue, and error recovery.
- [ ] **Actual original-image upgrade and rollback rehearsal.** The synthetic PostgreSQL whole-volume restore passed on `7129428`. The new GitHub Actions step pulls the published `chevron7locked/kima:v1.10.0` image, creates disposable accounts and audio inside it, backs up its full `/data`, upgrades a COPY using the fork candidate, and separately restores the original image from another copy. **Automated original-image upgrade and independent rollback checks passed on `e1b3593` (Actions #38896676716); a representative manual rehearsal remains outstanding.** A manual rehearsal with a nonproduction copy of an existing real-world installation remains required; never downgrade a migrated database.
- [ ] **Permissions migration communication.** Existing non-admin accounts receive `canRequestAlbums=false` and `canDownloadTracks=false` by default during upgrade (fail-closed); administrators must review and restore desired access.
- [ ] **Accept or mitigate outstanding container security findings.** The *actual published rc2* [immutable digest audit](https://github.com/OxygenGS/kima-hub/actions/runs/39101135942) found AMD64 295 HIGH / 8 CRITICAL and ARM64 294 HIGH / 8 CRITICAL (zero Trivy-listed fixed versions), and directly confirmed root backend/audio analyzer execution. This is neither a clean vulnerability report nor owner sign-off; review the [rc2 disposition](https://github.com/OxygenGS/kima-hub/blob/feature/prerelease-f31e589-verification/docs/v111-rc2-security-disposition.md).
- [ ] **Release instructions and version.** Proposed fork tag `v1.11.0` is not published. Frontend/backend package.json and both lockfiles already agree at 1.11.0; the source guard enforces consistency. Complete final notes, manual acceptance and license/upstream credit. Keep Compose defaults on published `v1.10.0` until the new tag and image actually exist. Follow [the staged release handoff](v111-release-handoff.md).
- [x] **Tested the actual published rc2 image** on native AMD64/ARM64 with immutable digest, fresh install, admin/listener permissions, EN/NL, audio, source label, genuine old-v1.10/v1.11 copied-data upgrade and independent rollback: [#39070979565](https://github.com/OxygenGS/kima-hub/actions/runs/39070979565). Manual device/real-data checks remain open.
- [ ] **Human sign-off** before marking PR #5 ready, merging to `main`, making a new stable tag, or publishing a registry image. Any later production installation upgrade requires its **own** approval, backup and rollback plan.

## Release-channel guard

- Stable versioned images: `ghcr.io/oxygengs/kima-hub:vMAJOR.MINOR.PATCH`. The tag-only `.github/workflows/docker-publish.yml` checks exact version, `main` ancestry and a unique existing-tag boundary; builds/scans both AMD64 and ARM64 natively before any staging, and publishes a checked two-platform version manifest. **It does NOT move `:latest`; future alias promotion requires distinct explicit authorization.** Protect version tags against force updates in repository settings.
- Pre-release images: manual dispatch **only** via `.github/workflows/prerelease.yml`, which validated metadata/suffix and independently scanned both loaded native AMD64+ARM64 images before staging and publishing rc2. No prerelease workflow may publish `:latest`.
- Both normal and extended AIO Compose files default to published `v1.10.0` until a new version is approved; override with an explicitly chosen `VERSION` when updating. Preserve the Dockge/Compose project name and original `/data` volume (renaming a stack may allocate a fresh named volume).
- `vm.overcommit_memory` is a host-level kernel parameter and cannot be applied through Compose container `sysctls`. Do not ask Compose to modify it; only a host administrator may choose an appropriate host setting.
- Back up the complete existing `/data` volume and encryption/session material alongside Compose and database backups; test rollback with an independent pre-upgrade volume copy. Do not use `docker compose down -v` for an existing installation containing data to preserve.

## Recommended sequence

1. Finish review and all final-head tests while the PR remains draft.
2. Verify a copied old installation's upgrade and independent backup-based rollback, plus manual UX and accessibility.
3. Select the version and prepare notes, reproducible Compose instructions and a candidate.
4. **Already done for rc2:** manual prerelease published, downloaded and independently verified by immutable digest. Repeat only if the application runtime itself changes.
5. With explicit approval, merge the reviewed PR and publish a stable tag/release. Rollout to any existing server is a **separate decision**.
