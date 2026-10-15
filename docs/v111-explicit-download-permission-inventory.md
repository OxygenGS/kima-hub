# Explicit music download permissions — v1.11 fork candidate

> **Draft release checklist**, 2026-10-15. This inventories file-download and
> acquisition operations specifically checked in the experimental PR #7 source.
> It is **not** a certification of every route or a DRM promise.

## Permission contract

- `canRequestAlbums`: permit creation or retry of album/library acquisition
  jobs (Lidarr, Release Radar, Discover). It does not independently authorize
  direct audio-file downloads.
- `canDownloadTracks`: permit explicit offline/file-download functionality
  (mobile offline copies, Soulseek file acquisition, Subsonic `download.view`).
- Playlist-import operations that may both acquire and download require **both**
  rights.
- Administrators pass the fork's current-role override. Persisted rights come
  from PostgreSQL on each protected operation, not JWT or client claims.
- Music **streaming** has its own authentication and sharing policy. A client
  permitted to stream can save the received bytes; these flags are **not DRM**.

## Source-to-permission inventory

| API operation | Source router | Current gate |
| --- | --- | --- |
| `POST /api/downloads` (new library/album job) | `backend/src/routes/downloads.ts` | Auth + `canRequestAlbums` |
| `POST /api/discover/generate` | `backend/src/routes/discover.ts` | Auth + `canRequestAlbums` |
| `POST /api/discover/retry-unavailable` | `backend/src/routes/discover.ts` | Auth + `canRequestAlbums` |
| `POST /api/releases/download/:albumMbid` | `backend/src/routes/releases.ts` | Auth + `canRequestAlbums` |
| `POST /api/spotify/import` | `backend/src/routes/spotify.ts` | Auth + both `canRequestAlbums` and `canDownloadTracks` |
| `POST /api/spotify/import/quick` | `backend/src/routes/spotify.ts` | Auth + both rights |
| `POST /api/soulseek/download` | `backend/src/routes/soulseek.ts` | Auth + `canDownloadTracks` |
| `POST /api/offline/albums/:id/download` | `backend/src/routes/offline.ts` | Auth + `canDownloadTracks` |
| `POST /api/offline/tracks/:id/complete` | `backend/src/routes/offline.ts` | Auth + `canDownloadTracks`, rechecked before cache state changes |
| `/rest/download.view` (Subsonic GET/POST) | `backend/src/routes/subsonic/playback.ts` | Subsonic auth + live user-row check for `canDownloadTracks` |
| `/rest/getUser.view`, `/rest/getUsers.view` | `backend/src/routes/subsonic/profile.ts`, `userManagement.ts` | Report effective persisted download role |

This is a list of **explicit acquisition/file-download gates**, not all endpoints
containing the word `download`. For example `DELETE /api/downloads/:id`
changes a job owned by the requester; it is not an operation creating a new
download. `POST /api/spotify/import/m3u` matches existing library tracks to a
playlist and is not an acquisition operation.

## Important separate review scopes

- Authenticated playback: `/api/library/tracks/:id/stream` and
  `/rest/stream.view` are deliberately not blocked by `canDownloadTracks`.
  Protect them with authentication, safe music-root resolution and scoped
  streaming credentials.
- Public share-token streaming (`/api/share/:token/stream/:trackId`) follows
  explicit sharing and token-scope rules, not the private file-download flag.
- Other media (audiobook/podcast caching and streaming), playlist processing,
  queue/job management and administrator maintenance are **separate
  authorization scopes**. Audit each before declaring overall permission
  acceptance.
- The Subsonic protocol commonly represents authorization failures in
  HTTP-200 XML/JSON envelopes. `download.view` returns protocol error 50
  for missing permissions; raw server exceptions are not returned to clients.
- A real owner with `canDownloadTracks` may save an authorized stream.
  No server-side flag can prevent a recipient recording or copying delivered
  audio bytes.

## Anonymous share-link scope (verified in source, CI pending)

The `/api/share/:token` JSON response must use **explicit selected display
fields** for track, playlist and album: title, artist, duration, cover reference,
track number and playlist ordering. Untrusted recipients must not receive a
Track's `filePath`, private analysis, service credentials or a Playlist's
configuration/internal identifiers merely because a shared token is valid.

