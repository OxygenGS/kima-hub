# Native Downtify auto-import — one control, conservative cutover

**Development branch only. Not published or installed on any running Kima
instance.** This feature replaces a separately managed downloader import
script only **after** an explicit, independently tested single-writer
cutover. The normal UI is designed to require no script edits or command
line to use it after initial setup.

## Intended user experience

1. Connect Downtify once under **Settings → Integrations → Downtify**.
2. Enable **Downloads bekijken** or the relevant individual-track requests.
   This is independent from importing the remote file.
3. Turn on **Gedownloade muziek automatisch toevoegen**.
   The first activation requires confirming that any existing external
   importer has been stopped and a tested complete Kima `/data` backup
   is available. Kima cannot discover or disable external systemd timers
   on other hosts. The acknowledgment is not technical proof.
4. Kima creates an owner-bound baseline of already completed downloads,
   then imports only newly observed individual Spotify tracks. Album
   batches and arbitrary remote files are not automatically ingested.
5. In **Settings** the administrator sees the number waiting and requiring
   attention. Turning the switch OFF stops new claims; existing music,
   remote jobs and the baseline remain untouched.

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
configured music root, after the administrator confirms the actual disk is
mounted. The UUID is stored with the paired Downtify owner in PostgreSQL
and reset whenever the pairing changes.

The import worker checks that exact marker **before** polling remote work
and again immediately before exposing a new file to the library. A missing
marker, a replaced disk with a different marker, a symlink, unsafe root
permissions or an absent filesystem prevents importing. Verification never
creates a missing marker or fallback music directory.

A UUID marker is a continuity check, **not** independent proof that the
correct disk was selected the first time. Production activation still needs
a tested storage/mount check and a verified backup. The hidden marker is
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

No existing production host or imported music is touched by merging this
code. Before enabling on an actual system, require:

1. Native AMD64 and ARM64 builds, security and Prisma upgrade/restore
   checks, end-to-end tests, an externally mounted music-volume canary
   and an independently verified cold copy of the original `/data`.
2. Confirm existing external import scripts/timers targeting **the same
   library are stopped and prevented from automatically restarting**.
   Save their definitions first and leave scripts backed up.
3. With the native setting OFF, verify Downtify connectivity, storage
   directory permissions, exact user identity and a direct original sample.
4. Enable the native importer and download **one new test song**. Verify
   identical bytes, no duplicate copy, the Kima index, playback and
   surviving a restart/missing-mount simulation.
5. Only after a successful canary and tested recovery remove the obsolete
   external importer service/timer/script. Do **not** remove its music,
   download directory, filesystem mounts, historical backups or audit data.

Rolling back across the additive PostgreSQL migrations requires restoring
the independently verified **pre-upgrade `/data`** backup; changing the
Docker tag alone is not a database rollback.
