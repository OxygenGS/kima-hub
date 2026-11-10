# Downtify → Lidarr: managed import design and acceptance gates

**Status: implemented in draft PR #231, not released; full Lidarr/Kima
end-to-end acceptance still required.** Native Downtify RC6 already
imports directly into Kima and verifies its local scanner/physical SHA-256
receipt. It **does not** register any artist, album or track in Lidarr.
Current RC6 final paths are `Singles/Downtify/<Artist>/<Track>-<SpotifyId>.<ext>`
and its disk-proof marker lives in `Singles/Downtify`. The choice
isolated the first native importer from existing music, but cannot be
treated as the final Lidarr-managed layout.

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

## Optional portable Docker staging mount (draft-only)

The default published AIO `docker-compose.prod.yml` mounts only the
existing music root (`/music`) and persistent data (`/data`). It does
**not** mount Lidarr downloads or enable native Lidarr import. For a
**disposable pre-release test only**, combine the base example with
`docker-compose.lidarr-handoff.yml`. The opt-in override adds exactly one
bind mount to `/downloads` in Kima; it changes neither `/music` nor
`/data`. It requires an explicit existing host path and refuses to create
a missing host directory.

~~~sh
# Configuration check only. No container starts and no files are imported.
MUSIC_PATH=/existing/test/music \\
DOWNTIFY_LIDARR_STAGING_PATH=/existing/test/shared-downloads \\
VERSION=v1.19.0 \\
docker compose -f docker-compose.prod.yml \\
  -f docker-compose.lidarr-handoff.yml config
~~~

In Kima Settings, the Storage download path must be `/downloads`.
Lidarr must separately mount **the same physical downloads directory**
with read access (its container path may differ). Configure Kima's Lidarr
handoff with that Lidarr-side downloads path and Lidarr's already
configured music root. The staging root must be outside all music roots.
A successful `docker compose config` confirms only Compose syntax and
bindings; it is **not** evidence that both containers see the same bytes,
that storage survives detach/remount, or that a Lidarr import succeeded.
Verify those properties in an isolated integration test before enabling
the feature. Leave RC6/live libraries and their mounts untouched.

## Metadata and path safety

1. Keep the existing owner-pinned Downtify server/account/job, unique
   Spotify track identity, audio container, full-byte SHA-256, decode and
   local tag verification before any handoff. Downtify mobile library
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
   path translation in both Kima and Lidarr containers. Never assume
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
   from the explicitly verified shared staging location. Lidarr's upstream
   API controller supports a folder, optional artist ID and exclusion of
   existing files. Reject rejections, incomplete or ambiguous matches.
4. Only after a unique, exact artist/release/track match may Kima submit
   the matching Lidarr-managed import command. Capture its durable ID.
   Never treat an HTTP 202 as proof of successful final import.
5. Poll Lidarr for its track-file receipt. Independently prove the
   resulting final path, size and SHA-256. Trigger normal Kima scanner
   indexing of that final path and require its independent receipt before
   marking both sides imported.
6. Any unknown commit outcome, restart, queue outage, rejected import,
   wrong mount or failed scan stops writes and leaves a durable state for
   read-only reconciliation. Never silently replay a potentially
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
