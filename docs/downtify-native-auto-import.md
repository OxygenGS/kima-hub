# Native Downtify auto-import — portable application integration

**Development branch only. Not published or installed on any running Kima
instance.** This optional integration is designed for ordinary Kima Docker installations,
not one particular server or a Proxmox script. Fresh installations need no
legacy importer or cutover. Existing installations with another media importer
must complete a safe single-writer cutover before enabling native import.
The normal Settings experience needs no host-script edits.

## Intended user experience

1. Connect Downtify once under **Settings → Integrations → Downtify**.
2. Enable **Downloads bekijken** or the relevant individual-track requests.
   This is independent from importing the remote file.
3. Turn on **Gedownloade muziek automatisch toevoegen**.
   The administrator confirms that music storage is mounted and writable,
   that an existing library has a recoverable backup, and that no other
   importer writes to the same library. **Fresh installs** have no previous
   importer to stop. **Migrating installs** must stop and prevent automatic
   restart of other importers. Kima cannot inspect other containers or
   host services, so this acknowledgment is not independent proof.
4. Kima creates an owner-bound baseline of already completed downloads,
   then imports only newly observed individual Spotify tracks. Album
   batches and arbitrary remote files are not automatically ingested.
5. In **Settings** the administrator sees separate counters for jobs
   waiting, claimed, waiting for an index receipt, fully imported, and
   requiring review. **Refresh import status** reads local, owner-scoped
   database aggregates and checks the registered music volume; it does
   not poll Downtify, submit jobs, start scans or write music. Turning
   the switch OFF stops new claims; existing music, remote jobs and
   the baseline remain untouched.

## One-click read-only setup checks

After pairing Downtify and enabling its connection, the linked administrator
can open **Settings → Integrations → Downtify → Check Downtify setup**. This
does **not** start a download, enable automatic importing, write to the
music directory or migrate a legacy importer.

Kima displays four separate checks instead of only an overall error:

| Check | What it verifies | What it does not prove |
| --- | --- | --- |
| Music directory access | The configured music-library root exists, is a directory and is readable/traversable by the Kima backend | That the dedicated Downtify destination is writable, the intended external disk is correctly mounted or no-replace hardlinks work |
| Downtify server identity | The remote server presents the exact pinned Downtify API and server identity | That the source recording is correct |
| Paired Downtify account | The saved device token authenticates as the pinned remote owner | That all remote jobs belong to this owner |
| Original audio sample | A single matching owner-attributed completed track has an original 64-byte stream whose response and audio header are valid | Full-file integrity, ISRC, duration, successful import/index, or safe cutover |

It is normal to see **three verified checks and an unverified sample** on a
new Downtify library with no completed track. Where multiple completed
tracks exist, the read-only probe chooses one stable, unambiguous
owner-bound queue/library pair; duplicate paths or conflicting entries
are never accepted as proof. A completed Spotify track
and an exact unambiguous source-library match are necessary to test the
original stream. The reason is shown without leaking file names, tokens
or remote identifiers. Automatic import remains OFF unless explicitly
enabled separately.

This is an operational diagnostic, **not** a production acceptance test.
A real full-file canary on the user's music volume, an independent backup
and (for migrations) verification that other writers have stopped remain
mandatory before a production cutover.

## Import status semantics

The status panel deliberately distinguishes five stages:

| Stage | Meaning |
| --- | --- |
| Waiting | A newly discovered track is ready to be claimed. |
| Claimed / unresolved | A worker claimed the job; after a crash it may remain unresolved, and Kima does not blindly retry uncertain writes. |
| Waiting for library scan | The verified file was published, but Kima has not yet confirmed an exact indexed Track record and physical hash. This is **not** automatically a manual-review error. |
| Added to library | The scanner and physical hash matched; this is the confirmed imported count. |
| Needs review | The ledger explicitly placed the job in `review` or `uncertain`, requiring reconciliation before any new write. |

All counts are scoped to the administrator's exact paired Downtify owner,
server and account. Historical baseline jobs are deliberately excluded
from the operational totals. Pausing the importer does not erase counts
or music. The **Refresh import status** button is read-only: no remote
queue check, new download, scanner trigger, or import retry runs merely
because a user asks for the latest status.

A claimed job can be transient while a worker is active or can remain
unresolved after an interruption; treat this counter as diagnostic, not
proof of continuous processing. A remote completed download is never
reported as successfully imported without a matching local scanner
receipt and full physical-file hash.

## Implementation

- **Discovery:** every two minutes, only with an enabled DB setting.
  Revalidate the exact public Downtify server identity before sending an
  encrypted device token. Revalidate exact remote user and numeric job
  membership for every Spotify song. Do not ingest shared-account jobs.
