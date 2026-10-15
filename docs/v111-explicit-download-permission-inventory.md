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
