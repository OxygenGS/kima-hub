# Downtify + Lidarr v2: safe handoff protocol

The native Kima-only importer remains supported. The optional Lidarr-managed pipeline is available from v1.20.0 and remains disabled until explicitly configured. A live preview canary on 11 November 2026 confirmed the managed TrackFile receipt, matching complete SHA-256, Kima scanner/album association and playback in both apps. The implementation does not require the test installation's host paths, Docker project name or credentials.

Lidarr's `GET /api/v1/manualimport` supplies media ownership candidates.
Kima requires exactly one candidate (permitting solely Lidarr's advisory `Has missing tracks` rejection for a single verified track) and independently corroborates the
verified original title, complete artist credit, album, recording duration,
size, quality, track/artist/album IDs and album release ID. Any missing,
contradictory or ambiguous value goes to manual review. Kima does not
guess a MusicBrainz release or create an artist implicitly.

After the caller has recorded a durable, single-use command intent, Kima
may submit `POST /api/v1/command` with `ManualImport`, `Copy` mode,
`replaceExistingFiles=false`, `disableReleaseSwitching=false` and the verified IDs.
Lidarr's actual `ManualImportService.Execute` sets `Album.AnyReleaseOk=false`
when `disableReleaseSwitching` is true, so forcing that flag would silently
change existing album release-selection settings. A one-song import must
preserve that user configuration. If the POST fails or
returns no command ID, the submission is **uncertain**, not retryable. For an acknowledged completed command, even if Lidarr later returns result `unknown`, reconciliation requires the exact registered artist/album/track, TrackFile, size and physical SHA-256 before confirming import. It must never submit a duplicate POST.

No direct file writes into Lidarr's managed Artist/Album/Track root
are permitted. The file must be fully verified in a shared staging folder
*outside* that root, with independently confirmed filesystem mapping.
The final path is determined by Lidarr, not a remote Spotify filename.

See `docs/downtify-lidarr-managed-handoff.md` for the full storage,
staging, reconciliation and migration gates. This module does not
enable any new filesystem writes or migrate previously imported files.
