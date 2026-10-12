# Chillverse Listen — release readiness (development)

This checklist tracks the fork in `feature/user-permissions` and its draft PR #1.
It does **not** authorize a production deployment, merge, publication or
database migration outside the isolated CT 105 test environment.

## Verified so far

- [x] GitHub checks green for application commit `0a892cbcfa73b32ee2abe73e4bab421e24adabf7`.
- [x] Clean checkout of that commit on CT 105.
- [x] Isolated four-service DEV stack (frontend/backend/PostgreSQL/Redis) healthy.
- [x] Admin and regular-user visibility tested, including default-denied album
      requests and track downloads; earlier API permission denial tests passed.
- [x] Per-installation name, tagline, accent, background, logo and favicon tested;
      values survive service restart without a new build.
- [x] Native select menus, brand focus indicators, mobile active navigation and
      background-contrast warning visually checked.
- [x] DEV Redis configured with `maxmemory-policy noeviction` and verified.
- [x] Production CT 101 unchanged.

## Release blockers / approvals required

- [x] **Delivery architecture selected: all-in-one (option A).** The
      existing root `Dockerfile` combines frontend, backend, PostgreSQL,
      Redis and audio analyzers; the four-container CT 105 stack remains the
      known-good development baseline.
- [ ] **Verify all-in-one runtime separately.** The normal PR checks build the
      root image but do not boot it. An isolated `docker-compose.chillverse-aio-test.yml`
      now provides a loopback-only port 3130 and separate named volumes for a
      future fresh-install smoke test. Check CT 105 memory and free Docker disk
      space *before* building; ML dependencies make this image substantial.
      Do not take down or reconfigure the existing DEV stack.
- [ ] **Confirm image ownership and release destination.** The existing publish
      workflow pushes `.../kima:latest` and versioned tags to Docker Hub and
      GHCR. `docker-compose.prod.yml` defaults to the original upstream
      Docker Hub image. Do not tag a release or dispatch image publishing
      until destinations, repository ownership, image naming and credentials
      are reviewed; avoid changing upstream images by mistake.
- [ ] **Decide existing-user permission migration behavior.** Migration
      `20261012000000_add_music_permissions` sets both permissions to
      `false` for existing non-admin users. This intentionally fails closed
      but changes former download abilities. Communicate it and provide
      admin review before any production migration.
- [ ] **Test a fresh installation** on an isolated new environment, with no
      inherited data or secret configuration, including onboarding and branding.
- [ ] **Test upgrading a disposable copy of an existing database**, including
      backup, migrations, user rights, metadata, branding and rollback plan.
- [ ] **Test representative audio playback and its controls.** CT 105 currently
      has an empty music library, so media playback remains unverified.
- [ ] **Security review:** verify admin-only branding mutations, permissions
      on all acquisition endpoints and background jobs, credential handling,
      exposed network ports and release-image dependencies.
- [ ] **Review CI scope:** passing unit/lint/typecheck/Docker checks do not
      substitute for a production-image smoke test and real-browser E2E runs.
- [ ] **Documentation:** publish instructions for image/stack installation,
      environment variables (without secrets), volume backup, upgrade path,
      default permissions, branding and known limitations.
- [ ] **Release naming/versioning:** fork-specific image/repository identifiers;
      license/attribution; clear changelog and pre-release version.
- [ ] **Human sign-off** before removing draft status, merging to main, creating
      version tags, pushing container images or touching CT 101.

## Release order

1. Architecture chosen: all-in-one. Confirm release registry/name and
   hardware requirements before building a local candidate.
2. Finish testing missing scenarios on isolated environments.
3. Verify backup and rollback instructions; review upgrade default permissions.
4. Release a **candidate** under a distinct fork-owned name/tag.
5. Test the published candidate image from scratch and with migrated data.
6. Only then decide separately whether to publish a stable release or
   schedule any production migration.

## Operational safeguards

- Never commit `.env.chillverse-dev` or real integration secrets.
- Never mount production music, databases or downloads into CT 105.
- Keep `main`, release tags, publisher workflows and CT 101 unchanged
  until explicitly approved.
