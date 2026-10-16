# First post-v1.10.0 release — OxygenGS fork

Last reviewed: **2026-10-16**. This is the **current** release checklist for the combined Draft [#5](https://github.com/OxygenGS/kima-hub/pull/5) → [#6](https://github.com/OxygenGS/kima-hub/pull/6) → [#7](https://github.com/OxygenGS/kima-hub/pull/7) integration. The outdated deployment-specific checklist has been retired.

**Do not merge, publish a container, create a tag/release, or deploy to an independently operated production installation without explicit approval.** The OxygenGS repository describes the product; personal container IDs, host resources and installation details are not release metadata. The OxygenGS repository already published its own `v1.10.0` tag on 13 October 2026. Pick a **new, unique version** for the combined fork features; do not reuse that tag.

## Verified evidence

- [x] PR #5 commit `1c364c1`: all three GitHub Actions workflows passed, including security, lint/unit tests, frontend/backend TypeScript, a legacy naming audit, a pre-fork database backup/restore and migration, Docker build, and AIO fresh-install/audio/legacy-volume upgrade.
- [x] The disposable AIO ran **six real-login Playwright tests**: admin and regular user each verified locale switch across Settings/Search and reload, mobile language selection, and translated Collection UI while preserving the fixture's original song title. Details: AIO job `116067800418` (three tests passed per role).
- [x] Browser-only CI also covers first-run locale choice, same-origin cross-tab persistence, invalid saved locale, and mock authenticated Settings without real credentials.
- [x] Only synthetic AIO music/accounts were used; Docker images were built locally on GitHub runners **without publishing**. No production database or mounts were tested or modified.
- [x] Fork-owned release image destination identified: `ghcr.io/oxygengs/kima-hub`. Both `docker-compose.prod.yml` and `docker-compose.server.yml` use that registry and pin the currently published `v1.10.0` by default. Set `VERSION` explicitly for later releases. CI validates image origin, `/music` and `/data` mounts and supported Compose sysctls.

- [x] Offline full-volume snapshot and independently restored legacy PostgreSQL 16 data **passed** on `7129428` (AIO job `116107289812`), preserving account records, preferences, library and a non-database marker. This does **not** complete the genuine old-monolithic-AIO rollback requirement.
- [x] [AIO Docker Compose and Dockge update/recovery guide](safe-aio-updates.md) added. Its full old-image procedure still requires a separate manual rehearsal.

## v1.11 integration checkpoint — 16 October 2026

- The combined update is being developed in three chained **Draft** PRs: [#7](https://github.com/OxygenGS/kima-hub/pull/7) → [#6](https://github.com/OxygenGS/kima-hub/pull/6) → [#5](https://github.com/OxygenGS/kima-hub/pull/5) → main. Do not release any one PR in isolation and assume it contains all v1.11/UI/localization changes.
- Experimental `35b5e5a` passed [eight/eight GitHub Actions jobs](https://github.com/OxygenGS/kima-hub/actions/runs/38875081664), including both locally built no-push AIO architectures, actual official upstream v1.10.0/v1.11.0 upgrade/independent rollback, full backend tests, and public EN/NL browser switching.
- The combined Draft PR #7 checkpoint `680a8e0` passed [8/8 GitHub Actions jobs](https://github.com/OxygenGS/kima-hub/actions/runs/38891763823), including original upstream v1.10 and v1.11 independent recovery, real disposable admin/listener EN/NL scenarios, and both image architectures. **Any newer commit requires its own CI; this is not release approval.**
- Most recent fully validated combined Draft #7 implementation `d42a966`: [9/9 GitHub Actions jobs successful](https://github.com/OxygenGS/kima-hub/actions/runs/38946015055), including Trivy source/dependency scanning, both native AIO images, actual assembled-image vulnerability scan artifacts and disposable original-image upgrade/independent rollback. **The image scans reveal eight CRITICAL OS-package findings on each architecture; see [the open image-security assessment](v111-image-security-review.md).** This is not security release approval. Subsequent commits require their own CI; no image has been published.
- Latest official upstream release checked: **v1.11.0**, dated 12 October 2026; no fork candidate image, stable tag or new Docker/Compose version has been published.
- The **remaining manual and publication gates** are defined in [the v1.11 acceptance matrix](v111-release-acceptance.md). Individual production installations are outside this source-code validation.

## Open before merging or publishing anything

- [ ] **Recheck CI on the final PR commit.** Any code, metadata or workflow changes must be retested on the new head. For a release candidate, build and check **both amd64 and arm64** (the PR Docker build targets an ordinary runner and does not independently guarantee the release's multi-architecture build).
- [ ] **Manual acceptance** in a disposable install: English/Dutch desktop and mobile, keyboard accessibility, screen readers, and TV views. Include onboarding, service integration failures, permissions (admin and normal user), album/artist/playlist dialogs, downloads, search, Vibe, playback/queue, and error recovery.
- [ ] **Actual original-image upgrade and rollback rehearsal.** The synthetic PostgreSQL whole-volume restore passed on `7129428`. The new GitHub Actions step pulls the published `chevron7locked/kima:v1.10.0` image, creates disposable accounts and audio inside it, backs up its full `/data`, upgrades a COPY using the fork candidate, and separately restores the original image from another copy. **Automated original-image upgrade and independent rollback checks passed on `e1b3593` (Actions #38896676716); a representative manual rehearsal remains outstanding.** A manual rehearsal with a nonproduction copy of an existing real-world installation remains required; never downgrade a migrated database.
- [ ] **Permissions migration communication.** Existing non-admin accounts receive `canRequestAlbums=false` and `canDownloadTracks=false` by default during upgrade (fail-closed); administrators must review and restore desired access.
- [ ] **Review actual image security findings.** Full AMD64/ARM64 Trivy reports include 297/296 HIGH and eight CRITICAL records each at commit `d42a966`; no fixed package versions were listed. The new CI gate fails for any fixable HIGH/CRITICAL and retains full reports, but **all unpatched CRITICAL findings remain open for human risk/mitigation review**. See [image-security review](v111-image-security-review.md).
- [ ] **Release instructions and version.** Choose a new version newer than the fork's existing `v1.10.0`; update the frontend/backend package versions and lockfile root versions **together**, the changelog, pinned Compose examples, README release-channel statements, and support/backup notes. Verify license and upstream attribution.
- [ ] **Test the actual published candidate image** in a separate test stack with fresh and restored old data, after explicit approval to publish a pre-release. Do not push to `:latest` for candidate testing.
- [ ] **Human sign-off** before marking PR #5 ready, merging to `main`, making a new stable tag, or publishing a registry image. Any later production installation upgrade requires its **own** approval, backup and rollback plan.

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
