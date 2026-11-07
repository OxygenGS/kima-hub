# Native Downtify import — staged replacement for external scripts

**Status: read-only feasibility check, not a replacement importer.** The
published v1.19.0 image does not implement this feature. This code does
not authorize shutting down, deleting or modifying any operator-run import
service or Proxmox configuration.

## Why use the official remote-file API?

Downtify's [mobile v1 API](https://github.com/henriquesebastiao/downtify/blob/main/docs/mobile-client-contract.md)
supports `GET /api/v1/library?since=<cursor>` and
`GET /api/v1/tracks/{id}/stream?format=original` with HTTP Range and
device-token authentication. A future Kima importer can obtain audio directly
from Downtify without copying from a shared staging path. The existing Kima
`/music` mount must still point at the intended music collection, and both
applications must be able to communicate privately and securely.

The API's library may be shared across multiple Downtify users. **A file
appearing in the library is not sufficient authorization to import it.** Kima
must also establish the exact remote server/account and ownership of a
completed queue job before considering it. A remote transfer's `done` state
does not prove audio identity, intact bytes, local copy, successful indexing
or playability.

## What the read-only probe does now

The administrator-only
`GET /api/downtify-integration/import-readiness` endpoint:

1. Uses Kima's existing encrypted device pairing. Only the administrator
   who paired the device can invoke it.
2. Confirms Kima's music root is an accessible, non-symlink directory without
   creating any files.
3. Confirms the pinned Downtify server ID **before sending a device token**.
   Then verifies the exact account identity.
4. Looks for an owner-bound, completed Spotify track in the remote queue.
   Resolves its untrusted remote filename to **exactly one** opaque track ID
   in the remote mobile library, within bounded response sizes.
5. Requests only the first **64 bytes** of the original track via HTTP Range
   and checks that the response length, content range and file signature
   match the reported file type.

The endpoint returns only sanitized booleans and a bounded state code.
No source or destination path, account ID, token, remote track ID, audio,
remote response or storage location is returned. No file is copied, moved,
deleted, renamed or retagged. It does not schedule a scan or write a database
row. `autoImportAvailable`, `importerCutoverAuthorized` and
`libraryImportVerified` **always remain false**.

A missing candidate is not evidence of a failed connection; Downtify simply
may have no completed owner-bound job available to sample. This probe checks
only transport feasibility, not a complete reliable recording transfer.

## Required implementation before offering an "Automatically add to Kima" switch

- Durable, unique remote-server-and-track ownership claims and exactly-once
  file installation, safe across retries, crashes and multiple Kima workers.
- Owner-limited incremental discovery with a baseline cursor so enabling it
  cannot unexpectedly ingest an entire historical/shared remote library.
- Bounded streaming of original bytes, no redirects or proxy credential leaks,
  clear media size limits, complete hash verification, real audio decode and
  conservative recording metadata/deduplication checks.
- A private temporary file, atomic no-replace publication on the **same**
  verified music filesystem, never overwrite an existing recording.
- Durable statuses for download, import, duplicate, review and failure, with
  manual recovery for uncertain transfers. Never automatically retry a
  potentially completed copy.
- An actual **Kima scanner receipt** identifying the new on-disk track as a
  playable local library item before marking an import complete.
- A protected single-writer cutover: prove the old external importer is
  stopped and cannot restart, then independently test an isolated canary,
  restart/recovery, storage disconnect and rollback.

## Decommissioning an operator-managed Importer v5

The fork **cannot reach a private Proxmox host or inspect its services**.
Do not delete the old service, its timer, logs or code from guessed paths.
Use the host's local service inventory to identify the exact responsible
unit(s), schedule(s), script and directories; first back up the executable
and its service definitions. After a verified native importer release and
an independent cold `/data` backup and restore:

1. Quiesce the old importer's timer/service without touching the source
   download directory or music files. Confirm nothing can reactivate it.
2. Enable the new importer for **one synthetic test track**. Verify exact
   arrival, checksum, local scanner record, playback and no duplicates.
3. Test deliberate replays, crashes, power loss, temporary missing storage
   and a database rollback with the old importer still recoverable.
4. Only after a successful canary and agreed cutover, remove the obsolete
   **service code and scheduled units**, not the content or mount points.
   Keep an independent backup for rollback.

Do not use the current Downtify "Show queue" or "Download tracks manually"
settings as proof that files will automatically reach Kima.
