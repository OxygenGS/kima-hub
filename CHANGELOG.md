# Changelog — OxygenGS Kima Hub

## OxygenGS fork v1.22.0 — released 2026-11-13

Settings Studio replaces Kima's old sprawling Settings page with a focused, responsive configuration experience that matches the OxygenGS fork's dark theme and amber accent color.

### Redesigned settings
- Introduce a five-category overview with personal, appearance, downloads/services, music library and administration cards, plus a persistent searchable navigation sidebar on desktop.
- Provide responsive mobile category shortcuts and grouped section selection; remove a dead Integrations navigation target.
- Show one focused settings panel at a time while keeping all underlying forms mounted so unsaved state survives panel switching.
- Use consistent themed section cards, accessible inputs, toggles, selections and larger interactive targets, with mobile-width service connection fields.
- Preserve the existing Settings APIs, user/admin permissions, two-factor authentication, Lidarr, Soulseek, artwork management, user management and library maintenance.

### Verification and safe updates
- Settings UI PR #237 passed frontend and backend tests, English/Dutch browser checks, fork compatibility and security workflow checks.
- No new database migrations, media moves, deleted files, or automatic host changes.
- The [exact-main native AMD64/ARM64 preflight](https://github.com/OxygenGS/kima-hub/actions/runs/43379684353), [explicit security approval](https://github.com/OxygenGS/kima-hub/actions/runs/43391025604) and [stable multi-architecture publisher](https://github.com/OxygenGS/kima-hub/actions/runs/43391050043) all succeeded for v1.22.0. Residual HIGH/CRITICAL advisories remain in [image security](docs/image-security.md). Before upgrading an existing installation, independently verify a complete `/data` backup and preserve its `/music` mount and Compose identity.

## OxygenGS fork v1.21.0 — released 2026-11-12

This release retires the experimental Downtify integration after post-upgrade setup and storage verification proved unreliable across container identities. The application once again focuses on stable, independently configurable Kima, Lidarr and Soulseek workflows.

### Retired connector and native importer
- Remove the Downtify Settings panel, device pairing, remote job queue, submission controls, native importer worker, staging probe, dedicated API routes and obsolete adapter modules.
- Remove importer-specific Compose staging overrides and runtime bootstrapping without changing existing Docker bind mounts on any host.
- Keep the Download Manager for authenticated Kima jobs, including Soulseek and Lidarr history.

### Media and data continuity
- Do not delete, move or re-tag any previously indexed track. The normal music scanner continues to recognize existing library files.
- Preserve retired database tables, historical migration files and receipts to avoid destructive schema changes and to support updates from previously released versions.
- Preserve ordinary Lidarr, Soulseek, artwork and OpenSubsonic capabilities; externally deployed Downtify services must be managed independently.

### Verification and upgrade discipline
- Removal PR #234 passed source tests, frontend and backend typechecking, production non-root guards, AIO builds on AMD64 and ARM64, security checks and the disposable-database upgrade/restore rehearsal.
- [Native AMD64/ARM64 preflight](https://github.com/OxygenGS/kima-hub/actions/runs/43303576669), [security-reviewed approval](https://github.com/OxygenGS/kima-hub/actions/runs/43306060604), and [stable Docker publication](https://github.com/OxygenGS/kima-hub/actions/runs/43306092748) succeeded for v1.21.0. Residual HIGH/CRITICAL advisories remain in [image security](docs/image-security.md). Before any live upgrade, verify `/data` backup restoration and preserve the correct `/music` mount.

## OxygenGS fork v1.20.0 — released 2026-11-12

Kima Hub v1.20.0 introduces an optional first-party native Downtify single-track importer with separate Kima-only and Lidarr-managed library ownership. A real pre-release canary confirmed correct artist and album association, final physical file SHA-256, successful Kima indexing and playback in both Lidarr and Kima. This proves one end-to-end flow, not that every host mount or external service is configured correctly.

### Native Downtify automatic import
- Automatically discover only new, owner-bound completed single tracks after a safe activation baseline; keep historical downloads out of scope.
- Verify remote server/account, exact Spotify ID, original metadata/tags, full audio decode, size and SHA-256 before any publication. Never silently replay uncertain work.
- Provide an explicit administrator switch and meaningful English and Dutch import-status counters. Existing Kima-only behavior remains available without Lidarr.

### Optional Lidarr-managed handoff
- Stage approved originals in a separate shared downloads directory. Prove the real shared staging mapping and keep /music ownership under Lidarr.
- Preview one unique MusicBrainz artist, album, edition and track. Permit the advisory Has missing tracks rejection solely for a valid single-track import. Do not guess an artist, overwrite tracks or initiate a music search.
- Submit exactly one durable, non-replayed ManualImport copy command. Lidarr alone determines final filename and folders, whether Artist/Track or Artist/Album/Track.
- Confirm the registered Lidarr TrackFile, exact identity, duration, size and complete final SHA-256 before requesting Kima's independent scanner receipt. A completed command with result unknown is accepted only after these full file checks.

### Storage safety and compatibility
- Only fully verified Lidarr staging files become readable across container users; verification-stage temporary audio stays private.
- Keep strict no-overwrite, non-symlink, disjoint mount and on-volume identity checks. An outage, ambiguous match or uncertain remote POST does not cause a blind retry.
- Preserve previously imported Kima recordings and ledger state. No existing files are bulk moved, retagged or deleted. Artist creation requires explicit opt-in and remains unmonitored without automatic search.

### Upgrades and release validation
- Add forward-only PostgreSQL migrations for native-import discovery and optional Lidarr handoff, without altering existing /music or /data mounts.
- Upgrade only after a full independent /data backup and verified restore. A Docker-image downgrade cannot reverse schema migrations.
- Validate source CI, old-database upgrade/restore, EN/NL UI, native AMD64 and ARM64 image builds, vulnerability/secret scans and an exact-main native preflight before stable publication. The tested pre-release canary does not replace host-specific installation checks; no :latest alias or running host is modified by the source release.

## OxygenGS fork v1.19.0 — released 2026-11-07

Published [v1.19.0](https://github.com/OxygenGS/kima-hub/releases/tag/v1.19.0) adds administrator-managed Downtify integration settings to the OxygenGS fork. Existing music imports, DAS mounts and external Importer v5 remain unchanged. Publishing a new image does not automatically upgrade any installation.

### Downtify pairing and configuration
- PR #210: add Settings > Integrations > Downtify for administrators, with connection testing and explicit account pairing using a device token. Preserve English and Dutch user-facing copy.
- Verify the public Downtify API v1 identity before sending a token, pin the remote server and numeric user identity, and store the device token encrypted at rest using Kima's existing settings encryption key. Redact secrets, private identifiers and upstream error payloads from all admin API responses.
- Add four independent, default-OFF controls: owner-scoped queue viewing, saving Spotify track requests, confirmed manual single-track dispatch and manual remote-job reconciliation. Each re-pair resets every switch to OFF.

### Existing Docker and music importer boundaries
- Existing Docker-managed Downtify connections or tokens take priority until explicitly migrated; new DB configuration is projected only per request and never rewrites process.env, Compose files or mounts.
- Source, staging-file, full-audio, metadata and import verification switches remain OFF in DB mode. A separately reviewed read-only staging mount and safe single-writer handoff are required before enabling those stages.
- No automatic track retry, album or playlist dispatch, file move, copy, delete, retag, SSD-to-DAS transfer, Kima scanner receipt or Importer v5 takeover is introduced.

### Data safety and release gate
- Add one forward-only, default-OFF DowntifyIntegration PostgreSQL migration. Before any production upgrade, back up all persistent /data and independently verify a restore; image downgrade alone is not a database rollback.
- PR security, database upgrade/restore, EN/NL browser tests and full-stack AIO checks passed. Exact-source native [AMD64/ARM64 preflight](https://github.com/OxygenGS/kima-hub/actions/runs/42394711879), [stable approval](https://github.com/OxygenGS/kima-hub/actions/runs/42397547487) and [Docker publication](https://github.com/OxygenGS/kima-hub/actions/runs/42397561696) completed successfully. Residual image advisories remain documented in [image security](docs/image-security.md).
- The published image is `ghcr.io/oxygengs/kima-hub:v1.19.0` for AMD64 and ARM64. It does **not** change a running Proxmox installation or Importer v5. Keep a tested complete `/data` backup and independent rollback procedure before deployment.

## OxygenGS fork v1.18.0 — released 2026-11-06

Kima Hub v1.18.0 delivers the **first guarded stage** of the Unified Download Manager. The new `/downloads` screen combines a read-only Kima download overview with a user-owned Spotify link/request flow and selectively enabled Downtify checks. Existing Soulseek and Lidarr behavior stays intact. This is **not** the promised autonomous Downtify-to-DAS importer: Importer v5 remains the independent live importer.

### Download Manager and safe Spotify intake
- PRs #190–#194: introduce an optional, default-OFF Downtify connection probe, owner-scoped read-only download overview, remote queue ownership checks and an English/Dutch Download Manager screen.
- PRs #195–#197: validate canonical Spotify track links, persist each authorized user's requests idempotently and show their saved track requests without exposing other accounts.
- PR #199: add **explicit, single-track-only** Downtify submission, guarded by owner-pinned server/account identity, current download permission, duplicate-library checks and a separate default-OFF dispatch gate. Uncertain outcomes remain `dispatch_unknown` and are **never automatically resubmitted**. Albums/playlists, arbitrary Downtify accounts and automatic downloads remain unsupported.
- D3–D5 (PRs #200–#202): confirm unique completed remote queue jobs, assess the staging/music filesystem topology and observe a nonempty staged source file without copying or modifying it.
- D6–D8 (PRs #203–#205): optionally examine the bounded audio container header, read and decode an entire audio stream while calculating an internal SHA-256, and compare untrusted embedded ISRC/duration with the requested Spotify track. Matching metadata is **not** a proof of recording identity, intact transfer or successful library import.
- PR #206 (D9): add one explicit **Verify completed download** action that walks through the five read-only checks in order and stops on any incomplete, inconsistent or unavailable result. The original diagnostic actions remain available. These stages require separately enabled operator flags and a supported, pinned Downtify installation; the staging mount must be provisioned read-only.

### Reliability and data protection
- PR #207: make Docker's download of the official PostgreSQL signing key resilient to truncated HTTP/2 responses using HTTP/1.1, bounded retries and validation before GPG import.
- Add **two forward-only, additive PostgreSQL migrations** for `SpotifyDownloadIntent` and dispatch claim metadata. Existing music files, `DownloadJob`, `Track`, scanner tables and current Importer v5 jobs are not migrated or moved.
- Keep EN/NL translations, stored Kima account permissions, per-user isolation, session-change guards, modern Symfonium/Feishin authentication and the upstream refinements already released in v1.17.1.
- No new required integration, enabled download engine, automatic retry, audio copy/move/delete, retag, Kima library re-indexing, Importer v5 service/timer shutdown or Proxmox/DAS reconfiguration is part of this version.

### Upgrade and release boundaries
- **Before an upgrade:** back up the **entire persistent `/data` volume**, verify an independent restore, retain the exact original Compose/Dockge project, configuration and music mounts, and ensure enough space for the new database tables. A version rollback **without a pre-upgrade `/data` restore is not safe** after these migrations.
- v1.18.0 was published after exact-source [native preflight](https://github.com/OxygenGS/kima-hub/actions/runs/42180411701), security review and [stable Docker publication](https://github.com/OxygenGS/kima-hub/actions/runs/42182749230). That publication did not deploy to any running installation.
- A later, independently reviewed importer phase must establish verified physical mount identity, an immutable source-to-destination file handoff, copy checksums, duplicate/collision prevention, a Kima index/playback receipt, exclusive writer ownership and tested rollback **before** changing Importer v5.

- **Release record:** The [v1.18.0 GitHub Release](https://github.com/OxygenGS/kima-hub/releases/tag/v1.18.0) contains the original versioned notes; these historical migration and security requirements remain applicable to upgrades from older images.


## OxygenGS fork v1.17.1 — released 2026-11-04

Kima Hub v1.17.1 selectively integrates nine independently tested reliability, UI and accessibility backports from official upstream Kima v1.12.2, while preserving OxygenGS Library Intelligence and modern native-client authentication.

### Faster and more reliable operation
- PR #180: replace the frontend-only AIO health check with the complete web, backend, PostgreSQL, Redis and optional analyzer readiness probe; allow 300 seconds for cold startup.
- PR #182: display each Home shelf as soon as its own query completes without leaking data across account changes.
- PR #181: make Stats figures fit their real container width with both sidebars open.

### Artwork and navigation
- PR #183: use browser-selected responsive variants for authenticated library cover art, respecting the existing 2048px resize cap and protected cache behavior.
- PR #185: draw distinct mix/playlist covers as adaptive one-, two-, three- or four-tile mosaics; remove broken images and reflow the remaining tiles.
- PR #186: raise only the authenticated artwork rate budget from 500 to 3000 requests per IP per minute; keep every other API, login and webhook limit unchanged.
- PR #184: expose the existing Release Radar in the desktop and mobile navigation without changing its API or download permissions.

### Interface and accessibility
- PR #187: match native browser controls, text selection, typing caret and Firefox scrollbars to the dark theme.
- PR #188: label desktop/mobile player landmarks as Now Playing while retaining the separate Playback controls group and established player behaviors.

### Upgrade and security safeguards
- No new PostgreSQL migration, music file move, new dependency, native-client authentication change, new LAION-CLAP music model or automatic re-enrichment is included. The existing v1.17.0 library database migration still requires careful backup and compatible rollback planning.
- Independently back up the entire persistent /data volume and verify a restore before upgrading. Preserve existing /music mounts, collection permissions and the dedicated Soulseek import folder.
- The v1.17.1 source was approved and published after native AMD64/ARM64 preflight #41838331069, documented residual-vulnerability review, stable-release gate #41841115999 and native Docker image publication #41841145420. The existing known image advisories remain documented in docs/image-security.md. Live installations must still be backed up and upgraded separately.

## OxygenGS fork v1.17.0 — released 2026-11-04

Kima Hub v1.17.0 introduces Library Intelligence and the privacy and Soulseek fixes merged from PRs #175 and #176.

### Library Doctor and Smart Download Inbox
- Add an on-demand administrator library report from indexed metadata: missing or corrupt tracks, absent album covers and artist images, and suspected import problems.
- Show the administrator's 25 newest own manual Soulseek jobs, separating transfer completion from exact-path library indexing, and mark legacy jobs without a file path as unverified.
- Keep report queries bounded and user-scoped; do not automatically rescan or retag files.

### Safe review and reversible album corrections
- Preview existing artist and album candidates from conservative identity, folder, title and duration evidence; reject ambiguity and conflicting artist metadata.
- Require separate confirmation before writing; perform complete caller, track, destination and file-version checks inside a serializable transaction.
- Store a SmartImportRepair audit entry, use a migration-backed scanner override guard and update both affected artists' counts in the same transaction.
- Allow explicit undo only while the previous and current album records still match; never move, rewrite or delete audio files.

### Privacy and playback reliability
- Integrate PR #175 account isolation, protected artwork access, SSE reconnection and duplicate-Soulseek interaction guards.
- Integrate PR #176 precise single-track availability on MusicBrainz artist and album pages; playable rows use real local IDs and missing tracks remain previews.
- Preserve modern OpenSubsonic/Symfonium/Feishin authentication without legacy compatibility settings.

### Migration and deployment safeguards
- This release introduces a PostgreSQL migration and a manual album override trigger. Back up the entire persistent /data volume and independently verify restore before upgrading; keep /music mount points and ownership unchanged.
- A tag downgrade alone does not reverse migrated data; rollback requires a tested pre-upgrade backup when necessary.
- Upstream Kima v1.12 audio-model replacement and background re-enrichment are not included.
- This version was published after native AMD64/ARM64 preflight and separate stable-release approval. The previously reviewed residual image advisories remain documented in docs/image-security.md.

## OxygenGS fork v1.16.2 — released 2026-10-31

Kima Hub v1.16.2 restores accurate per-track availability for Soulseek singles on artist and MusicBrainz album pages after the published v1.16.1 download-permission hotfix.

### Show locally downloaded singles within artist albums (PR #173)
- Match cached and freshly fetched MusicBrainz release tracklists with verified local, non-missing, non-corrupt files from the same identified artist. Prefer recording MBIDs; otherwise use conservative title, version, artist and duration matching.
- Recognize unambiguous numbered or artist-prefixed filenames from the dedicated `Singles/Kima Downloads` import folder without weakening matching for unrelated library tracks.
- Display each matched row as available, with its real local track and album IDs, without falsely marking an incomplete release as fully owned. Keep remaining catalog entries as previews and preserve the option to request the full album.
- Play, shuffle, queue and add to playlists only verified locally available tracks; preserve correct local album identity for playback.
- Classify future manual Soulseek imports as library music and refresh relevant album/artist/library views after a successful scan. Older indexed imports can be recognized without a file move or database backfill.

### Verification and upgrade safeguards
- Includes backend catalog matching, cached-release and scanner regression coverage plus frontend mixed-availability tests. PR #173 passed backend/frontend tests, typechecks, security/privacy guards, AIO smoke and native no-push builds.
- No schema migration, music file movement or retagging, new download permission, Soulseek transport change, authentication change or artwork recovery change.
- Back up persistent `/data` and independently verify restore before upgrading; keep the existing `/music` mount and dedicated Soulseek import folder permissions unchanged.
- The v1.16.2 stable image was published on 2026-10-31; native image checks and any subsequent upgrades are governed by the documented release safeguards.

## OxygenGS fork v1.16.1 — released 2026-10-30

Kima Hub v1.16.1 is a focused Soulseek download permission hotfix for the published v1.16.0 Artwork Recovery release.

### Fix Soulseek downloads on non-root all-in-one installations (PR #171)
- Fix manual Soulseek P2P and automatic fallback downloads failing with "Cannot create destination directory: EACCES: permission denied" when the backend cannot create directories under /music.
- Store all new Soulseek downloads under /music/Singles/Kima Downloads/<artist>/<album>/<filename> so existing library folders remain unchanged.
- During AIO bootstrap, provision only the dedicated import leaf for the unprivileged backend user. Never recursively chown or chmod a mounted music collection and never take ownership of an existing foreign-owned import directory.
- Preserve user-level download permissions and use a containment-checked, sanitized P2P destination path.
- Explain restricted or read-only host mounts clearly; a host may still require narrow write access to the import folder.

### Verification and compatibility
- Added backend path/route regression tests and Python non-root permissions tests; the full AIO install smoke verifies write access inside the dedicated folder while rejecting write access to the /music root.
- No database migration, playback change, authentication change or data migration. Previous downloads and artist folders are not moved. Artwork Recovery, Symfonium and Feishin are unchanged.
- Back up the persistent /data volume and independently verify the restore before any upgrade. Only update to a published stable tag, not a release candidate.
- Release requires exact-commit tests, native AMD64/ARM64 preflight and residual vulnerability review before protected Docker publication. No-pass CI status or scanner result establishes zero vulnerability risk.

## OxygenGS fork v1.16.0 — released 2026-10-30

Kima Hub v1.16.0 adds bounded artwork recovery for already-indexed libraries after v1.15.0. The release improves missing image coverage without deleting music, replacing manually selected artwork or requiring a full library rescan.

### Local album artwork (PR #165)
- Preserve the existing cached/embedded priority, then look for cover, folder, front or album image files beside music tracks, including case-insensitive JPEG, PNG and WebP filenames.
- Decode and normalize recovered folder images into real JPEG cache entries. Reject invalid sizes, unreadable media and symlink candidates.
- Continue to the existing ordered external artwork sources when local artwork cannot be recovered.

### Repair album covers for existing library entries (PR #166)
- Admin-only Settings > Artwork control for at most 200 candidate albums per round, with observable progress and a continuation option.
- Repair null/empty album artwork and stale native cache references without rescanning unchanged music or rewriting track tags.
- Preserve existing good images, external URLs and user overrides; use conditional database updates to protect concurrent changes.
- Prefer embedded/local cover files, then the existing Deezer, Cover Art Archive and Fanart.tv provider chain, with paced requests.

### Repair artist images for existing library entries (PR #167)
- Admin-only Settings > Artwork control for at most 100 candidate artists per round, with local/online/skipped/failed counts.
- Search for artist-named image files and accept folder images only in a directory matching the artist name, avoiding accidental use of album covers as artist portraits.
- Validate physical music-root containment; normalize local portraits to actual JPEG; fall back to existing Fanart.tv and Deezer providers.
- Preserve good, manually selected and externally stored images; refresh artist-image cache after successful conditional database writes.

### Compatibility, limitations, backups and security
- No v1.16.0 database schema migration, authentication change, audio engine replacement or change to working modern Symfonium and Feishin connections. Existing user data and media remain intact.
- Repairs require a manual admin action; a source may have no artwork and not every missing picture can be recovered. Progress and resume cursors are in-memory and reset when the API process restarts.
- Back up the complete persistent data volume before upgrading and verify an independent restore. Earlier releases such as v1.14.0 may include database migrations.
- **Release gate:** Candidate only. Require exact-commit CI, real AIO install/upgrade checks and AMD64/ARM64 native preflight; review residual image vulnerabilities and explicitly approve stable publication. Passing a fixable-security gate does not mean that native images are vulnerability-free.

## OxygenGS fork v1.15.0 — released 2026-10-30

A focused frontend-only update following v1.14.0: keep navigation responsive, make the selected search source trustworthy and give artist pages a visible section index. No measured production speed percentage is claimed.

### Loading and navigation (PR #158)
- Album, collection and search routes now show layout-stable placeholders that match the destination instead of an unrelated full-screen loader.
- Retain reduced-motion accessibility and existing translation behavior.

### Search results (PR #159)
- Restrict local artists, discovery matches and P2P tracks to the selected tab, avoiding unrelated top matches and empty track headings.
- Scope loading indicators and empty states to the current source; do not block completed Library or Discover views on P2P polling.
- Include accessible filter-selection state, Dutch artist labels and regression tests.

### Faster local-first artist pages (PR #160)
- Use intent-only prefetch of the existing database overview from library cards, local top matches and similar artists actually in the library.
- Keep local overview and full enrichment under separate cache keys; opening the artist still loads full details independently.
- Show a localized progress status while optional enrichment completes, with an explicit retry on failure that does not hide owned albums.
- Do not claim exact latency improvements without on-device measurements.

### Artist section jump links (PR #161)
- Add horizontally scrollable navigation to populated About, Popular, Discography, Available Albums and Fans Also Like sections.
- Preserve keyboard/TV access; handle single/EP-only artists without broken or duplicate anchors; hide the links when fewer than two sections exist.

### Compatibility and safe upgrades
- No new v1.15 database migration, API protocol, audio engine, authentication format or user-permission change; preserve existing modern Symfonium and Feishin support.
- If upgrading from before v1.14.0, the earlier PostgreSQL trigram/index migration can still apply. Back up the full persistent /data volume and verify independent restore before updating. Rollback after a migration requires the original pre-upgrade backup.
- Existing security advisories may remain; any native-image findings require explicit review before publishing stable artifacts.

- **Release verification:** Final PR #162 passed frontend/backend checks, real AIO browser/audio tests, database-upgrade/restore guards and native AMD64/ARM64 build checks. [Exact-main native preflight](https://github.com/OxygenGS/kima-hub/actions/runs/41025248575) verified commit `ababa1c1`; [explicit security-reviewed stable approval](https://github.com/OxygenGS/kima-hub/actions/runs/41026923680) and [Docker publication](https://github.com/OxygenGS/kima-hub/actions/runs/41026945547) succeeded, producing a verified multi-architecture OCI index and the [official v1.15.0 GitHub Release](https://github.com/OxygenGS/kima-hub/releases/tag/v1.15.0). The images still contain unpatched HIGH/CRITICAL advisories (preflight reported AMD64: 270 HIGH / 8 CRITICAL; ARM64: 269 HIGH / 8 CRITICAL). Passing the fixable-advisory gate does not imply zero security risk; refer to [image security guidance](docs/image-security.md) and the native preflight evidence.

## OxygenGS fork v1.14.0 — released 2026-10-29

Performance and search improvements following the published v1.13.1 artist-loading update. This release improves two independent hot paths without replacing the v1.13 UI or audio engine.

### Artwork and responsiveness

- Native cached covers now use asynchronous canonical path checks, file reads and writes rather than synchronous filesystem calls in the request path.
- Deduplicate simultaneous requests for the same cold cover variant, bound different concurrent resize jobs and publish completed variants atomically.
- Preserve existing image-fallback behavior and path/symlink containment checks. No production latency percentage is claimed.

### Local music search

- Preserve accented and non-Latin music names in PostgreSQL full-text query terms; normalize combining marks in search cache keys.
- Rank exact titles and artist names before prefix and broader full-text matches in local search.
- Use pg_trgm similarity only after full-text and substring search return no results, with bounded query length and missing tracks excluded.
- Install the built-in PostgreSQL pg_trgm extension and three new GIN indexes (Artist.name, Album.title, Track.title). A large library may require temporary disk space and I/O during migration; no user music data is rewritten.

### Compatibility, backup and release checks

- Existing player, permissions, music analysis and modern Symfonium/Feishin authentication are retained. No dependency upgrade or audio-engine replacement.
- Review English/Dutch in-app release notes and real native application/upgrade tests. Do not claim unmeasured speedups or vulnerability-free images.
- Back up the complete persistent /data volume before upgrading; independent pre-upgrade backup is required for rollback after database migration.

- **Release verification:** Final-head PR checks, real AIO browser/audio and database upgrade/restore gates passed. Native AMD64/ARM64 preflight [40900664321](https://github.com/OxygenGS/kima-hub/actions/runs/40900664321) verified main commit `e37eb740`; explicit stable approval [40935953707](https://github.com/OxygenGS/kima-hub/actions/runs/40935953707) and Docker publication [40935980117](https://github.com/OxygenGS/kima-hub/actions/runs/40935980117) succeeded, including the multi-architecture manifest and [GitHub Release](https://github.com/OxygenGS/kima-hub/releases/tag/v1.14.0). Residual image security advisories remain and a passing scan is not a guarantee of zero vulnerabilities.

## OxygenGS fork v1.13.1 — released 2026-10-29

Maintenance update following v1.13.0, focused on the first opening of local-library artists.

### Artist loading

- Render saved artist information and playable local albums from a database-only overview, independently of slow external discography, popularity and artwork providers.
- Continue loading the complete artist details separately; preserve discovery fallback, the existing full-detail cache and warm navigation.
- Keep the local snapshot available when the optional full-detail request fails. Keep partial and complete cache entries separate and refresh after completed downloads.
- Preserve Play All, Shuffle, album navigation, user permissions and modern native-client authentication. No database migration, dependency upgrade or audio-engine change.
- Include matching English and Dutch in-app release notes.

### Documentation and upgrade

- The repository front page now documents the published v1.13 interface with a new header and verified synthetic application screenshots. No private installation data is included.
- Back up the complete persistent `/data` volume before updating; use an independent pre-upgrade backup for rollback.
- External services can still be slow, and discovery-only artists still require them. No measured production-latency percentage is claimed. Existing image security advisories still require review.

- **Release verification:** The v1.13.1 GitHub Release and native Docker images were published after final-head CI, exact-main native preflight and explicit approval. Existing dependency advisories remain subject to review.

## OxygenGS fork v1.13.0 — released 2026-10-28

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

- **Release verification:** Full PR validation, real AIO browser/audio acceptance and independent upgrade/restore tests passed. Native preflight 40773886516 verified the exact main source; stable publisher 40776257407 completed on its retry. Existing dependency advisories remain documented; passing these checks is not a zero-risk guarantee.

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

## OxygenGS fork v1.11.7 — released 2026-10-25

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

## OxygenGS fork v1.11.6 — released 2026-10-24

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

## OxygenGS fork v1.11.3 — released 2026-10-20

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
