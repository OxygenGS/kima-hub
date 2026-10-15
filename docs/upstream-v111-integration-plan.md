# Upstream v1.11.0 integration: isolated fork development

**Scope:** [official v1.11.0](https://github.com/Chevron7Locked/kima-hub/releases/tag/v1.11.0) into OxygenGS fork, without losing features from the existing fork language/permissions branch. **No merge to main, no release tags, no image publication, no production CT 101.**

## Measured baseline (full Git trees, not capped compare-files output)

Compared the complete committed file trees of upstream `v1.10.0`, upstream `v1.11.0`, and fork commit `6b5a27f`:

- Upstream changed/added/removed **1,158** tracked files relative to v1.10.0; GitHub's ordinary compare endpoint only exposes the first 300.
- The fork differs from original v1.10.0 in **214** tracked files.
- **168 paths** were touched on **both sides** (change overlap, **not** the actual Git merge-conflict count).
- Of those overlapping paths: **133 frontend**, **24 backend**, **1 Prisma schema**, **4 GitHub CI**, **6 other**.

The new `.github/workflows/upstream-v111-integration-audit.yml` dry-runs the actual Git merge and captures the unresolved file list. **Do not equate tree overlap with merge conflicts.** This report runs on its separate draft PR, not on main or a production server.

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
7. After all automated and manual acceptance, seek separate human approvals for draft PR merge, publishing a release candidate, stable release, and finally production CT 101.

**Current state:** structural inventory and dry-run audit added. Upstream implementation **not yet integrated**; do not call this branch v1.11 compatible yet.
