# Upstream compatibility policy

OxygenGS Kima Hub is an independently maintained fork of
[Chevron7Locked/kima-hub](https://github.com/Chevron7Locked/kima-hub).
The upstream project remains the source for upstream releases; OxygenGS is
responsible for its own UI, security guards, EN/NL locale, permissions, builds
and published images.

## Design and contribution rules

1. Prefer focused patches, small components, existing extension points, and
   centralized design tokens over rewrites of upstream core functionality.
2. Keep fork-specific branding, locale, permissions and security behavior easy
   to identify in code and tests. Preserve GPLv3 and upstream attribution.
3. Review changes to API contracts, Prisma migrations, authentication, playback
   and media paths separately. Never overwrite the fork's security guards or
   existing user data with upstream defaults.
4. Do not put any installation-specific LXC/CT identifiers, credentials,
   host paths, backups or production settings in this application repository.
5. Integrate by reviewed pull request. Green checks for an isolated UI PR
   do **not** prove an upstream version is safe to deploy.

## Checking a newer upstream release

Use the **Upstream Compatibility Audit (manual, read-only)** workflow in
GitHub Actions. Choose an **existing upstream release tag** (for example
`v1.11.0`), not `main`, a development branch, or a release candidate.

The audit:

- fetches only that exact upstream tag into a disposable GitHub Actions checkout;
- attempts a merge **without committing**, records file conflicts, and aborts it;
- lists upstream database migrations and frontend pages absent from the fork;
- uploads a report as an artifact. It **cannot push, merge, tag, publish or deploy**.

A zero-conflict result does not mean the systems are behaviorally compatible.
The report is a planning input, never permission to merge automatically.

## Human-reviewed upstream integration checklist

- [ ] Read upstream release notes; verify the chosen tag and commit.
- [ ] Run and review the audit, especially conflicted files, routes and migrations.
- [ ] Prepare a separate integration branch and small reviewed pull requests.
- [ ] Preserve OxygenGS security/permission/branding and locale guards.
- [ ] Reconcile database migrations with existing installations; plan backups.
- [ ] Add EN/NL strings and browser tests for any new visible upstream UI.
- [ ] Run frontend/backend lint, typechecks, tests, authorization/playback tests,
      database upgrade/restore tests, and native AMD64/ARM64 AIO image scans.
- [ ] Review the complete image scan: vulnerabilities without published fixes
      still need human security review, and fixable HIGH/CRITICAL findings block.
- [ ] Review release metadata and publish a **new** OxygenGS version only after
      all mandatory acceptance checks. Never reuse an existing stable tag.
- [ ] Keep production installation upgrades separate from source integration.

## Current basis

The existing merge audit originally compared the fork to upstream `v1.11.0`;
it now accepts an explicitly chosen stable upstream tag through the manual
workflow. No automatic upstream synchronization is enabled.

## Stable upstream v1.12.3/v1.12.4 review — pending in PR #241

The upstream changes are being integrated into OxygenGS on a separate, draft pull request. We preserve all existing fork behavior and do not deploy the integration automatically.

- **Security:** credential-preservation handling, linked-device owner approval, login limits, strict imported URLs and downloader arguments, slskd path containment, public share projections and Lidarr webhook repair.
- **Scanner:** include in-root symlinks with canonical-target deduplication. Upstream permits symlink targets outside the configured music folder; OxygenGS intentionally refuses these to preserve its stream/download containment invariant. No filesystem path outside the configured music root may be indexed or deleted through a link.
- **Playback:** handle disappearing files, avoid restore echo, update queue changes across devices, and clear removed audiobook IDs.
- **Fork invariants:** keep EN/NL translations, Settings Studio, branding, OpenSubsonic support, library performance enhancements, existing migration history and publication workflow. Do not reactivate removed integrations or change mount paths.
- **Discovery cleanup:** OxygenGS uses its own `routes/discover.ts` instead of upstream's `discoverClearing.ts`. Its cleanup now refuses symlinked paths outside the music root before claiming the album, calling Lidarr, or recursively removing directories. Existing ordinary album cleanup is covered by regression tests.
- **Release links:** OxygenGS renders in-app release notes with `WhatsNewWindow.tsx` rather than upstream's separate ReleaseLinks component; external HTTPS links now open in a separate safe tab.
- **Security E2E:** the pull request's normal Security Checks workflow only runs the dependency/secret scan. The full browser security tests need an explicit `[E2E]` PR prefix and new synchronized commit; they must run successfully before this port is merged.
- **Release status:** unpublished. The branch's standard source tests, native AIO build checks, database upgrade/restore and language checks passed on commit `da84fdff89e80429f8fa666a25a2216305949aec`. The explicit Security E2E test and all checks on the final commit still need verification. A separate exact-main native image preflight, residual vulnerability review and explicit stable release approval are required after source merge; no production deployment is implied.
