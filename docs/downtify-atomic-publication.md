# Native Downtify media publication — dormant safety layer

**Status: not connected to routes, jobs, cron, or Settings.** The currently
published Kima image does not contain this code. It does not import music,
replace Importer v5 or grant permission to stop the Proxmox timer.

## Existing Proxmox Importer v5 behavior

An operator-inspected local v5 script (338 lines, backed up separately on
Proxmox) exposes named functions `validate_environment`, `fingerprint`,
`expected_match`, `linkable`, `publish_copy`, `publish`, `hash_handle`,
`deduplicate_existing`, `read_state`, `save_state`, and `main`.

The Python call inventory confirms **SHA-256**, exclusive linking, durable
flush (`fsync`), source/destination inode checks, JSON state-file handling
and deduplication code. A function call inventory alone does **not** prove
the precise filename mapping, comparison semantics, retry policy, or that
every v5 operation is safe. Those require a private source review before
an exact behavioral migration.

## New dormant component

`backend/src/services/downtifyAtomicPublisher.ts` provides
`publishNativeAudio({musicRoot, relativeTarget, chunks, expectedBytes, verifyTempFile})`.

- Validates a relative file path under `Singles/`, a known audio extension,
  a pre-existing non-symlink music root and existing non-group/world-writable
  parent directories. It neither accepts a browser path nor creates folders.
- Streams only bounded original bytes (64 bytes to 256 MiB) to a private
  **same-filesystem** `.kima-import-*.part` temporary file, retaining a
  SHA-256 digest; a truncated stream is rejected and its temporary file
  removed when possible. This module does **not** verify track identity or
  decode audio; upstream checks must succeed before it is called.
- **Requires** the caller to supply an independent complete-recording verification callback for the private temporary file, before it can be made visible under the music root. The callback must check audio decoding and recording identity; false/exception stops publication. If the temporary inode or timestamps changed during verification, publication is refused.
- Uses an exclusive filesystem link (atomic no-replace) rather than unsafe
  `rename()` over a destination or a move that deletes the original.
- If the destination already exists, compares complete SHA-256 bytes through
  `O_NOFOLLOW` before distinguishing identical media from a filename
  conflict. Never modifies the existing file.
- Flushes source file data and the destination directory. If a failure
  occurs **after** linking, marks the outcome `uncertain`, never
  automatically resubmits it or declares a successful library import.
- Never deletes or changes a Downtify source. Never touches album
  assignments, Proxmox timers, Samba or any private host.

## Full audio and metadata validation (new)

The dormant `downtifyNativeAudioVerification` module now implements the
required internal callback for a trusted temporary file. It verifies:

1. Exact original-file length and SHA-256 calculated from a no-follow
   file handle, matching the content hash from the staging copy.
2. Media-container signature corresponding to the accepted audio extension.
3. The **exact** expected Spotify track ID and consistent embedded ISRC and
   duration (within 4 seconds of Spotify's authoritative metadata).
4. A complete bounded FFmpeg decode-to-null, not just a readable header.
5. Unchanged source inode, size, modification and change timestamps after
   the metadata/decoder inspections.

Missing, conflicting or unverifiable metadata leaves the track for
**manual review**. A successful decode plus ISRC match is a strong
consistency check, not cryptographic proof of a particular recording
edition; the exact scanner receipt and playable indexed copy are still
required later.

The `publishNativeAudio` primitive now **requires** an independent
`verifyTempFile` callback. It refuses to publish unverified data and
rejects a temp file that changes while being inspected. Tests include
invalid tags, mismatched duration, bad checksums, decode failures,
injection attempts and time-of-check/time-of-use changes.

At present this is a **library-only primitive** with automated isolated
filesystem tests. It is deliberately not imported into an Express route or
the download worker. For single-track import, source verification, consent,
persistent identity/locking and publication must be one reviewed workflow.

## Remaining requirements for the one-switch integration

1. Authenticate a completed remote job against the paired server, numeric
   account, immutable Spotify song ID and unambiguous remote library ID.
2. Fetch a complete original recording with strict stream bounds and exact
   length, validate full media decode and ISRC/duration (or require review).
3. Create an encrypted/owner-scoped **durable import ledger** with a unique
   claim, duplicate detection and post-crash `uncertain` reconciliation.
4. Provision one dedicated trusted target directory that works correctly
   with Kima's configured `/music` volume and local permissions. Allow
   configured paths only; do not inherit any path from remote metadata.
5. Publish without overwrite using this primitive, request a library scan,
   prove the correct track is physically present, indexed and playable
   before marking it imported. Do not delete the Downtify original.
6. Run isolated canary and rollback tests (duplicate, target conflict,
   database restart, interrupted network, missing DAS mount and two writers).
7. Disable and mask the identified Proxmox timer/service **after** the
   native importer is live and a fully verified canary passed. Back up
   local unit/script files; remove only those precise service artifacts,
   never media directories or the historical audit trail.

All production changes require an explicit installation-side review,
tested full `/data` backup and a separately approved deployment. Neither
the `Queue` setting nor this dormant module changes the current importer.
