# Changelog — OxygenGS Kima Hub

## OxygenGS fork v1.13.0 — release preparation (unpublished)

A visible interface refresh across the home screen, desktop navigation, music detail pages, playback surfaces and queue. The public application name remains Kima Hub — Oxygen's Fork.

### Interface

- New home presentation using existing collection artwork, grouped icon navigation and consistent media cards. No invented listening counters or extra recommendation endpoints.
- Larger artist/album artwork, wrapping titles, collection breadcrumbs, labelled actions and matching loading placeholders.
- Redesigned desktop player dock, mobile mini player and full-screen listening view; existing seek, lyrics, sleep timer, Vibe and media controls retained.
- Responsive queue with a selected-track panel, upcoming/history sections, persistent edit controls and explicit clear confirmation.
- English/Dutch copy, visible keyboard focus, reduced-motion support and touch/landscape handling across the refreshed surfaces.

### Compatibility and upgrade

- No new database migration, audio engine, authentication protocol or media-processing dependency. Existing modern Symfonium/Feishin support and music permissions remain in place.
- Include these notes in the application's own release catalog in English and Dutch. No new consent choices or enrichment reset are introduced.
- Back up the complete persistent `/data` volume before updating. For rollback, restore an independent pre-upgrade backup rather than reusing a migrated database.
- Existing dependency security advisories remain subject to image scanning and review; this release does not claim zero vulnerabilities.

- **Release gate:** Candidate only. Require full repository CI, actual disposable AIO browser/audio acceptance, exact-source native AMD64/ARM64 preflight and explicit stable publication approval. No image or release is published by source preparation.

## OxygenGS fork v1.12.1 — released 2026-10-28

Maintenance patch for the already-published v1.12.0 release:

- Restore missing **in-app What's New** entries for Project Turbo + UI 2.0 (v1.12.0). The backend release catalog previously stopped at upstream v1.11.0, independently of GitHub Releases.
- Include an in-app entry for this patch, plus English and Dutch editorial copy. Existing release acknowledgement and consent behavior is preserved; no new choices or destructive actions.
- Refresh the fork README, release history and image-security documentation to reflect the published v1.12.0 release.
- No new database migration, music processing change, permissions change, or deployment change. The published immutable v1.12.0 Docker tag is not rebuilt or overwritten.
- **Release gate:** tests, native AMD64/ARM64 builds and scans, disposable AIO checks, and explicit stable release approval remain required before publishing v1.12.1.

## OxygenGS fork v1.12.0 — released 2026-10-28

**Project Turbo + UI 2.0:** performance, responsive polish and client security hardening since published v1.11.10.