- **Baseline:** one atomic PostgreSQL transaction records completed
  historical Spotify IDs **and Downtify's full mobile-library sync cursor**.
  Subsequent cycles request only the library's incremental changes, then
  require a newly added file, its post-activation timestamp and a matching
  owner-bound completed queue job. Old `done` rows that are cleared and later
  reappear or old tracks retagged after activation are not auto-imported.
  A lost cursor or full-reset feed is treated as a new baseline, not a
  source of automatically importable old music. Unique and CAS claims
  prevent two workers from claiming the same song. An uncertain claim
  stays held for review.
- **Spotify identity:** the anonymous web-player token endpoint may return
  HTTP 403. The importer first reads Spotify's public server-rendered
  track embed with a fixed validated 22-character ID, and requires an
  exact URI plus Spotify's title, credited artist and duration; it
  cannot infer identity from Downtify file names alone. The legacy API
  lookup is a compatibility fallback only when the embed is unavailable.
  If both sources are unreachable before a file is opened for writing,
  the single claim is released for a 15-minute retry; conflicting IDs
  or durations remain held for review. No embed access tokens are
  extracted, stored or sent to Spotify's API. The embed is a
  version-sensitive public-page adapter and fails closed on changes.
- **Transfer:** fetch the untranscoded original over the official
  authenticated mobile v1 track stream. Require exact response length and
  bounded streaming; never use a remote path as a local destination.
- **Verification:** the private destination temp must pass a complete
  local SHA-256, recognized audio container, duration consistency,
  full FFmpeg decode and unchanged-inode checks. If Downtify supplied an
  embedded ISRC, it **must** match Spotify. Stock Downtify downloads
  normally contain title and artist but no ISRC; for exactly that case,
  Kima requires an exact match against the independently fetched Spotify
  title, one credited artist, and duration (within 4 seconds) **in
  addition to** the already verified owner-bound queue job and matching
  remote library file. Wrong/invalid/conflicting ISRC or missing/mismatched
  title, artist or duration is held for review. This fallback is not
  acoustic fingerprinting and cannot prove the exact audio master or
  distinguish identically tagged recordings of the same duration.
- **Storage:** Kima creates only its dedicated
  `Singles/Downtify/<Artist>/<Title> - <Spotify ID>.<extension>` tree
  beneath the normal `/music` mount; no custom operator staging mount
  or remote path is required. No-replace atomic hardlink publication keeps
  existing files. The upstream source is never deleted.
- **Scan reliability:** each processing cycle requests a single scan **after**
  all its newly published Downtify claims are committed. The batch gets a
  distinct dedupe key, so a generic scan already in progress cannot swallow
  a later import's scan request. Pending physical-hash/index receipts are
  reconciled locally before any new Downtify HTTP calls; remote outages do not
  block confirmation of files that were already published. The scan still
  must finish successfully before the import status becomes confirmed.
  A pending file that remains unindexed for at least 15 minutes triggers
  one shared, deduplicated scanner-only retry. Repeated failures use a durable
  15-minute cooldown; a Redis outage does not consume the next retry.
  A failed physical hash or unsafe file is never treated as fixed by a scan.
  This recovery never re-downloads or replaces the recording.
- **Index confirmation:** store the expected hash and target path as
  `published_pending_scan` first, request the normal Kima scanner, then
  confirm a non-corrupt LIBRARY Track record and the exact physical hash
  before marking the ledger row imported. Downtify `done`, a remote
  downloaded file, and successful local file publication are not enough.

## Stock Downtify tag compatibility and limitations

Current upstream Downtify normally writes title/artist/album metadata but
does **not** promise an ISRC in downloaded MP3/FLAC files. Requiring
an embedded ISRC for every download would make this feature functionally
unavailable to ordinary users. The default import path therefore accepts
**missing** ISRC only when all of the following are true:

1. Exact paired server, owner and one completed Spotify job match exactly
   one library track and a newly added post-baseline changefeed item.
2. Independently fetched Spotify title, primary artist and duration match
   the downloaded file's embedded title, at least one credited artist
   and decoded duration (at most 4 seconds drift). Only case,
   Unicode NFKC and whitespace normalization are allowed; substrings,
   fuzzy matching, missing tags and artist guesses are rejected.
3. No non-empty conflicting or malformed ISRC is present. If a valid
   embedded ISRC exists, normal strict ISRC verification still applies.
4. The complete source byte count and SHA-256, audio header, decode,
   private temp permissions, durable file publication, volume identity
   and independent Kima scanner receipt checks remain mandatory.

