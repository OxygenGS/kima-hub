# Downtify + Lidarr v2: safe handoff protocol

The native Kima-only importer is **unchanged** in RC6. This development module is part of an optional, not-yet-released Lidarr
handoff pipeline. The staging/owner-bound command ledger, independent
Lidarr file receipts and Kima re-indexing are implemented in draft PR
#231. No live dual-library acceptance has been demonstrated.

Lidarr's `GET /api/v1/manualimport` supplies media ownership candidates.
Kima requires exactly one candidate and independently corroborates the
verified original title, complete artist credit, album, recording duration,
size, quality, track/artist/album IDs and album release ID. Any missing,
contradictory or ambiguous value goes to manual review. Kima does not
guess a MusicBrainz release or create an artist implicitly.

After the caller has recorded a durable, single-use command intent, Kima
may submit `POST /api/v1/command` with `ManualImport`, `Copy` mode,
`replaceExistingFiles=false` and the verified IDs. If the POST fails or
returns no command ID, the result is **unknown**, not retryable. The
separate reconciliation stage must first inspect Lidarr's track-file
receipt; it must never submit a duplicate POST.

No direct file writes into Lidarr's managed Artist/Album/Track root
are permitted. The file must be fully verified in a shared staging folder
*outside* that root, with independently confirmed filesystem mapping.
The final path is determined by Lidarr, not a remote Spotify filename.

See `docs/downtify-lidarr-managed-handoff.md` for the full storage,
staging, reconciliation and migration gates. This module does not
enable any new filesystem writes or migrate previously imported files.
