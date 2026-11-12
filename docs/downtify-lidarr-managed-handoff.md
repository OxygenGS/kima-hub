# Downtify → Lidarr: managed import and safety

**Available from Kima Hub v1.20.0.** A live pre-release single-track canary on 11 November 2026 confirmed the completed Lidarr command, registered TrackFile, exact source/final SHA-256, correct artist/album in both libraries and playback in both applications. CI separately tests the Kima-only option, fresh-install/upgrade paths and native images. Each installation must still verify its shared mounts, file permissions and database backup before enabling automatic importing.

The earlier RC6 Kima-only importer publishes under `Singles/Downtify/<Artist>/<Track>-<SpotifyId>.<ext>` and does not register recordings in Lidarr. v1.20.0 retains that non-Lidarr option without moving old files; the new Lidarr-managed option delegates the final path and library registration to Lidarr.

## Correct ownership and path model

- **Kima-only mode (Lidarr disabled/not selected).** Kima remains the
  library owner. Future album-aware naming should use verified audio
  album artist, album/release title, disc/track number and track title.
  If an album is missing or ambiguous, never invent a release title.
  The Kima-only mode must not require Lidarr at install or runtime.
- **Lidarr-managed mode (explicitly enabled).** Lidarr is the final
  library owner. Kima stages ONE fully verified original file in a
  configured shared completed-downloads directory **outside every Lidarr
  music/root folder**. Kima does not write audio directly into Lidarr's
  managed music-root tree. Depending on configured media-management naming,
  final tracks may appear at `<Artist>/<Track>` or
  `<Artist>/<Album>/<Track>`. Lidarr itself determines the final path
  and MusicBrainz registration through its import pipeline.
- **Two independent receipts.** Kima's existing `imported` status
  certifies a Kima Track, expected size and exact SHA-256. A separate
  Lidarr-managed status must certify a Lidarr TrackFile and matching
  physical file hash. Neither implies the other.

Lidarr upstream explicitly instructs import of third-party files from a
folder outside its managed root via Wanted → Manual Import, rather than
directly copying files into the root:
https://github.com/Servarr/Wiki/blob/master/lidarr/faq.md
The documented final layout is artist/release/track:
https://wiki.servarr.com/lidarr/quick-start-guide

## Optional portable Docker staging mount

The default published AIO `docker-compose.prod.yml` mounts only the
existing music root (`/music`) and persistent data (`/data`). It does
**not** mount Lidarr downloads or enable native Lidarr import. To use the
opt-in Lidarr-managed mode on a compatible v1.20.0 release, combine it with
`docker-compose.lidarr-handoff.yml`. The override adds exactly one
bind mount to `/downloads` in Kima; it changes neither `/music` nor
`/data`. It requires an explicit existing host path and refuses to create
a missing host directory.

~~~sh
# Configuration check only. No container starts and no files are imported.
MUSIC_PATH=/existing/test/music \
DOWNTIFY_LIDARR_STAGING_PATH=/existing/test/shared-downloads \
VERSION=v1.20.0 \
docker compose -f docker-compose.prod.yml \
  -f docker-compose.lidarr-handoff.yml config
~~~

In Kima Settings, the Storage download path must be `/downloads`.
Lidarr must separately mount **the same physical downloads directory**
with read access (its container path may differ). Configure Kima's Lidarr
handoff with that Lidarr-side downloads path and Lidarr's already
configured music root. The staging root must be outside all music roots.
A successful `docker compose config` confirms only Compose syntax and
bindings. Kima additionally compares the *actual directory identities*
(device/inode) of its music and staging roots, rejecting cases where
two different Docker paths alias the same host directory. This does not
detect every possible nested bind-mount alias; independent host mount
verification is still required. When Lidarr mode is selected, Kima now creates one random,
non-audio probe in the already-verified staging folder and asks Lidarr's
read-only `GET /api/v1/filesystem/type` whether that exact probe exists at
Lidarr's configured path. The file is removed, and any failed check or
cleanup blocks configuration. This detects missing/wrong shared mounts but
does **not** prove that storage survives detach/remount, that Lidarr can
read full music bytes, or that an actual Lidarr import succeeded.
Check those properties on the intended host before enabling automated importing. Do not repoint or move existing RC6 library files, and never change a production `/music` or `/data` mount as part of this opt-in setup.

## Metadata and path safety

