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
