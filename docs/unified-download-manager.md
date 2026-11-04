# Unified Download Manager (v1.18.0) — staged design

**Status:** development; **not in published v1.17.1**. The existing Downtify
Importer v5 and its systemd service/timer are **not replaced** by this change.
Downtify continues to run independently; Kima is the future orchestration UI.
The first phase adds only read-only diagnostics with no filesystem or queue writes.

## Source contracts and boundaries

Upstream Downtify (Henrique Sebastião) exposes a JSON API; its current documented
version uses a **paired-device bearer token** for client-scoped read access:

- `GET /api/server/info` identifies the server (`product: "Downtify"`,
  `api_version: 1`, `require_sign_in`).
- `GET /api/auth/status` confirms the paired-device identity.
- `GET /api/queue/state` returns paused/running state and global active count.
- A future implementation may use `GET /api/song/url` for link resolution,
  `POST /api/download/batch` for jobs, `GET /api/queue` for user-owned jobs,
  and authenticated `WS /api/ws` or an approved polling fallback for progress.

Sources: [Downtify API reference](https://downtify.henriquesebastiao.com/api-reference/)
and [mobile client contract](https://github.com/henriquesebastiao/downtify/blob/main/docs/mobile-client-contract.md).

**Important:** Downtify's `POST /api/download/url` may block until a track
completes. The actual request/response and available capabilities must be
validated against the installed **running** version before enabling writes.
Never assume the documentation's newest version matches the user's container.
Downtify turns public Spotify link metadata into a closest-match audio source;
metadata identity **does not prove** the audio recording is correct. The user is
responsible for downloading only content they are authorized to save.

## Phase A: default-off diagnostics (this PR)

The Kima backend has a separate `GET /api/download-engines/downtify/status` endpoint:

- Requires an authenticated Kima **administrator**; uses the existing API limiter.
- Only works if the **operator** explicitly enables it via backend environment.
- Rejects arbitrary/supplied request URLs, URL credentials, paths, queries,
  insecure public HTTP endpoints and non-device-token credentials.
- Performs at most three **GET** operations with a four-second timeout,
  16 KiB response cap and redirects disabled.
- Refuses mismatched server identity, unsupported API, disabled remote
  authentication or a token that is not recognized as a paired device.
- Responds only with a minimal status, the public server version and queue
  running/paused counts. It never returns the remote address, token, account
  identity, raw HTTP error or Downtify queue contents.

Optional environment variables in **Kima backend** (not Downtify):

```dotenv
# Omit these entirely until the connection test is needed.
KIMA_DOWNTIFY_ENABLED=true
KIMA_DOWNTIFY_URL=http://downtify:8000
KIMA_DOWNTIFY_DEVICE_TOKEN=<paired Downtify device token>
```

The address `http://downtify:8000` only works **when Kima can resolve and
reach that container on a trusted Docker network**. When they do not share a
Docker network, the operator must configure the actual trusted LAN address
reachable **from the Kima backend container**, not their browser's localhost.
A remote public address requires HTTPS. Do not disable Downtify's authentication,
paste an admin password into the variable, or expose the device token in logs or
committed configuration. Device tokens are revoked from Downtify when no longer
needed.

Leave `KIMA_DOWNTIFY_ENABLED` unset to disable all outbound requests. No
configuration is changed automatically on an installed server. The endpoint
is not yet a user-facing Download Manager.

## Phase B1: user-scoped Kima download overview (this follow-up PR)

The first shared status schema is read-only:
`GET /api/download-manager/jobs?limit=50&offset=0` requires an authenticated
Kima session/token and always filters existing non-cleared `DownloadJob`
records by the **authenticated** `userId`. There is no request field to
choose a different user, not even for administrators. The maximum page size
is 100 and the maximum offset is 1000; results have stable newest-first order.

Recognized Kima job types are `soulseek-search` (Soulseek) and
`artist`/`album` (Lidarr). Unrecognized job types remain `unknown`, never
silently attributed to Downtify. Known statuses are normalized to queued,
processing, downloaded, failed or cancelled; unknown states remain unknown.
A completed download reports **libraryVerification: "not_checked"**, not
"indexed" or "playable". Progress is `null` until it comes from a validated
engine status. The response does not reveal source paths, peer identities,
raw errors, Kima user IDs, upstream addresses, auth tokens or metadata.

**Downtify per-job data is intentionally excluded** (`downtifyJobsIncluded:
false`) while owner mapping and live-version API capabilities remain
unverified. The admin-only Downtify capability probe from Phase A is separate.
This initial overview is a backend contract for a future shared UI, not a
fully functional download dashboard. It creates no jobs and touches no music.

## Phases B–F (separate PRs after the running server contract is confirmed)

1. **Safe queues and identity:** map Downtify jobs and Soulseek downloads to
   Kima-owned user-scoped jobs. Record engine ID, owner, source link, immutable
   deduplication key and progress checkpoints. Verify idempotency across
   retries, restarts and simultaneous users before any download write.
2. **Controlled requests:** accept only supported Spotify track/album/playlist
   links, validate their canonical identifiers, verify Kima's persisted
   `canDownloadTracks`/album permissions, and submit scoped jobs to Downtify
   without leaking credentials into the browser.
3. **Reliable import:** port the proven Importer v5 pipeline into a Kima backend
   service. Use a single writer, safe path containment, symlink checks,
   metadata/recording checks, exact file availability, scanner integration and
   preserved Library Doctor manual overrides. A downloaded file is not yet a
   correctly indexed or playable song.
4. **Storage-efficient placement:** a hardlink requires source and destination
   to be on **the same filesystem**. The download SSD and a separate DAS may
   be on different devices: then use a validated copy/rename or move workflow
   with end-to-end file checks. Avoid retaining unnecessary duplicated audio;
   do **not** delete a source still needed by Downtify or another importer.
5. **Unified interface:** one desktop/mobile English/Dutch queue for Soulseek
   and Downtify, with user permissions, source, progress, cancel/retry where
   supported, error states and an independent scan/import verdict. No extra
   unrelated upstream audio-model or schema migrations in this release.
6. **Cutover only after staging:** verify track, album and playlist imports;
   same-track requests, app restarts, bad metadata, failed network, full disk,
   missing mount, cross-filesystem moves and rollback on a copied test library.
   Maintain a tested cold `/data` restore. Only when the integrated pipeline
   works should the owner authorize disabling and deleting the existing
   legacy external-import systemd service, timer and Importer v5 scripts.

## Existing deployment invariants

Do not change the running v1.17.1 image or Kima's `/music` and `/data` mount
configuration during early v1.18.0 development. Do not run Kima's importer
and Importer v5 concurrently on the same output without a controlled handoff.
Do not change Soulseek's restricted write directory. Keep the future work
separated from upstream Kima internals so newer upstream releases remain
mergeable. Release publication remains gated behind CI, native
AMD64/ARM64 security preflight and explicit version-specific approval.
