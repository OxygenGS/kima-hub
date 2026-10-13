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
- [x] Synthetic pre-fork database upgrade test: an untouched baseline schema
      (main at `1b390bc6`) was seeded with two accounts and representative
      settings, artist, album, track, playlist, history, likes and playback state.
      A `pg_dump -Fc` backup was restored to another PostgreSQL database;
      the fork's migrations preserved data and applied permission defaults.
      Admin-customized permissions and branding survived a second migration
      pass. The backup was also restored independently to the original schema.
      The **database upgrade job** passed in GitHub Actions run 38313457995.
- [x] All-in-one legacy `/data` upgrade smoke passed on commit
      `8551f0d45f0498aff1655bfdf8ae6a44b690025d` in GitHub Actions
      run 38355460274. A disposable PostgreSQL 16 legacy data directory was
      created with synthetic users/music using pre-fork migrations; the new
      AIO container mounted that SAME volume, ran migrations, preserved
      records, accepted branding customization and user permission changes,
      and retained the changes after container replacement. Persistent
      encryption/session secrets were present after the restart. The Docker
      image now includes the en_US.UTF-8 locale required by this old volume.
- [x] Production CT 101 unchanged.

## Release blockers / approvals required

- [x] **Delivery architecture selected: all-in-one (option A).** The
      existing root `Dockerfile` combines frontend, backend, PostgreSQL,
      Redis and audio analyzers; the four-container CT 105 stack remains the
      known-good development baseline.
- [x] **Verify all-in-one runtime in disposable CI environment.** GitHub
      Actions run 38311997469 (commit `7daad0db`) passed all five jobs,
      including building/loading the root Dockerfile and booting the resulting
      image on a hosted runner with isolated volumes. The smoke test checks
      container health, frontend onboarding, public default branding, the
      user-permission fields, branding table and unauthenticated branding write
      denial. This is NOT a substitute for end-to-end UI, playback or upgrade
      testing.
- [ ] **Manual all-in-one smoke on dedicated hardware, if available later.**
      `docker-compose.chillverse-aio-test.yml` uses loopback-only port 3130
      and separate volumes. Do not start it on CT 105 or load atlas with a
      large image without a separate resource assessment.
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
- [x] **Automated fresh-install smoke** passed in disposable GitHub Actions
      runner 38311997469, including new database schema, branding defaults
      and frontend onboarding endpoint.
- [ ] **Complete fresh-install interactive E2E** (admin onboarding/login,
      saving a custom brand, switching accounts and restarting the AIO image)
      remains to be tested on a disposable instance.
- [x] **Automated upgrade of a disposable pre-fork database** including
      legacy-schema migration history, synthetic user/music/settings fixtures,
      custom-format backup/restore, two successive migration deploys,
      preserved original data, explicit fail-closed permission defaults,
      saved post-upgrade branding/permissions, and backup recovery.
      Implemented by `db-upgrade` in `.github/workflows/pr-checks.yml` and
      SQL checks in `.github/ci/`.
- [x] **AIO startup with pre-fork PostgreSQL `/data` volume** tested
      successfully in run 38355460274. An old Postgres data directory
      (from pgvector/pgvector:pg16, **not** from an old upstream AIO image)
      was attached to the newly built AIO container. The tested migration,
      fresh startup, removal/recreation of the container, app branding API,
      and preserved account/library/branding/permission data passed.
- [ ] **Full old-image-to-new-image and operational rollback rehearsal.**
      The CI test did NOT start an older monolithic Kima image, copy its
      original full `/data` layout and secrets, or exercise reverting the
      image against an independently restored OLD `/data` snapshot.
      Complete such a rehearsal before approving a real production migration.
      Never assume an older image can boot a newly migrated database.
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
