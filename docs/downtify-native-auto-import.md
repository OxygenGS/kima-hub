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
| Music directory access | The configured library root exists, is a directory and is accessible to the Kima backend | That an external disk is mounted at that path or supports no-replace atomic hardlinks |
| Downtify server identity | The remote server presents the exact pinned Downtify API and server identity | That the source recording is correct |
| Paired Downtify account | The saved device token authenticates as the pinned remote owner | That all remote jobs belong to this owner |
| Original audio sample | A single matching owner-attributed completed track has an original 64-byte stream whose response and audio header are valid | Full-file integrity, ISRC, duration, successful import/index, or safe cutover |

It is normal to see **three verified checks and an unverified sample** on a
new Downtify library with no completed track. A completed Spotify track
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
- **Transfer:** fetch the untranscoded original over the official
  authenticated mobile v1 track stream. Require exact response length and
  bounded streaming; never use a remote path as a local destination.
- **Verification:** the private destination temp must match a full local
  SHA-256, recognized container, expected Spotify ISRC, expected duration,
  completed FFmpeg decode and unchanged inode. Missing tags, unavailable
  Spotify identity or contradictory evidence are rejected for review.
- **Storage:** Kima creates only its dedicated
  `Singles/Downtify/<Artist>/<Title> - <Spotify ID>.<extension>` tree
  beneath the normal `/music` mount; no custom operator staging mount
  or remote path is required. No-replace atomic hardlink publication keeps
  existing files. The upstream source is never deleted.
- **Index confirmation:** store the expected hash and target path as
  `published_pending_scan` first, request the normal Kima scanner, then
  confirm a non-corrupt LIBRARY Track record and the exact physical hash
  before marking the ledger row imported. Downtify `done`, a remote
  downloaded file, and successful local file publication are not enough.

## Persistent music-volume identity (DAS/NAS safety)

A Docker bind mount can remain accessible as an empty local directory when
its external backing disk disappears. Before the **first explicit enable**,
Kima creates a private `.kima-native-music-volume` UUID marker inside the
configured music root, after the administrator confirms the intended local or network music
volume is mounted. The UUID is stored with the paired Downtify owner in PostgreSQL
and reset whenever the pairing changes.

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
- **After the first file write attempt**, failed decoding, missing ISRC,
  destination conflict, uncertain publication or scanner failure never
  restarts a copy automatically. Those tasks require reconciliation.
  File bytes and the original source are never deleted.
- The imported flag is **not** automatically enabled by upgrading Kima,
  connecting Downtify, enabling Spotify intents, or viewing the queue.
- Other Kima accounts cannot replace the paired owner's token or enable
  the native importer.
- Do not attempt file publication across separate volume devices. The
  dedicated temp and final target must share the same trusted filesystem.

## Deployment and release gate

The compiled production-audio smoke test now also verifies that the same
production-compiled volume-proof code **rejects an empty writable fallback
directory, rejects a replacement volume marker and accepts the original
volume with unchanged audio on return**. It runs only with disposable
temporary directories and generated FLAC. This is **not** a physical NAS/USB
disconnect test, a live Downtify HTTP transfer, an importer worker end-to-end
test or a scanner receipt. It cannot authorize public release by itself.

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
  the full-audio SHA-256, container, FFmpeg, ISRC and duration checks.
- **No personal configuration:** no fixed IP address, host name, storage
  path, Proxmox CT ID, legacy script or shared Downtify staging mount
  is part of the feature.

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