Metadata alignment confirms which *track was requested*, not the exact
recording/edition retrieved from YouTube or another provider. Kima does
not claim acoustic recognition or a licensing guarantee. If the source
returns a wrong performance with correctly copied title/artist/duration,
the metadata-only fallback cannot discover it; review the recording
manually and replace it through an appropriate workflow if necessary.
This limitation must be disclosed in the stable release notes.

## Root-owned NAS/DAS music libraries

Root-owned Docker bind mounts frequently have `/music` permissions `775`
and a root-owned, non-writable-to-Kima `/music/Singles`. This is supported.
Kima does **not** need write permission on the entire music collection.

At AIO startup the privileged bootstrap safely prepares **only**
`/music/Singles/Downtify` if `Singles` already exists, making a new leaf
owned by the unprivileged backend (mode `750`). It never recursively
chowns, chmods, renames or deletes existing music. Existing foreign-owned
Downtify directories are left untouched and flagged for operator review.
Untrusted world-writable or non-root-group-writable ancestors fail closed.

The read-only API check verifies `/music` is readable and traversable; it
does **not** require `/music` to be writable. The dedicated importer still
requires its own writable, trusted directory when the admin enables import.
If the host mount is read-only, unmounted or foreign-owned, automatic
import remains disabled and the UI reports storage unavailable. Do not
run `chmod 777`, recursive `chown` or permission changes over the whole
music library to resolve it.

## Persistent music-volume identity (DAS/NAS safety)

A Docker bind mount can remain accessible as an empty local directory when
its external backing disk disappears. Before the **first explicit enable**,
Kima creates a private `.kima-native-music-volume` UUID marker inside the
**dedicated `/music/Singles/Downtify` importer directory** on the existing
music filesystem, after the administrator confirms the intended local or
network volume is mounted. An older, valid root-level marker from an earlier
candidate is still recognized; any invalid one is rejected, never replaced.
The UUID is stored with the paired Downtify owner in PostgreSQL and reset
whenever the pairing changes.

The import worker checks that exact marker **before** polling remote work
and again immediately before exposing a new file to the library. A missing
marker, a replaced disk with a different marker, a symlink, unsafe root
permissions or an absent filesystem prevents importing. Verification never
creates a missing marker or fallback music directory.

A UUID marker is a continuity check, **not** independent proof that the
correct disk was selected the first time. An existing installation needs
an independently verified app-data backup, and every installation must
verify its intended music mount before enabling. The hidden marker is
not an audio file and must be retained when pausing or rolling back native
import. Never delete the source music or original host mounts.

## Fail-safe limits

- Up to **two new songs per cycle** and **256 MiB per file**. If a remote
  library changefeed cannot prove a song is new, Kima skips it rather than
  guessing. A fast download that finishes without appearing in a verified
  incremental feed may require manual review.
- A temporary file is private to the destination filesystem; if the
  library mount disappears, becomes a symlink or changes permissions, Kima
  stops rather than writing elsewhere.
- No `rm -rf`, source deletion, album replacement, or forced overwrite.
- **Temporary downtime before a media write** (Downtify unavailable or
  music mount absent) releases only the exact authenticated one-use claim,
  with a persistent **15-minute cooldown**. This makes ordinary outages
  self-healing without manual terminal commands.
- **After the first file write attempt**, failed decoding, conflicting
  ISRC, missing or mismatched metadata, destination conflict, uncertain
  publication or scanner failure never restarts a copy automatically.
  Those tasks require reconciliation.
  File bytes and the original source are never deleted.
- The imported flag is **not** automatically enabled by upgrading Kima,
  connecting Downtify, enabling Spotify intents, or viewing the queue.
- Other Kima accounts cannot replace the paired owner's token or enable
  the native importer.
- Do not attempt file publication across separate volume devices. The
  dedicated temp and final target must share the same trusted filesystem.

## Deployment and release gate

For public release qualification use the [isolated Downtify staging
acceptance runbook](downtify-staging-canary.md). It includes a
**read-only real-server protocol/full-stream SHA-256 probe**, and
separately specifies the mandatory Kima scanner, playback,
mount-resilience and cold-restore proof. A source hash by itself
does not establish a successful Kima import or authorize a release.

The compiled production-audio smoke test also exercises **stock Downtify
FLAC and default MP3 with no ISRC** (including semicolon-separated artists),
plus wrong-title and wrong-artist rejection against
independent Spotify expectations. It verifies that the same
production-compiled volume-proof code **rejects an empty writable fallback
directory, rejects a replacement volume marker and accepts the original
volume with unchanged audio on return**. It runs only with disposable
temporary directories and generated FLAC/MP3. This is **not** a physical
NAS/USB disconnect test, a live Downtify HTTP transfer, an importer
worker end-to-end test or a scanner receipt. It cannot authorize public
release by itself.

