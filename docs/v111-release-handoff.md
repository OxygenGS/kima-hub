# Combined OxygenGS Kima Hub v1.11.0 — release handoff plan

**Status: NOT RELEASED.** This document is a source-control/release checklist, not deployment instructions for any particular server. Its purpose is to move the EN/NL + upstream v1.11 + OxygenGS security work toward one stable fork image without bypassing acceptance.

## Release identity and current state

- **Proposed fork stable tag:** `v1.11.0`. At review time this tag did **not** exist on OxygenGS, while `v1.10.0` did. Recheck remote tags immediately before approval and creation.
- **Future image:** `ghcr.io/oxygengs/kima-hub:v1.11.0`, and `:latest` **only** when an explicitly approved stable tag triggers the fork-owned publisher. Neither image/tag is currently available.
- Backend/frontend `package.json` and both npm lockfile roots already declare `1.11.0`; the root repository has no npm package file. Keep them matched, and verify all four with `.github/ci/check-release-metadata.py`.
- **Published/default Compose stays v1.10.0** until the stable image is actually approved and exists. Never ship Compose defaults that point to an unpublished tag.
- **One release, not three apps:** [Draft #5](https://github.com/OxygenGS/kima-hub/pull/5) is language selection, [Draft #6](https://github.com/OxygenGS/kima-hub/pull/6) is upstream integration, and [Draft #7](https://github.com/OxygenGS/kima-hub/pull/7) is the final combined implementation. They form a stacked chain and are not independent installations.

## Technical acceptance before a pre-release can be published

- [ ] Entire **exact current #7 head** passes security, frontend/backend, EN/NL browser, real HTTP permissions, live AIO smoke, native AMD64/ARM64 and original upstream v1.10/v1.11 disposable volume upgrade + independent rollback.
- [ ] Trivy report on the **assembled image** is reviewed, not merely generated. All HIGH/CRITICAL entries with known fixed packages block release CI. Any unpatched CRITICAL finding needs explicit technical mitigation/acceptance with evidence and ownership; see [the image triage](v111-image-security-review.md).
- [ ] Review root supervisor/backend/analyzer boundaries, effective credentials/file permissions, dependency/build-stage security, Apache-2.0 vendored audio helper attribution, and the complete GPLv3 obligations.
- [ ] Real user tests in EN and NL across desktop/mobile/tablet/large-screen and keyboard/screen reader; genuine audio, seek, queue, network failure and admin/regular-listener authorization flows.
- [ ] Test complete backup/restore with a **representative nonproduction copy** of an existing independently operated installation; original image must start from an untouched independent **pre-upgrade volume**. Never put an older image on a migrated DB. These private tests need their own separate consent and are not accomplished by GitHub CI.
- [ ] Ensure documentation describes the generated persistent database credential stored under `/data/secrets`; cold backups must include it along with the encryption/session material.

## Proposed safe release sequence (requires authorization at each publishing gate)

1. **Develop only in Draft branches.** Fix technical CI/image/security blockers and document tested commit SHA; do not merge until reviewers and the user approve.
2. **Approval for isolated candidate image (separate decision):** only then run the fork-owned `prerelease.yml` publisher against the reviewed commit; it checks release metadata and fixable AMD64 image CVEs before push. Use a SHA-specific candidate reference rather than `:latest`.
3. Pull the **actual published candidate digest** into a fully isolated testing stack, validate both supported CPU architectures, cross-device/EN-NL behavior and complete copy-upgrade/rollback. Continue to block publication of stable if findings remain.
4. **Separate explicit approval to integrate.** Resolve the stacked PR chain in dependency order: integrate #5 to main, retarget/reconcile #6 on current main and validate, integrate #6, then retarget/reconcile #7 on current main and validate the final code. Do not simply merge #6 into #5 or #7 into #6 and assume that updates main. Avoid accidental duplicate commits from squash/rebase; review the resulting diff and exact commit.
5. Re-run full final-main validation and check version/tag uniqueness **again**. Only with separate explicit stable release approval create `v1.11.0` on the verified main commit. `docker-publish.yml` is tag-triggered and will publish `v1.11.0` and `:latest`, so tag creation is a production-grade publication action.
6. After the stable image is **verifiably available**, update the Compose defaults from `v1.10.0` to `v1.11.0` in a separately reviewed documentation/source change; do not change local running Compose files.
7. Any later upgrade of a privately managed installation is a **separate explicit go/no-go decision** requiring its own backup, mount inventory, downtime, digest pinning, smoke and independent rollback plan.

## Current release safety mechanism

- Stable tag guard verifies `vMAJOR.MINOR.PATCH`, default-branch ancestry, version equality across frontend/backend/lockfiles and fork-specific changelog entry.
- Stable publishing now **fails before the GHCR push** if the locally built AMD64 image has fixable HIGH/CRITICAL vulnerabilities; it still needs human review of unpatched OS findings and independently tested ARM64.
- Pre-release publishing is manual-only, with metadata/version validation and a separate pre-push image vulnerability check. None of these added controls dispatches a publisher.
- The stacked PR CI scans both assembled architectures and retains artifacts even when a vulnerability gate fails.

**No authorization is implied by this plan.** The user's separately maintained installations, host configuration, storage mounts and any private identifiers must never enter the public source repository.
