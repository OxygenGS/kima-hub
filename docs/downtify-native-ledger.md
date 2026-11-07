# Native Downtify import ledger — persistent identity and crash safety

**Status: native integration candidate in draft PR #217, not released.**
The standalone ledger was previously merged to main as a dormant
component; PR #217 adds the opt-in import worker, scanner receipt and
Settings switch. Published v1.19.0, existing music and the operator's
external Importer v5 are **not changed or deployed** by this PR.
Even after upgrading, automatic media writes remain OFF until an owner
explicitly confirms the backup and single-writer cutover.

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
- `nativeImportEnabled` — boolean, **false by default**, controlled by
  the admin-only single import toggle after explicit first-use confirmation.
- `nativeImportBaselineAt` — initially null, the first activation epoch.
- `nativeImportLibraryCursor` — first-activation Downtify library cursor
  to exclude old downloads after queue resets or server restarts.
- `nativeImportMountProof` — UUID marker on the operator-verified music
  volume, checked before every automated file operation.

A new `DowntifyNativeImport` table stores only:
- Kima owner, remote server/account identity and immutable Spotify ID;
- optional remote mobile-library ID, expected bytes and Kima-local target;
- status, claim token, hash, scanner ID and bounded error code.

The remote filename, private media bytes, paired device token, server URL
and user-supplied filesystem paths are **not persisted** here.
The table has a unique constraint on
`(remoteServerId, remoteUserId, spotifyTrackId)` and a foreign key to
the Kima user with cascading deletion.

## External music-volume identity

The integration also stores `nativeImportMountProof` (nullable, OFF
by default). On an administrator-confirmed first activation, a private
UUID marker is written to the configured music root and its UUID is saved
with the initial queue/library baseline. All later discovery and claim
operations require this persistent proof; the media worker also checks
the physical marker before polling, linking or scanning any file.

A dropped DAS/USB disk may leave a writable local fallback path with the
same directory name. Without this independent on-disk marker Kima could
write files to the wrong storage. If the marker disappears, all automatic
work pauses. Re-pairing clears the DB proof but does not delete the
physical marker. The root was still operator-verified at first activation.

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
The `claimed` state is acquired with a transactional compare-and-swap.
A process crash, ambiguous claim or any after-publication outcome is
**never** automatically reset to ready. A crash between file publication
and database acknowledgement must not cause an automatic second file write.

Only two explicitly proven **pre-write** errors can release a currently
owned claim back to ready: a temporarily unavailable remote source or
unavailable music mount, *before* calling the atomic publisher. The
released claim retains its last `claimedAt`, and both the claim query
and atomic UPDATE enforce a **15-minute cooldown**. A missing DB receipt
holds the claim; no retry path uses unchecked exceptions as evidence
that no file was written.

## First-time activation

The **Settings → Integrations → Downtify** toggle first authenticates an
owner-bound queue and full library snapshot and checks the confirmed
music volume. It stores all historical completed Spotify IDs as
`baseline`, plus the library cursor, volume UUID and activation epoch
in a transaction. Ambiguous snapshots are refused completely.

Only files confirmed in later incremental mobile-library changes, with
post-activation timestamps and one matching completed owner job, may
enter `ready`. In-flight downloads postpone cursor advancement rather
than losing events. Never flip `nativeImportEnabled` directly in SQL.

## Kima's final scanner receipt (opt-in import worker)

The opt-in worker calls `recordNativePublished` only after a complete
audio verification and successful atomic no-overwrite publication.
That transition stores the target's relative Singles/ path, exact byte
count, SHA-256 and remote library ID, then advances the durable claim to
`published_pending_scan`. It **does not** mark the import complete.

`confirmNativeIndexed` must then independently check the Kima `Track`
row at that exact relative path, with a LIBRARY album, non-corrupt
status and matching file size. It opens the physical file on the
approved music mount using `O_NOFOLLOW`, rejects symlinks and nested
mounts, hashes the entire file and verifies stable inode, size and
timestamps. Only then does a compare-and-swap advance the ledger to
`imported` with the local scanner track ID.

Any missing file, offline DAS, changed hash, index failure or stale
claim stays unconfirmed; no automatic re-copy or deletion is triggered.
A database scanner receipt still does not, by itself, prove that
every external music player has successfully streamed the file.
These operations are wired to the admin-only opt-in switch in the
unreleased integration candidate. They do not run in v1.19.0.

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

**The transport component alone never writes music.** The optional
worker independently compares Spotify identity, parses recording tags,
decodes the entire recording from a private 0600 file, then uses the
atomic no-overwrite publisher and requires a Kima scanner receipt.
Only provably unwritten remote/storage outages may retry after the
durable cooldown. Uncertain post-write outcomes stay held for review.

## Existing Importer v5

The existing operator-managed host import timer/script remain outside
this GitHub repository and have **not been touched** in this development
session. No source-code PR can disable that external timer. Before
enabling the native importer on a real system, its operator must verify
that the external importer is stopped; two importers must never write
to the same music library concurrently.

Before v5 is removed, we need a complete original-audio stream with
hash/decode checks, an atomic no-overwrite publication, exact scanner
receipt, crash/restart tests, staging-space limits, NAS-disconnect tests
and a tested single-writer cutover. The new ledger is one prerequisite,
not evidence that these conditions have been met.
