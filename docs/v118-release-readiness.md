# Kima Hub v1.18.0 — published release record and upgrade readiness

**v1.18.0 was published on November 6, 2026.** The exact release source is
`26eaa57b0eb284590b6f7d24d7cd9a622c7bff07`.
[Native AMD64/ARM64 preflight](https://github.com/OxygenGS/kima-hub/actions/runs/42180411701),
[separate stable approval](https://github.com/OxygenGS/kima-hub/actions/runs/42182732220),
[successful Docker publication](https://github.com/OxygenGS/kima-hub/actions/runs/42182749230)
and the [GitHub Release](https://github.com/OxygenGS/kima-hub/releases/tag/v1.18.0)
are complete. This page preserves the release checks; **publication is not
permission to upgrade an existing installation without a separate full
`/data` backup and independent restore.** It is not an approval to disable
the external Importer v5.

## Functional scope

The release is the **first staged Unified Download Manager**, not a
complete autonomous download-to-DAS system. It provides a read-only merged
Kima download feed and EN/NL `/downloads` screen; safe Spotify link intake
and saved, owner-scoped track requests; strictly opt-in, exactly
user-bound Downtify single-track submission; and a one-click, fail-closed
sequence of five read-only checks (owned completed remote job, staged
regular file, audio container, full decode/hash, and untrusted ISRC/duration
consistency).

The following are **not yet available or authorized**: multi-user
Downtify pairing; unattended album/playlist downloads; file provenance
or exact recording authentication; automatic SSD→DAS imports; source
deletion; Kima catalog/playback import proof; any Importer v5 timer
shutdown or takeover. Matching ISRC or a computed SHA-256 *alone*
cannot authorize the move or import of a music file.

All new Downtify write/remote reconciliation/source/audio/metadata gates
remain **OFF by default** in the published container, and the staging
download root must be separately provisioned read-only when explicitly
testing file evidence. Do not add these switches to the regular user's
production Compose stack without a separate compatibility/security review
of the installed Downtify version and its account binding. Existing
Soulseek/Lidarr downloads remain unchanged.

## Database and backup boundary

Relative to v1.17.1, v1.18.0 adds **two additive Prisma migrations**:

- `20261104210000_spotify_download_intents` adds the
  `SpotifyDownloadIntent` table with per-user uniqueness and ownership.
- `20261104230000_downtify_track_dispatch_claim` adds a remote song ID,
  dispatch-start timestamp and status lookup index.

These migrations are **forward-only** and must be treated as persistent
database changes. A simple image downgrade is **not a rollback**. Rehearse
the update and restore on disposable, **separate copies** of the existing
`/data` volume before updating the live image. Back up and restore the
**entire** original `/data` volume, preserve secrets, check the original
Docker Compose/Dockge project name and verify the exact `/music` mount.
See [Safe AIO updates and rollback](safe-aio-updates.md).

Never delete an existing source music file as part of v1.18.0, and never
give the new diagnostic routes write access to the staging mount.

## Release checklist

- [x] Source PRs #190–#207 (applicable D1–D9 stages and Docker CI retry)
  are merged on `main`; no new Downtify import cutover was included.
- [x] Release-candidate source carries matching `1.18.0` in both
  `package.json` files and root records of both `package-lock.json` files.
- [x] Changelog has exactly one
  `## OxygenGS fork v1.18.0 — release preparation (unpublished)` heading
  suitable for generated release notes. The heading is retained as part of
  the historical tagged-source changelog, even though the release has now
  been published.
- [x] Release-candidate PR checks complete **on its final exact head**:
  backend, frontend, EN/NL, security, disposable Postgres/Redis,
  upgrades/restores, fresh-install smoke and no-push AMD64/ARM64 builds.
- [x] Merge the release-candidate PR into `main` **only after** every
  applicable required check passes and the source diff is reviewed.
- [x] On the merged `main` source, run
  [Native Release Preflight](https://github.com/OxygenGS/kima-hub/actions/workflows/v112-native-preflight.yml)
  with `version_tag=v1.18.0`. Both native architectures must build and
  pass fixable HIGH/CRITICAL and embedded-secret checks; retain scan
  reports for manual residual-risk review.
- [x] Record the exact source commit and actual Trivy results **from
  this v1.18.0 candidate**. Do not reuse v1.16.0 vulnerability counts
  from `docs/image-security.md` as if they are current.
- [ ] Independently validate complete `/data` backup/restore and
  rollback using a v1.17.1 installation, including the two new migrations.
  Preserve the original image tag and environment.
- [x] Obtain the repository's separate stable-release approval for the
  reviewed exact source SHA, image vulnerability residuals and release
  metadata; do not bypass protected release/tag conditions.
- [x] **Only after the approval:** deliberately create the immutable
  `v1.18.0` tag on that reviewed `main` commit via the protected
  stable-release workflow. That workflow dispatches
  [Build and Publish Docker Image](https://github.com/OxygenGS/kima-hub/actions/workflows/docker-publish.yml),
  which completed its own metadata checks, native images, vulnerability/secret
  scans, multiarchitecture assembly and GitHub release creation.
  Never invent or manually substitute a registry digest.
- [x] Confirm the exact `ghcr.io/oxygengs/kima-hub:v1.18.0` manifest
  exists for both `linux/amd64` and `linux/arm64`, capture its digest,
  and review the automatically generated release notes.
- [ ] **Only after publication:** update README and install instructions
  from the previously published stable v1.17.1 to v1.18.0. Plan any real
  production upgrade separately, using the verified backup/restore.

Publication is complete and the published `v1.18.0` tag remains pinned to
the verified release commit. Repository documentation updates after
publication do not change that immutable tag.

The upgrade/restore check remains **unchecked for any particular live
installation** until it has actually been performed on separate copies of
that installation's data. Merging a PR or publishing an image does **not**
deploy anything to the user's Proxmox or DAS.