A `/api/share/:token/cover-art/:coverArtId` request must refer to artwork
belonging to the token's track, album or a track in its playlist. Do **not**
treat a valid token as a capability to read arbitrary `native:` covers.
The route checks the DB relationship **before** opening the image cache.
Token-protected images use `Cache-Control: private, no-store` to avoid
year-long caching beyond share revocation or expiry.

`/api/share/:token/stream/:trackId` validates token, expiry and membership
first; stored paths must remain inside the canonical real filesystem root,
including symlinks. A file under the root that resolves to an external symlink
target is forbidden. The stream does **not** depend on a listener's private
`canDownloadTracks` flag: a share token is a separate intentional audio
capability. The recipient may still save the streamed bytes.

Dedicated HTTP regressions are in
`backend/src/routes/__tests__/shareCoverPermissions.route.test.ts`,
`shareStreamContainment.route.test.ts` and
`share.route.test.ts`. They cover covers belonging to another share,
revoked/exhausted tokens, safe metadata projections, symlink escape,
traversal, missing files and valid in-root shared audio.

**Limits:** These controls are not complete protection against a privileged
host operator changing files concurrently (TOCTOU) or a CDN overriding cache
headers. Native front-end and third-party client acceptance is still needed.

## Canonical containment for authenticated music streams

Authenticated browser streaming (`/api/library/tracks/:id/stream`), browser
prewarming (`/api/library/tracks/:id/prewarm`) and both Subsonic
`stream.view` and `download.view` now call the same
`resolveExistingMusicFile` helper before opening audio or scheduling a
transcode. This resolves **both the actual target and the configured root**
with `realpath`. A scanned database path, even if lexically inside the
library, must point to an existing regular file physically inside the music
root. Legitimate symlinks pointing back inside the music library and a
symlinked mount for the music root remain supported.

A denied browser stream is a generic `404 Track not available`; prewarm
returns its usual non-revealing `202`. Subsonic returns protocol error 70
(Song not found), including for an otherwise authorized file download.
`canDownloadTracks` remains a **separate** current-DB authorization gate.

Runtime regressions:
- `backend/src/routes/library/__tests__/trackPath.test.ts`: canonical
  regular file, root and track symlinks, escaped, missing, traversed and
  directory cases.
- `backend/src/routes/__tests__/canonicalMusicStreams.route.test.ts`:
  actual browser and Subsonic HTTP routes with physical test files;
  playback, download and prewarming never open escaped files.
- `.github/ci/check-v111-security-guards.sh`: rejects accidental removal
  of the route-level calls, in addition to (not instead of) HTTP tests.

**Boundary:** A canonical-path check before opening still has a potential
time-of-check/time-of-use race if another privileged local actor changes
filesystem links between checking and opening. Full host-level hardening
remains a separate operational and security review.

## Regression coverage

- `backend/src/middleware/__tests__/musicPermissions.test.ts`: actual
  role/permission middleware behavior.
- `backend/src/routes/__tests__/offlinePermissions.route.test.ts`: explicit
  mobile offline initiation/completion.
- `backend/src/routes/subsonic/__tests__/downloadPermissions.route.test.ts`:
  allowed/denied files, role reporting, revocation and error fallback.
- `backend/src/routes/subsonic/__tests__/compatAlwaysAnswers.route.test.ts`:
  protocol error handling without raw database diagnostics.
- Other focused HTTP guards are listed in
  `.github/workflows/upstream-v111-implementation-checks.yml`.
- `.github/ci/check-v111-security-guards.sh` asserts route-level guards
  structurally; run it alongside HTTP tests, never as a replacement for them.
- Fresh AMD64/ARM64 AIO smoke and original v1.10/v1.11 image migration/rollback
  rehearsals are required separately and use **disposable** users and volumes.

## Still required before release

1. Inspect all newly merged v1.11 media and share endpoints for authorization,
   path traversal, safe redirection, ownership and rate limiting.
2. Manually test role changes and revoked permissions in supported native
   Subsonic and browser/mobile clients.
3. Complete EN/NL UI and mobile/TV accessibility acceptance.
4. Confirm latest-head CI (backend tests, browser, AIO on both architectures,
   both official-image upgrades and rollback) and obtain explicit approvals.
5. Keep this PR Draft; no merge, release, image push or CT 101 production update
   without separate authorization.