- Avoid excessively large image-palette canvases, stabilize artist discography rendering and avoid invalid album gradient placeholders (PR #131).
- Reuse already loaded artist album tracks for Play All/Shuffle instead of re-requesting every album; overlap independent album-detail lookup work (PR #132).
- Make artist and album heroes more responsive on narrow screens, improve action touch/focus targets and reduce blurred album backdrop image work (PR #133).
- Preserve refreshed titles and album palette colors in memoized track rows; improve keyboard, mobile track controls and media-card focus (PR #134).
- Prefetch the next library page and alternate tabs only on hover/focus/touch intent; improve mobile library track controls (PR #135).
- Reuse cached/in-flight album detail data for discography navigation and playback. Defer uncached offscreen album cover lookups until near the viewport (PR #136).
- Patch CLAP analyzer Python msgpack CVE-2026-114613 in both standalone and AIO dependency paths: upgrade BullMQ and require msgpack 1.2.3; retain strict dependency and container vulnerability checks (PR #136).
- No *new* database migrations, API-key format changes or user permission changes from these Turbo/UI batches. The existing v1.11.9 Native Apps key encryption migration still applies when upgrading from older releases.

**Release verification:** The stable v1.12.0 GitHub Actions publisher completed after the native AMD64/ARM64 preflight, with automated tests and image security checks. Residual Debian dependency advisories remain documented in [image security](docs/image-security.md); no measured performance percentage is claimed. **Known documentation bug:** the shipped v1.12.0 image did not include this version in the in-app What's New catalog; the correction is prepared in v1.12.1.


## OxygenGS fork v1.11.10 — released 2026-10-27

- Normalize the quoted-empty `query=""` used by Symfonium native fast synchronization to the existing paginated empty-search3 library enumeration path (PR #127).
- Add regression coverage for 500-song sync batches at an offset of 500. Preserve ordinary non-empty searches, app-key authentication, and existing client compatibility.
- No new database migrations or installation-specific settings. Symfonium native sync without Compatibility Mode was confirmed after publishing.


## OxygenGS fork v1.11.9 — released 2026-10-27

Native Subsonic/OpenSubsonic interoperability for music clients:
- Support paginated empty-query `search3.view` for Symfonium library fast-sync, with stable artist/album/song ordering and bounded query sizes (PR #124).
- Include complete playable song metadata using the existing Subsonic mapper. Exclude DISCOVER-only albums and missing/corrupt tracks, and preserve the old `search.view` and `search2.view` behavior (PR #124).
- Accept standard Subsonic salted `t=/s=` token authentication with newly issued high-entropy Native Apps keys so Symfonium and Feishin can connect with Legacy Authentication disabled (PR #125).
- Continue storing SHA-256 key hashes for lookup, and store an authenticated-encrypted copy for salted-token verification. Preserve key revocation, 2FA restrictions and pre-upgrade key behavior.
- Add one optional `ApiKey.tokenSecretEncrypted` column through an additive Prisma migration. Existing keys still work with `p=` or `apiKey=` but **must be reissued** to use `t=/s=`; test the new key in each client before revoking the old one.
- Native salted-token sign-in was verified in Symfonium and Feishin. The remaining Symfonium fast-sync issue was fixed in v1.11.10. No installation-specific changes.

This file tracks changes to the [OxygenGS fork](https://github.com/OxygenGS/kima-hub), not the full history of the original Kima Hub. For previous releases and all original contributors, read [upstream's changelog](https://github.com/Chevron7Locked/kima-hub/blob/v1.11.0/CHANGELOG.md). Older fork development notes remain accessible through Git history.

## OxygenGS fork v1.11.8 — released 2026-10-26

Docker image size optimization work since v1.11.7:
- Read-only image size auditing and largest-layer ranking for AMD64 and ARM64 (PRs #111-112).
- Remove redundant Hugging Face offline model-cache duplication while retaining model checksums and offline verification (PR #113).
- Keep frontend development dependencies out of earlier final-image layers (PR #114).
- Consolidate backend npm installation, Prisma generation, build and pruning into one Docker layer (PR #115).
- Automatically compare native main builds to the v1.11.7 baseline (PR #116). Native uncompressed image measurements versus v1.11.7: AMD64 1.729 GiB to 1.650 GiB (81.0 MiB, 4.57% smaller); ARM64 4.102 GiB to 3.843 GiB (265.3 MiB, 6.32% smaller). These are local image sizes, not compressed registry download sizes.
- No database migrations, removed audio functionality, or production deployment changes.

## OxygenGS fork v1.11.7 — release preparation (unpublished)

Performance, accessibility and localization refinements following the v1.11.5 published baseline (v1.11.6 was a development version, not confirmed as published):
- Open artist pages faster when browsing the library: prefetch detail queries on card hover/focus and reuse the existing 10-minute React Query cache; only fall back to external discovery for genuine library 404 responses (PR #91).
- Fetch independent artist details (discography, popular tracks, hero artwork and similar artists) concurrently instead of one long sequential metadata waterfall, retaining existing API responses, permissions, media playback and provider fallbacks. Add concurrency regression coverage (PR #94).
- Replace artist-page full-screen loading with an accessible, motion-aware hero/tracks/albums skeleton and polish biography spacing, sort focus, request-album labels and keyboard controls (PRs #92, #94).
- Finish Dutch translations for empty library tracks and account settings heading (PRs #89, #90).
- Add a manual, read-only, upstream-tag-specific merge compatibility audit and documented human review process; no automatic upstream merges or publishing (PR #93).
- Polish album navigation with detail prefetching, accessible loading skeletons and translated empty states (PR #96).
- Improve library reliability and speed: refresh artist/album cards and track rows when metadata changes, reduce unnecessary track-row renders and strengthen keyboard focus (PRs #101-104).
- Refine queue/player accessibility, mobile actions, seek previews and reduced-motion behavior (PRs #97-100).
- Polish Discover Weekly mobile controls, localized match tiers and play/pause feedback with regression coverage (PRs #105-108).
- Avoid repeated artist album sorting on unrelated renders (PR #109).
- No database migrations, persistent-volume changes or installation-specific changes. Verify native AMD64/ARM64 image scans, full CI, and upgrade/rollback rehearsals before publishing.

## OxygenGS fork v1.11.6 — release preparation (unpublished)

Development version superseded by v1.11.7 release preparation; no separate stable v1.11.6 publication is claimed here.

## OxygenGS fork v1.11.5 — released 2026-10-24

Security follow-up for v1.11.4 (release image publication blocked by Trivy):
- Update backend multer and Zod to fixed major-compatible dependencies; regenerate pinned lockfiles and resolve both Express 4 and 5 body-parser trees to patched versions.
- Retain strict HIGH/CRITICAL image vulnerability gates without allowlisting or weakening scans.
- Validate backend schema compatibility, tests, AMD64/ARM64 AIO images, permissions, and EN/NL UI before publishing.
- Supersedes the failed v1.11.4 Docker image publication; does not change database migrations, volumes, or user data.

## OxygenGS fork v1.11.4 — released 2026-10-24

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
