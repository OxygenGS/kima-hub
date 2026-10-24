# Changelog — OxygenGS Kima Hub

This file tracks changes to the [OxygenGS fork](https://github.com/OxygenGS/kima-hub), not the full history of the original Kima Hub. For previous releases and all original contributors, read [upstream's changelog](https://github.com/Chevron7Locked/kima-hub/blob/v1.11.0/CHANGELOG.md). Older fork development notes remain accessible through Git history.

## OxygenGS fork v1.11.5 — release preparation (unpublished)

Security follow-up for v1.11.4 (release image publication blocked by Trivy):
- Update backend multer and Zod to fixed major-compatible dependencies; regenerate pinned lockfiles and resolve both Express 4 and 5 body-parser trees to patched versions.
- Retain strict HIGH/CRITICAL image vulnerability gates without allowlisting or weakening scans.
- Validate backend schema compatibility, tests, AMD64/ARM64 AIO images, permissions, and EN/NL UI before publishing.
- Supersedes the failed v1.11.4 Docker image publication; does not change database migrations, volumes, or user data.

## OxygenGS fork v1.11.4 — release preparation (unpublished)

Patch release based on v1.11.3 with the consolidated Dutch interface work from merged PRs #81–#86:
- Complete the typed EN/NL catalog and localize the home, search, library, artist, album, playlist, metadata editor and error interfaces.
- Localize notifications, activity timestamps, import progress, preview errors, download failures, podcast/audiobook actions and accessibility tooltips.
- Localize Stats charts, month labels and playback counts, retaining English behavior and preserving third-party music metadata.
- Expand unit and public browser language-switching regressions; preserve user permissions and existing data formats.
- No new database migrations or persistent-volume changes in this patch.

## OxygenGS fork v1.11.3 — release preparation (unpublished)

Patch release for v1.11.2:
- Hide Browse → Playlists import-by-URL controls and modal when album-request or track-download permission is missing, matching the server-side import policy.
- Reuse the same two-permission predicate across Browse, playlist details, and playlist imports, and add regression coverage for every permission combination.
- Clearly label album acquisition actions as “Request album(s)” instead of “Download”; leave Soulseek individual track downloads controlled exclusively by the track-download right.
- Add English/Dutch labels for album requests and permission-aware UI tests.
- No new database migrations or persistent-volume changes.

## OxygenGS fork v1.11.2 — released 2026-10-20

Patch release for v1.11.1:
- Enforced album-request and track-download permissions consistently across playlist import flows, including the M3U API path.
- Hid or gated unauthorized acquisition actions in album and artist views, Release Radar, Soulseek single-track and bulk results, and external playlist imports.
- Removed the language selector from the login screen, retaining language changes in authenticated Settings.
- Added EN/NL permission feedback and regression tests for denied playlist import requests.
- No new database migrations or persistent-volume changes; administrators and existing listener data remain unchanged.

## OxygenGS fork v1.11.1 — released 2026-10-19

Patch release for v1.11.0:
- Restored administrator controls to grant and revoke album requests and individual track downloads for standard users.
- Display the configured installation logo in the top navigation instead of always displaying the built-in waveform.
- No changes to existing database migrations or persistent volumes.

## OxygenGS fork v1.11.0 — released 2026-10-19

The first combined OxygenGS release based on official upstream [Kima Hub v1.11.0](https://github.com/Chevron7Locked/kima-hub/releases/tag/v1.11.0).

### Features
- Integrated upstream v1.11 features such as **Stats**, **Discover Weekly**, **Vibe Map**, audio analysis, library and playback updates.
- Added **English / Dutch interface selection**, from onboarding and login to Settings and supported signed-in screens. The preference is browser-local.
- Preserved **OxygenGS branding** and per-installation branding settings.
- Preserved per-user **album request** and **track download** permissions, enforced by the backend.

### Security and reliability
- Isolated service environments, persistent database credentials and server-side permission verification.
- Dedicated unprivileged backend and analyzer processes; native AMD64 and ARM64 smoke tests confirmed process and secret boundaries.
- Pinned model, dependency and audio-processing components, strengthened waveform/transcoding resource limits and improved attribution for redistributed model files.
- Full source/native builds, migration/rollback rehearsals and English/Dutch browser tests passed on the combined source; [end-to-end browser tests](https://github.com/OxygenGS/kima-hub/actions/runs/39301901157) passed.
- **Known risk:** Debian package scanner reports still include 8 CRITICAL and 295/294 HIGH findings (AMD64/ARM64) with no listed fixed versions. This is not a clean-security certificate; see [current image risk notes](docs/image-security.md).

### Updating
This release may run database migrations. Back up the complete original `/data` volume and restore it to a separate volume for any rollback. See [safe AIO updates](docs/safe-aio-updates.md).

[GitHub v1.11.0 release](https://github.com/OxygenGS/kima-hub/releases/tag/v1.11.0) · [upstream v1.11.0](https://github.com/Chevron7Locked/kima-hub/releases/tag/v1.11.0)

## OxygenGS fork v1.10.0 — 2026-10-13

Initial OxygenGS fork release, retaining upstream v1.10 functionality with additional branding, user permissions, security hardening and fork-specific publishing. Its [versioned image](https://github.com/OxygenGS/kima-hub/releases/tag/v1.10.0) remains available for installations whose data has **not** been migrated by v1.11.

## Earlier Kima Hub releases

The full pre-fork version history, original attributions and historical fixes are maintained by [Chevron7Locked](https://github.com/Chevron7Locked/kima-hub/blob/v1.11.0/CHANGELOG.md). The complete original changelog is also present in this repository's earlier Git commits and v1.10.0 tag. The original license remains [GPLv3](LICENSE).
