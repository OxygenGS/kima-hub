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
