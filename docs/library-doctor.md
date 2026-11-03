# Library Doctor — v1.17.0 development

The Library Doctor *report* is an admin-only, read-only diagnostic view of
indexed metadata. Smart Download Inbox adds optional, explicitly confirmed
album assignment corrections later in the same v1.17 development PR.
The report itself does not scan, write or modify any file.

## Usage

Open **Settings → Library Doctor** as an administrator and select
**Run library check**. The report is generated on demand, not when
opening Settings. A failed database query is shown as an error,
not as a zero-problem result.

## Reported signals

- Total tracks indexed against albums in the **LIBRARY** location.
- Tracks flagged missing by the most recent music scan.
- Tracks flagged corrupt by the scanner.
- Library albums with playable tracks but no stored cover (and no manual cover).
- Library artists with playable tracks but no stored portrait (and no manual portrait).
- Soulseek imports within **Singles/Kima Downloads** that are still in DISCOVER
  or whose album artist is a placeholder ("Unknown Artist"/"Unknown").

The last category is a **review candidate**, not a claim that the track is
incorrect or missing. Scanned status is not a fresh physical-disk check.
The counts can overlap; do not combine them into a health score.

Samples of missing tracks and import candidates are capped at eight per
category. The API is authenticated and separately enforces admin privileges
and sends private, non-cacheable responses. No absolute server mount paths
or credentials are included in the source.

## Planned later improvements

- Automatic import lifecycle tracking beyond existing download jobs.
- Duplicate identification with recording evidence (hash, MBID, duration).
- More metadata source integration; no automatic file moves or edits.

PR #175 and PR #176 should be reviewed separately; neither is implicitly
merged into this development slice. The patch is not a published Docker image.


## Smart Download Inbox (first read-only slice)

Settings -> Smart Download Inbox provides a manual, administrator-only check
of **the signed-in administrator's own** most recent 25 non-cleared manual
Soulseek download jobs. Other users' jobs are never included. The UI does
not fetch these details until the administrator selects **Check Soulseek imports**.

New manual Soulseek downloads store only the sanitized, music-root-relative
destination in DownloadJob.metadata.importRelativePath; no absolute host paths
or peer addresses are saved to this field. The inbox performs a bounded
exact-path query against indexed Track rows without touching the filesystem.

The statuses distinguish:
- **Downloading / Download failed**: network job state.
- **Not yet indexed**: transfer completed but no exact-path Track row found;
  the scan may still be pending, have failed or have moved the file.
- **Indexed**: a non-corrupt, non-missing LIBRARY track row exists at that path.
  This is not proof of correct artist attribution or a fresh disk check.
- **Needs review**: track is still a discovery album or has Unknown Artist.
- **File unavailable**: scanner marked the track corrupt or missing.
- **Older download: not verified**: legacy jobs lack a stored relative path,
  so their linkage is intentionally not guessed.

Only the last 25 jobs are classified, and the response includes the total
number of retained manual Soulseek jobs for context. No retry, rescan, re-tag,
file move, or download permission change is added. Explicit album reassignment
is available separately after confirmation (see below).

Further releases may introduce an opt-in reconciliation flow with explicit
match evidence and undo support, plus per-user activity integration.


## Review proposals (on-demand, read-only)

For a Smart Download Inbox item marked **Needs review**, choose **Find
possible match**. The app then inspects only that logged-in administrator's
matching Soulseek download, its exact indexed track, and a bounded set of
existing library records. This is not a new scan, MusicBrainz fetch or edit.

A candidate artist must match the sanitized download-folder artist through
Kima's canonical artist identity key and already have playable LIBRARY tracks.
Known, conflicting artist tags block a suggestion. An album is suggested only
when a same-artist LIBRARY album has the folder's exact title, or an
**Unknown Album** import uniquely matches a local track's exact name and
duration (within five seconds). Ambiguous matches never choose a first result.

Evidence is visible, with links to compare the existing artist and album.
This is **not verified identification**. Preview is read-only and does not
touch audio bytes, track tags or album assignments. A separate confirm/undo
workflow is available only when an actual album candidate is present.


## Confirmed database-only album relinking and undo

The first reversible write path is intentionally narrow. An administrator can
open an own manual Soulseek import, inspect a proposed existing artist/album,
then select **Prepare album link** and **Confirm album link**. Artist-only
suggestions cannot be applied, nor can ambiguous or stale candidates.
Nothing is linked automatically or on the first preview click.

The POST handler re-generates the proposal **within a serializable database
transaction**, authorizes the exact caller and download job, compares the
expected track ID, source album, destination album, last file modification
timestamp and file size, and atomically updates only Track.albumId and
Track.manualAlbumId. It writes an accompanying SmartImportRepair audit row.
A mismatched or changed track/album fails with HTTP 409, and the entire
transaction rolls back. Unique active-repair indexes prevent double repairs.
The only approved target is an existing same-artist LIBRARY album.

The additive database migration introduces a nullable Track.manualAlbumId,
the SmartImportRepair audit table, active unique indexes and a small PostgreSQL
trigger that keeps a user-approved album choice in effect when the normal
scanner later upserts an existing track. This protects the choice without
requiring the scanner to write differently or touching existing audio files.

For a confirmed link, **Undo album link** and **Confirm undo** restores the
original Track.albumId and clears the manual override within another
serializable transaction, marking the audit record undone. Undo fails safely
if the original album no longer exists, the Track changed, the repair was
already undone or the request belongs to a different user.

The change is **only a database album assignment**. It never renames,
transcodes, retags, moves or deletes a music file. Scanner metadata outside
the album assignment remains tag-driven. Existing plays/likes/stages stay
attached to the same Track.id. The library may continue to show duplicated
copies of a song if the proposed album already contains one; administrator
comparison is necessary. A changed audio file can still alter recording
identification and should be reviewed separately.

As with every new migration, deploy only after a restorable database backup,
successful migration smoke checks, and full green CI on the exact PR head.
This development branch is not yet an installed release.
