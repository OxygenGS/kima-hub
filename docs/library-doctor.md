# Library Doctor — v1.17.0 development

The first Library Doctor slice is a **read-only, admin-only diagnostic report**.
It uses the indexed metadata already stored by Kima Hub. No new database
migration, background job, filesystem crawl or automatic repair is introduced.

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

## Deferred to later v1.17 slices

- Safe linking/reclassification of downloaded singles with explicit previews.
- A persistent download lifecycle and retry inbox.
- Duplicate identification with evidence (hashes, recording identity).
- Any edit, automatic correction, move, deletion or metadata rewrite.

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
file move, deletion, automatic fix or download permission change is added.

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
This is **not verified identification** and no confirm/write endpoint is
introduced. The proposal does not touch audio bytes, track tags, stored
artist/album assignments, or the user's files. Future changes would need
atomic revalidation, an explicit admin confirmation and rollback design.
