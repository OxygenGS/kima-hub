# Combined OxygenGS Kima Hub v1.11.0 — release handoff plan

**Status: NOT RELEASED.** This document is a source-control/release checklist, not deployment instructions for any particular server. Its purpose is to move the EN/NL + upstream v1.11 + OxygenGS security work toward one stable fork image without bypassing acceptance.

## Release identity and current state

- **Proposed fork stable tag:** `v1.11.0`. At review time this tag did **not** exist on OxygenGS, while `v1.10.0` did. Recheck remote tags immediately before approval and creation.
- **Future stable image:** `ghcr.io/oxygengs/kima-hub:v1.11.0` only after explicit approved merge and stable tag. The revised stable publisher does **NOT** change `:latest`; any future alias promotion requires separate explicit approval. `v1.11.0` is not yet published.
- Backend/frontend `package.json` and both npm lockfile roots already declare `1.11.0`; the root repository has no npm package file. Keep them matched, and verify all four with `.github/ci/check-release-metadata.py`.
- **Actual current prerelease:** `ghcr.io/oxygengs/kima-hub:prerelease-v111-rc2` was [published successfully](https://github.com/OxygenGS/kima-hub/actions/runs/39069358767) from application source `ec44b98d9f69175b08bd2c6c88b0fb6552d6581c` with the PostgreSQL `en_US.utf8` fix. Multiarch digest: `sha256:c566c59b2aabb150d63cb623c61c5335a41122b224bb08b1df4c55b3a8a2fe56`. The independently pulled immutable image passed [AMD64/ARM64 verification 3/3](https://github.com/OxygenGS/kima-hub/actions/runs/39070979565), including real roles, languages/audio, and isolated original upstream v1.10/v1.11 upgrades/rollback. Earlier rc1 is superseded.
- **Published/default Compose stays v1.10.0** until the stable image is actually approved and exists. Never ship Compose defaults that point to an unpublished tag.
- **One release, not three apps:** [Draft #5](https://github.com/OxygenGS/kima-hub/pull/5) (languages) and [Draft #6](https://github.com/OxygenGS/kima-hub/pull/6) (upstream work) are preparatory histories. The combined [Draft #7](https://github.com/OxygenGS/kima-hub/pull/7) already includes both through linear Git ancestry and now targets `main` directly; merge **#7 once** after approval, rather than separately merging all three.

## System FFmpeg hardening in combined draft

- The release branch incorporates the experiment from [commit `e82cf6f`](https://github.com/OxygenGS/kima-hub/commit/e82cf6f4186945bbb3ee1c93ce5d33f151353c97): backend no longer installs separate static FFmpeg 4.1.x binaries, and streaming plus waveform generation use system FFmpeg, which the AIO Dockerfile already installs.
- [Experimental full AIO verification #39128491602](https://github.com/OxygenGS/kima-hub/actions/runs/39128491602) passed **9/9**, including real MP3 transcoding, byte-range seek, FFmpeg waveform extraction, native AMD64/ARM64 image build, full UI/backend/security checks, and disposable original v1.10/v1.11 upgrade with independent rollback on AMD64. Its tested image was **never published**.
- The assembled experimental images still report **295 HIGH/8 CRITICAL (AMD64) and 294 HIGH/8 CRITICAL (ARM64)** with zero explicitly available fixes from Trivy. These alerts and root backend/analyzer privileges **remain release blockers for security disposition**, regardless of passing CI.
- The published rc2 still contains the earlier runtime; **its immutable digest does not represent the system-FFmpeg change**. Run and review fresh CI on this combined Draft #7 HEAD before any release candidate is proposed. No approval to publish, merge, promote `:latest`, or deploy follows from this verification.

## Technical acceptance before the next candidate or stable release

- [ ] Re-run/review all relevant CI on the **final merged source/workflow commit**. Exact application/runtime source `ec44b98` passed [PR checks 7/7](https://github.com/OxygenGS/kima-hub/actions/runs/39067956900), [native 9/9](https://github.com/OxygenGS/kima-hub/actions/runs/39067956892), [EN/NL](https://github.com/OxygenGS/kima-hub/actions/runs/39067956881) and [security](https://github.com/OxygenGS/kima-hub/actions/runs/39067956882); identical-runtime [full E2E](https://github.com/OxygenGS/kima-hub/actions/runs/39032005018) also passed. **Subsequent stable publisher/documentation-only revisions require their own final-head gate validation.**
- [ ] Review and explicitly disposition the published rc2 full-image [Trivy audit](https://github.com/OxygenGS/kima-hub/actions/runs/39101135942): AMD64 295 HIGH / 8 CRITICAL; ARM64 294 HIGH / 8 CRITICAL; zero scanner-supplied fixed package versions. Every unresolved CRITICAL and non-root service hardening requires recorded technical evidence, owner and acceptance/mitigation, not just a green scan. See the [detailed rc2 audit](https://github.com/OxygenGS/kima-hub/blob/feature/prerelease-f31e589-verification/docs/v111-rc2-security-disposition.md).
- [ ] Review root supervisor/backend/analyzer boundaries, effective credentials/file permissions, dependency/build-stage security, Apache-2.0 vendored audio helper attribution, and the complete GPLv3 obligations.
- [ ] Real user tests in EN and NL across desktop/mobile/tablet/large-screen and keyboard/screen reader; genuine audio, seek, queue, network failure and admin/regular-listener authorization flows.
- [ ] Test complete backup/restore with a **representative nonproduction copy** of an existing independently operated installation; original image must start from an untouched independent **pre-upgrade volume**. Never put an older image on a migrated DB. These private tests need their own separate consent and are not accomplished by GitHub CI.
- [ ] Ensure documentation describes the generated persistent database credential stored under `/data/secrets`; cold backups must include it along with the encryption/session material.

## Proposed safe release sequence (requires authorization at each publishing gate)

1. **Develop only in Draft branches.** Fix technical CI/image/security blockers and document tested commit SHA; do not merge until reviewers and the user approve.
2. **DONE for rc2:** an explicitly initiated manual prerelease publisher built/scanned native AMD64 and ARM64 and published only rc2/immutable candidate tags, not `:latest`. The actual published digest is recorded above; a future new candidate would again require explicit approval.
3. **Automated complete for rc2:** independent [published-image verification](https://github.com/OxygenGS/kima-hub/actions/runs/39070979565) passed both native architectures, language/permission/audio checks and official upstream v1.10/v1.11 isolated copied-data upgrade plus independent rollback. **Manual** device/accessibility, security and representative recovery checks remain outstanding.
4. **Separate explicit approval to integrate:** confirm combined Draft #7 is ahead of and mergeable into `main`, inspect its full diff and ensure #5/#6 commits are already ancestors. With authorization, merge **only the combined #7** into `main` without separately replaying #5/#6 (which could duplicate history); keep the older Draft PRs for archival closure after successful integration. Verify the resulting main SHA and required CI.
5. Re-run full final-main validation and check version/tag uniqueness **again**. Only with separate explicit stable release approval create `v1.11.0` on the verified main commit. `docker-publish.yml` now stages two **native** individually scanned images, verifies their manifest, publishes the **versioned** tag and then creates the GitHub Release; **it does not update `:latest`**. Separate alias promotion requires additional explicit approval.
6. After the stable image is **verifiably available**, update the Compose defaults from `v1.10.0` to `v1.11.0` in a separately reviewed documentation/source change; do not change local running Compose files.
7. Any later upgrade of a privately managed installation is a **separate explicit go/no-go decision** requiring its own backup, mount inventory, downtime, digest pinning, smoke and independent rollback plan.

## Current release safety mechanism

- Stable tag guard verifies `vMAJOR.MINOR.PATCH`, default-branch ancestry, version equality across frontend/backend/lockfiles and fork-specific changelog entry.
- Stable publishing now scans the **exact loaded images on AMD64 and ARM64** for fixable HIGH/CRITICAL findings and embedded secrets before GHCR staging, and assembles the immutable multiarchitecture version tag only after both pass. It never publishes `:latest` automatically. Human review of unpatched OS findings, permissions and licensing remains mandatory.
- Pre-release publishing is manual-only, with metadata/version validation and a pre-push native **AMD64+ARM64** vulnerability and secret scan. None of the workflow changes dispatched a publisher.
- Combined PR CI scans both architectures and retains artifacts. The separately [audited published rc2 digest](https://github.com/OxygenGS/kima-hub/actions/runs/39101135942) supersedes rc1 as runtime evidence; it does not constitute manual security acceptance.

**No authorization is implied by this plan.** The user's separately maintained installations, host configuration, storage mounts and any private identifiers must never enter the public source repository.