1. Keep the existing owner-pinned Downtify server/account/job, unique
   Spotify track identity, audio container, full-byte SHA-256, decode and
   local tag verification before any handoff. In Lidarr mode require the
   actual audio file's album tag to match Downtify's pinned album title.
   Also require the actual track title and a complete credited artist
   to match Spotify even when the embedded ISRC is correct. This prevents
   Lidarr registering the track while Kima files it under unrelated
   metadata. Missing or contradictory tags block automatic handoff.
   Kima-only mode retains the prior verification policy. Downtify mobile library
   supplies track `title`, `artist`, `album`, optional album artist and
   other tagged fields; the separate Spotify embed confirms title,
   credits and duration but is NOT proof of an album or MusicBrainz release.
2. Read album artist, release name, release/disc track indexes and
   MusicBrainz IDs from verified audio tags when available. Do not infer
   an album from a standalone song title, `Singles`, or an artist name.
3. Compare Lidarr's API candidates to the complete verified identity.
   Require one unambiguous artist, album, release and track. Hold
   ambiguous, missing, contradictory or wrong-edition results for
   explicit in-app review; do not select the first match.
4. Do not add artists without explicit opt-in. If approved, resolve a
   unique MusicBrainz artist and add as unmonitored with
   `searchForMissingAlbums=false`. Do not alter existing profiles,
   monitored flags, download clients or default root folders.
5. Validate the chosen Lidarr root folder, shared-staging visibility and
   path translation in both Kima and Lidarr containers. Kima also rechecks
   its staging mount identity and pinned import target immediately before
   publication and after source verification; a changed/detached staging
   mount blocks publication. Never assume
   `/music`, `/downloads`, common UID/GID, write access, filesystem
   identity or a server-specific location. No endpoints accept an
   arbitrary user-supplied destination file path.

## Safe API handoff and reconciliation

1. A paired administrator explicitly enables **Lidarr-managed imports**
   only after a read-only preflight. Other Kima installs remain unaffected.
2. Kima creates a durable staging receipt under its own ownership.
   No source music is deleted, no destination file is overwritten and
   no root-owned directory permissions are broadened.
3. Kima requests Lidarr's read-only `GET /api/v1/manualimport` candidates
   from the explicitly verified shared staging location. It requires a
   unique exact artist, album release and track. The single advisory rejection
   `Has missing tracks` is allowed only for a verified individual recording;
   all other rejections and ambiguous matches are held for review.
4. Only after a unique, exact artist/release/track match may Kima submit
   the matching Lidarr-managed import command. Capture its durable ID.
   Never treat an HTTP 202 as proof of successful final import.
5. Poll Lidarr for its track-file receipt. A completed `ManualImport` command
   whose result later becomes `unknown` is not assumed successful: require
   the exact registered artist, album, track ID, TrackFile, size and physical
   SHA-256 before proceeding. Independently prove the final path, size and
   SHA-256. Trigger normal Kima scanner
   indexing of that final path and require its independent receipt before
   marking both sides imported.
6. An unacknowledged or failed submission, restart, queue outage, rejected
   import, wrong mount or failed scan stops writes and retains a durable
   receipt for safe reconciliation. Never silently replay a potentially
   published recording or run an unsafe SQL reset.

## Existing RC6 imports

Already-indexed native files must remain in their current locations.
They have immutable Kima ledger paths and hashes. A separate, opt-in
one-track migration can later validate the old source hash, copy or
hardlink an immutable staging candidate, verify Lidarr completion and
the final hash, and reconcile Kima's original Track reference before
considering deletion of any duplicate. No bulk or background migration;
never delete the only verified source. The existing 2026-11-09
`spotify_identity_unavailable` review row must remain quarantined
unless its pre-write safeguards are independently proven.

## Release acceptance

- Clean Kima install without Lidarr works with no Lidarr secrets.
- In a disposable Kima+Lidarr setup with independent Docker mounts,
  a new owner-bound test single arrives through Lidarr in either the
  configured `Artist/Track` or `Artist/Album/Track` layout, never by
  direct writes to the final root.
- The final Lidarr TrackFile, local SHA-256 and Kima scanner receipt
  agree, and the song is visible on the correct album/artist page and
  plays in both interfaces.
- An unknown album or conflicting pressing blocks automation with a
  clear reason and without guessed metadata.
- Crash, resumed job, unresponsive Lidarr, malformed remote tag,
  symlink, existing album filename and wrong disk never cause overwrite,
  double ingest, arbitrary artist addition or loss of media.
- EN/NL UI reflects separately imported-to-Kima and imported-to-Lidarr.
  The storage/restore test, CI, AIO AMD64/ARM64 smoke and native scans
  must pass before publishing any test RC; no stable promotion without
  an independent live end-to-end test.
