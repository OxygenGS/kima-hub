# Native Downtify import ledger — persistent identity and crash safety

**Status: additive schema and dormant service.** The released v1.19.0
container, Downtify settings and Proxmox Importer v5 are unchanged.
Nothing in this PR schedules downloads, writes media files, mutates
existing music, enables a settings switch or authorizes a cutover.

## Why the ledger is necessary

Downtify's `/api/queue` can expose shared jobs belonging to more than one
remote account. A job can finish while Kima is offline. An existing file
name or a remote `done` status is neither a Kima import receipt nor proof
that the actual recording belongs to the expected Spotify track.

Each candidate must be scoped to the **pinned server identity, numeric
remote user ID and immutable Spotify track ID**. Kima must preserve a
durable record of historical downloads, failures, claims and duplicates
across restarts and concurrent workers.

## Additive migration

`DowntifyIntegration` gains:
- `nativeImportEnabled` — boolean, **false by default**, with no UI or
  active worker that can set it in this phase.
- `nativeImportBaselineAt` — initially null, set once after authenticating
  the full queue snapshot for first-time activation.

A new `DowntifyNativeImport` table stores only:
- Kima owner, remote server/account identity and immutable Spotify ID;
- optional remote mobile-library ID, expected bytes and Kima-local target;
- status, claim token, hash, scanner ID and bounded error code.

The remote filename, private media bytes, paired device token, server URL
and user-supplied filesystem paths are **not persisted** here.
The table has a unique constraint on
`(remoteServerId, remoteUserId, spotifyTrackId)` and a foreign key to
the Kima user with cascading deletion.

## Processing states

| State | Meaning |
| :--- | :--- |
| `baseline` | Existing completed job at activation; never auto-import |
| `ready` | Newly observed, owner-bound completed track awaiting identity checks |
| `claimed` | One worker acquired an atomic one-time claim |
| `published_pending_scan` | File may be present; scanner receipt still missing |
| `imported` | Reserved for proven scanner/index/playback receipt |
| `review` / `uncertain` | Stop automatic processing, require human reconciliation |

Only the first two states may be created by the discovery service.
The `claimed` state is acquired with a transactional compare-and-swap;
an ambiguous or expired claim is **never automatically reset to ready**.
A crash between file publication and database acknowledgement must not
cause an automatic second file write.

## First-time activation

A future UI activation must use the full, owner-filtered, authenticated
Downtify queue as a **one-time baseline**. It stores past completed Spotify
IDs as `baseline` and writes the baseline epoch in the same PostgreSQL
transaction. A conflicting or ambiguous snapshot is rejected completely.
Only future newly completed jobs can enter `ready`, and unique insert
semantics prevent re-processing an existing song after restart.

This service does **not** implement the initial UI activation yet:
the owner authentication, safe source stream and index-confirmed file
publication must be wired together first. Do not flip
`nativeImportEnabled` by editing the database directly.

## Direct source transfer (new, read-only)

The internal `downtifyNativeOriginalTransport` module can resolve a
**specific Spotify song**, not an arbitrary item in the shared remote
library. It uses the saved device token from Kima's existing pairing,
checks the pinned public server identity **before sending the token**,
checks the exact signed-in device/account, and finds **one and only one**
completed, owner-attributed Downtify queue row for that song.

The remote job's path is treated as untrusted input and used solely to
locate **one** opaque mobile-library track ID. It is never interpreted
as a filesystem destination in Kima. The module requests an original
Downtify audio stream over the official mobile API. The response must
have HTTP status 200, an exact Content-Length matching the approved
library record, an expected media type and no content encoding. Redirects
and proxy forwarding are disabled, and the async stream rejects
oversized, truncated or malformed byte chunks.

**The stream is not written to disk yet.** A complete response is not
proof that embedded metadata matches the requested Spotify recording.
Future code must compare identity, decode audio, issue an approved
atomic file publish, and verify a Kima scanner receipt before returning
an imported state. A refused or interrupted stream must stop at review,
not silently retry after an uncertain file write.

## Existing Importer v5

The private host timer `chillverse-downtify-import.timer` is still enabled,
and the existing script is backed up on the Proxmox host.
No source-code PR can disable that private timer. The old and new
importers must not write to the same music library concurrently.

Before v5 is removed, we need a complete original-audio stream with
hash/decode checks, an atomic no-overwrite publication, exact scanner
receipt, crash/restart tests, staging-space limits, NAS-disconnect tests
and a tested single-writer cutover. The new ledger is one prerequisite,
not evidence that these conditions have been met.