For final candidate qualification, maintainers can opt in to the separate
**Security E2E Tests** GitHub workflow by prefixing the pull-request title
with `[E2E] `. The regular dependency/secret security scan still runs on
every PR. This opt-in runs the existing disposable Docker + Playwright
browser security suite rather than skipping it for the candidate; it does
not connect to any production library or Downtify account. The suite is a
supplemental gate and **does not** replace the external-volume/real-Downtify
canary, backend source verification or a tested restore.

No existing production host or imported music is touched by merging this
code. Before enabling on an actual system, require:

1. Native AMD64 and ARM64 builds, security and Prisma upgrade/restore
   checks, end-to-end tests, an externally mounted music-volume canary
   and an independently verified cold copy of the original `/data`.
2. **Migration only:** confirm existing external import services, containers
   or scheduled tasks targeting the same library are stopped and prevented
   from restarting. Save their definitions and backup. **Fresh installations:**
   no external importer is required; skip this step.
3. With the native setting OFF, verify Downtify connectivity, storage
   directory permissions, exact user identity and a direct original sample.
4. Enable the native importer and download **one new test song**. Verify
   identical bytes, no duplicate copy, the Kima index, playback and
   surviving a restart/missing-mount simulation.
5. **Migration only:** after a successful canary and tested recovery,
   retire the obsolete external importer service/container/schedule. Do **not** remove its music,
   download directory, filesystem mounts, historical backups or audit data.

Rolling back across the additive PostgreSQL migrations requires restoring
the independently verified **pre-upgrade `/data`** backup; changing the
Docker tag alone is not a database rollback.

## Installation contract for everyone

- **Kima:** a supported self-hosted Docker installation with a persistent
  application-data volume and a writable music-library mount, normally
  `/music` inside the container. The host path can be any user-selected local
  disk, external drive or network share that meets the safety conditions.
- **Downtify:** a separately installed compatible API v1 service, reachable
  **from Kima's container**. On a trusted shared Docker network the example
  `http://downtify:8000` can work. Do not use `localhost` to address a
  different container or host. A paired-device token is required.
- **Storage capability:** no-replace atomic hardlinks must work between
  Kima's private temporary file and the final library location. Some
  network shares do not support this, and native import must then refuse
  publication rather than degrade to an unsafe copy.
- **Permissions and evidence:** the mount must exist before activation,
  not be an unsafe symlink or writable by untrusted users, and support
  full-audio SHA-256, container, FFmpeg and duration verification;
  any embedded ISRC must agree with Spotify, while missing ISRC requires
  exact title, credited-artist and duration corroboration.
- **No personal configuration:** no fixed IP address, host name, storage
  path, Proxmox CT ID, legacy script or shared Downtify staging mount
  is part of the feature.

## One-time safe recovery from RC3 Spotify HTTP 403

RC3 could mark a genuinely new track `uncertain` with
`spotify_identity_unavailable` when the anonymous Spotify token endpoint
returned HTTP 403, **before opening any output file**. A new admin-only
button, **Retry one safely unwritten Spotify lookup**, requeues at most
ONE matching legacy claim per click. The server requires that the paired
account, original activation baseline and exact disk proof still match;
the claim must be at least 15 minutes old, have a valid claim token,
and have NO remote library receipt, destination, bytes, hash, or scanner
receipt. All conditions are enforced in a single compare-and-swap
update. Any other `review` or `uncertain` state stays blocked. Refreshing
the status page never triggers a retry, and no media file is modified by
the repair action. The next normal two-minute worker cycle rechecks
Spotify embed identity, Downtify ownership, full original audio and
publication safety from scratch.

## Common setup failures

| Kima status | Safe next step |
| --- | --- |
| Connection disabled or unpaired | Pair Downtify and enable the connection first. |
| Complete initial queue/library snapshot unavailable | Check the trusted server URL, device pairing, API compatibility and full feed. Import remains OFF. |
| Historical downloads inconsistent | Resolve ambiguous remote jobs rather than creating a guessed baseline. |
| Music storage cannot be verified | Check the real backing mount, permissions and filesystem capability. Do not select an empty Docker fallback directory. |
| Previously registered music volume missing | Restore the same volume and its hidden UUID marker. Never recreate the proof on an empty replacement. |
| A track needs review | Keep both original and published media; an uncertain write is not automatically retried. |

The Settings page displays only sanitized error categories, not private
filesystem paths, device tokens or the Downtify library feed.
