# Library Doctor and Project NOVA Library Guardian

Library Doctor provides admin-only, on-demand diagnostics of indexed music.
The existing Smart Download Inbox separately offers explicit, reversible
database-only album reassignment for qualifying own Soulseek downloads.
**The Library Doctor reports and the new Library Guardian duplicate audit
never change any indexed track or media file.**

**Development status:** the phase-5 Library Guardian duplicate view was
merged in PR #267 but is not included in published v1.25.0.

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

## Library Guardian — potential duplicate recordings (NOVA phase 5)

In **Settings → Library Doctor**, an administrator may separately select
**Inspect possible duplicates**. Nothing is queried when opening Settings
or when merely running the standard Doctor overview. The new authenticated,
admin-only `GET /api/library/doctor/guardian/duplicates?limit=8` reports
read-only evidence with `Cache-Control: private, no-store`.

It checks `Album.location=LIBRARY` tracks that the last scan still regards
as present and non-corrupt. Using existing MusicBrainz recording IDs, it
shows at most eight most frequently repeated recording groups (up to twelve
with an explicit parameter) and at most four example tracks per group.
A ninth group is checked only to indicate whether more exist.

Evidence is deliberately graded:

- **Matching acoustic fingerprint and similar duration:** the indexed
  acoustic fingerprint values agree and track lengths differ by at most
  three seconds. This is not a byte-for-byte file checksum.
- **Same recording ID, title and similar duration:** recording metadata
  agrees, but indexed fingerprints differ or are unavailable.
- **Shared recording ID:** files may be different mixes, edits or releases;
  evidence is not strong enough to claim an exact duplicate.

Every result retains title, album, artist, relative indexed path, duration
and a link to inspect the album. Raw acoustic fingerprints and the hash
values used only for comparison are never returned in responses.
Alternative editions and album compilations can legitimately contain the
same recording. **No deletion, deduplication, merging, retagging or
filesystem write buttons are provided.** The query performs no disk walk,
network request or database mutation. Errors do not display fictitious
healthy results.

A music collection with no MusicBrainz recording IDs may show no candidates
even if it contains duplicate audio files. This audit is not exhaustive
acoustic fingerprinting, a live storage check, or a guarantee that every
duplicate will be found.

## Planned later improvements

- Automatic import lifecycle tracking beyond existing download jobs.
- Optional deeper duplicate verification using a separate, explicitly requested byte-hash check and confirmed human review.
- More metadata source integration; no automatic file moves or edits.

Existing Smart Download Inbox's confirmed database-only fixes are separate
from Library Guardian's entirely read-only duplicate evidence. No NOVA
development PR publishes an image or changes a live installation.


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
transcodes, retags, moves or deletes a music file. Both affected artists'
summary counters are also refreshed in the same transaction, so the artist
list and track-count sorting reflect the confirmed reassignment immediately.
Scanner metadata outside
the album assignment remains tag-driven. Existing plays/likes/stages stay
attached to the same Track.id. The library may continue to show duplicated
copies of a song if the proposed album already contains one; administrator
comparison is necessary. A changed audio file can still alter recording
identification and should be reviewed separately.

As with every new migration, deploy only after a restorable database backup,
successful migration smoke checks, and full green CI on the exact PR head.
The Library Guardian feature is merged to the development branch but is not
included in the published v1.25.0 release.
