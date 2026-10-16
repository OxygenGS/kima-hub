# Upstream v1.11.0 integration: isolated fork development

**Scope:** [official v1.11.0](https://github.com/Chevron7Locked/kima-hub/releases/tag/v1.11.0) into the OxygenGS fork, preserving the language and permissions branches. **No merge to main, release tag, image publication or production deployment is approved.** This is development history; review Draft PR #7 for the combined implementation and current CI.

## Measured baseline (full Git trees, not capped compare-files output)

Compared the complete committed file trees of upstream `v1.10.0`, upstream `v1.11.0`, and fork commit `6b5a27f`:

- Upstream changed/added/removed **1,158** tracked files relative to v1.10.0; GitHub's ordinary compare endpoint only exposes the first 300.
- The fork differs from original v1.10.0 in **214** tracked files.
- **168 paths** were touched on **both sides** (change overlap, **not** the actual Git merge-conflict count).
- Of those overlapping paths: **133 frontend**, **24 backend**, **1 Prisma schema**, **4 GitHub CI**, **6 other**.

The isolated Git merge audit measured **141 actual unresolved merge paths**: 125 frontend, 9 backend/schema, 4 workflows, and 3 other. See the [per-file conflict inventory](upstream-v111-conflicts.md). The first 168 paths were overlapping changes, not conflicts. Both reports run against the pinned v1.11.0 tag without pushing, publishing or touching production.

## Verified implementation checkpoint (2026-10-15)

The experimental PR #7 implementation is now in a separate draft branch above the PR #6 integration plan. Hosted workflow [38740882417](https://github.com/OxygenGS/kima-hub/actions/runs/38740882417) was **7/7 green** on `d276fa6`, including a locally built, non-published amd64 AIO image booted in disposable CI.

The fresh AIO test verified fork database migrations/permissions/branding, loopback-only PostgreSQL, real admin and standard-account authentication, generated WAV byte identity, seek, MP3 transcoding, rejected forbidden stream access and out-of-library path traversal, 3/3 English/Dutch authenticated Chromium flows per role, and secrets/records after removing and recreating the container with its original disposable volumes.

**This is not an upgrade or rollback certification.** Required before any release or production deployment: (1) original official v1.10 full-image to fork AIO upgrade with independent original-volume restore/rollback; (2) same for official v1.11 full image; (3) arm64 build/runtime validation; (4) full new-screen EN/NL, TV/mobile, security and accessibility review; (5) explicit separate human approvals for merge, publication and any production installation. Do not substitute a schema-only test for either full-image rehearsal. No workflow here should deploy or push a registry image.

## Full-image upgrade verification (2026-10-15)

GitHub Actions [38746212125](https://github.com/OxygenGS/kima-hub/actions/runs/38746212125) passed **7/7 jobs**, including the real amd64 AIO image build and the **complete original official v1.10.0 AND v1.11.0 image** migration rehearsals. Each starts the original pinned image, creates disposable credentials/music/playlist, snapshots the original full data volume cold, upgrades only an independent copy, verifies logins, playlist membership, music, encryption/session secrets and fork-specific permission defaults, then starts the original image against a separately restored pre-upgrade snapshot. Both independent rollback checks passed. No production host/data, registry pushes or releases were involved.

**Boundaries:** synthetic fixture coverage is not a guarantee for unknown real data. ARM64 build/runtime, additional real-world datasets, manual accessibility/mobile/TV and complete v1.11 localization and download-route security inventory remain separate release gates.

## Material upstream changes to reconcile

- **44 Prisma migrations** between 1.10 and 1.11; verify their ordering, existing fork permission/branding migrations, schema conflicts, dropped API fields, and data preservation with copied volumes.
- ONNX vibe/audio analyzers replace the old PyTorch/TensorFlow pipeline; do not retain old model pins or incompatible Docker images blindly. Expect re-analysis and changes in model data.
- Last.fm integration removed; ListenBrainz, MusicBrainz and AcoustID pipelines replace it. Existing fork settings/errors, UI translations and download permission checks need updated endpoints and regression tests.
- New Stats and release notes / what's-new pages; changes to map and mobile layouts, visible text casing, browsing and playlist controls. **Translate user-visible text only**, not database or code identifiers.
- Upstream removes some previously exposed endpoints, including `POST /api/downloads/keep-track` and `/api/listening-state`. Our existing fork download permissions must be re-reviewed on the new download routes rather than blindly preserving a deleted endpoint.
- CI, Docker image, Github publishing workflow and privacy/attribution changes cannot replace fork-owned release safeguards. Explicit tag publishing; no silent `latest` pushes.

## Integration plan

1. Get **actual merge conflicts** using the isolated merge report; categorize database, runtime/backend, user-facing UI, i18n, and packaging.
2. Reconcile *schema and migrations* first. Maintain fork permission and branding fields; create safe follow-up migrations if required. Prove old v1.10 and original v1.11 copies both upgrade.
3. Reconcile backend endpoints and permission coverage across download, acquisition and metadata routes; keep deny-by-default behavior and tests for regular users.
4. Reconcile frontend screens, add missing EN/NL dictionary keys and change browser tests to cover new Stats/What's New/Vibe UI. Preserve music names and API contracts.
5. Validate ONNX CPU behavior, optional GPU flags, ARM64/AMD64 builds and streaming/playback.
6. Test original full-image upgrades from **both v1.10.0 and v1.11.0** and independently restored rollback volumes, with synthetic accounts and media.
7. After all automated and manual acceptance, seek separate human approvals for draft PR merge, publishing a release candidate, stable release, and finally any separately managed production installation.

**Incremental compatibility fixes:** the browser-auth API now tolerates blocked storage and uses memory-only credentials as a fallback. The EN/NL UI language selector likewise works temporarily without storage, and the activity panel no longer crashes during startup. All three dedicated CI checks (merge audit, frontend TypeScript/lint/auth unit tests and Chromium language flow) **passed on `9b62d12`**.

**Current state:** compatibility inventory and small, tested fixes are present. **The functional v1.11 release is not yet merged.** Do not call this branch v1.11-compatible until its 141 conflicts and schema/API/UX regressions are resolved and end-to-end upgrade tests pass.
