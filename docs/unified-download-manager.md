# Unified Download Manager (v1.18.0) — staged design

**Status:** development; **not in published v1.17.1**. The existing Downtify
Importer v5 and its systemd service/timer are **not replaced** by this change.
Downtify continues to run independently; Kima is the future orchestration UI.
The current backend stages add read-only diagnostics, a caller-scoped Kima job feed and a narrowly bound Downtify queue. No filesystem or queue writes are included.

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

## Phase B2: read-only, single-account Downtify queue binding

**Important:** Downtify's `GET /api/queue` returns **every user** when the
paired Downtify account is an administrator, although regular users see only
their own jobs. A device token alone does not establish a Kima user's rights.
Downtify also merges shared downloads into one row with a `user_ids` array.

The optional `GET /api/download-manager/downtify/jobs` endpoint therefore
uses a narrow, explicitly operator-configured identity binding. The Kima
backend must have the existing three Phase A variables **plus**:

```dotenv
# Optional owner binding, only for the trusted and separately paired account.
# These are placeholders, not values to copy literally.
KIMA_DOWNTIFY_OWNER_KIMA_USER_ID=<Kima user database id>
KIMA_DOWNTIFY_EXPECTED_USERNAME=<paired Downtify account username>
```

The bound Kima user ID comes from the authenticated Kima session and **must
match exactly**; query parameters cannot override it. The adapter first
verifies the public Downtify server identity with **no device token**, then
validates the remote device's authenticated account and expected username.
Only jobs whose `user_ids` explicitly contain the authenticated Downtify
user's numeric ID are included. This check is necessary **even for remote
administrators**, who can otherwise read other accounts' jobs.

The endpoint returns at most 100 minimal, sanitized job rows: opaque hashed
ID, track title, stage (queued, processing, downloaded, failed, unknown) and
validated 0–100% transfer progress where provided by Downtify. It does **not**
return the remote song IDs/links, other users, file paths, raw errors, Spotify
metadata, tokens, Downtify usernames or external filesystem paths. Every
result uses `libraryVerification: "not_checked"` because an upstream done
state does not prove that Kima has indexed the correct usable track.
Misconfigured, disabled or unbound access returns no jobs. Requests do not
write to the Downtify queue and do not touch the existing importer.

This **single-user binding is a deliberately limited interim safety measure**,
not full multi-user account pairing. It cannot support multiple simultaneous
Kima↔Downtify account mappings. Extend it with per-user encrypted credentials,
revocation and explicit user consent in a later isolated PR before advertising
fully shared multi-user download management. Do not enable this optional
feature for everyone by reusing an unrestricted administrator token.

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

## Phase D1: first Download Manager screen (this PR)

The responsive **/downloads** page is a read-only overview, linked from the
desktop library navigation and the mobile quick links in both English and
Dutch. The Kima section reads only the caller's recent 50 DownloadJob records
from the authenticated backend endpoint. The separate Downtify section reads
the optional, verified one-owner queue from Phase B2. Disabled, unbound,
unavailable, incompatible and unauthorized remote states show explanatory
text rather than implied successful downloads. No unbound user's remote jobs
are exposed, including when the paired remote account is an administrator.

Rows show conservative transfer stages, only actual remote percentage values,
and **do not** claim a completed transfer is indexed in the Kima library.
The page refreshes its two independent sources every ten seconds **only while
the browser tab is visible**. An in-flight request from a previous Kima account
cannot populate the next user's page because the subtree is keyed by account
and unmounted requests are ignored. A failed engine does not hide the working
engine's results. Existing Soulseek and Library Intelligence views remain
available.

This is **not** a command console yet: no URL submission, search/download,
cancel/retry, playlist imports or staging cleanup. The old importer continues
untouched until a fully validated single-writer replacement exists. Next
stages will add multi-account pairing and verified user-owned download jobs
before exposing mutation actions, then the import/indexing pipeline and safe
cross-filesystem file placement.


## Phase B3: canonical Spotify link intake — preview only

The next step adds a pure, no-network Spotify share-link validator and a
permission-protected backend endpoint:

\`POST /api/download-manager/spotify/preview\` with JSON
\`{ "url": "https://open.spotify.com/track/<22-character-id>" }\`.

- Requires Kima authentication **and the currently stored**
  \`canDownloadTracks\` right, even though this step does not create a download.
  The frontend only offers the form to permitted users; server authorization
  remains the enforcement boundary.
- Accepts \`https://open.spotify.com/{track|album|playlist}/{base62-id}\`,
  supported \`intl-xx\` variants and native \`spotify:track:...\`,
  \`spotify:album:...\`, \`spotify:playlist:...\` URIs. IDs must contain exactly
  22 base62 characters; artist/episode/show links and URL shorteners are not
  silently treated as track downloads. A short link must first be expanded by
  the owner outside this endpoint.
- Rejects insecure or non-Spotify hosts, credential-bearing links, fragments,
  path injection, custom ports, malformed IDs and inputs over 2048 characters.
  Validation performs **no redirect, DNS lookup, Spotify request, Downtify API
  call, library scan or data write**.
- Drops query/UTM tracking parameters and returns the canonical URL, immutable
  resource kind and a stable \`spotify:{kind}:{id}\` **identity key** as a
  building block for future owner-scoped deduplication. This key is not a
  duplicate detection result and is not persisted to a job table yet.
- Every accepted response explicitly returns
  \`{ duplicateCheck: "not_checked", downloadStarted: false,
  libraryVerification: "not_checked", submissionEnabled: false }\`.
  These flags are truthful: an accepted link **is not queued, downloaded,
  imported, indexed or checked for prior copies**.
- The localized \`/downloads\` interface has an optional link-check form for
  users with download permission, with a readable resource type and a clear
  **no download started** warning. Invalid inputs never cause remote requests.

The follow-up submission implementation must revalidate the canonical
resource and current permissions on the server; create an atomic,
idempotent per-Kima-user intent; check reliable library and existing-job
identities; and verify the real installed Downtify download contract before
enabling any actual POST to the remote engine. An accepted preview alone
**must not** become a bypass around the future duplicate, ownership, quota,
single-writer import or integrity checks.


## Phase B4: atomic prepared Spotify request identities (this PR)

This is an **additive v1.18.0 database migration**, with its own
\`SpotifyDownloadIntent\` table. Do not confuse these rows with Kima
\`DownloadJob\` rows. The existing Lidarr/Soulseek scheduling and the
independent Downtify importer **never consume prepared intents**.

- The Kima user who is currently authenticated owns the row. The database
  enforces a \`UNIQUE(userId, kind, spotifyId)\` index and a foreign key
  with account-delete cascade. An identical share URL, a \`spotify:\`
  URI and a URL with tracking parameters resolve to the **same key**.
  Track, album and playlist identities remain distinct. Another Kima
  account has its own independent requests.
- \`POST /api/download-manager/spotify/intents\` is **disabled by default**.
  An operator must explicitly set \`KIMA_SPOTIFY_INTENTS_ENABLED=true\`
  in the Kima backend environment on a staging instance to permit prepared
  intent registration. When unset, the route returns 404 and writes nothing.
  This does **not** activate the Downtify engine connection or importer.
- The route requires a real Kima session and checks the **currently stored**
  \`canDownloadTracks\` right (administrator exception as in existing
  Kima acquisition routes). A caller cannot override their \`userId\`.
  It re-parses the Spotify link server-side before any write.
- The first request creates a **prepared-only** record and returns HTTP 201.
  The database uniqueness constraint arbitrates concurrent requests;
  a duplicate returns the **same id** with \`alreadyPrepared: true\`
  and HTTP 200 instead of allocating another row. A record that later
  acquires a richer status is never reset by a repeated prepare call.
- A successful response states the narrow scope explicitly:
  \`duplicateScope: this_users_prepared_intents_only\`,
  \`libraryDuplicateCheck: not_checked\`,
  \`submittedByThisRequest: false\`, \`downloadStartedByThisRequest:
  false\` and \`filesChangedByThisRequest: false\`.

**Critical distinction:** "already prepared" is proof of a duplicate
request **for one Kima account**, not proof that the track is present in
the music library, already downloaded via Soulseek, or imported via
Downtify. The current Kima \`Track\` model has ISRC and MusicBrainz
recording IDs but **no verified Spotify ID map**; Downtify's published
metadata contract does not promise ISRC/recording identity. No fabricated
cross-provider file deduplication occurs here. Albums and playlists are
never marked complete because one matching track was found.

The preparation endpoint and additive migration first shipped as a
controlled staging foundation. Phase B5 below adds a Save-prepared-request
button **only when the backend operator enables the feature flag**.
Future PRs will add trusted metadata evidence and a per-user engine
submission state machine.
Before any real engine writes, verify the installed Downtify API version,
permission mapping, existing file availability, Importer v5 handoff,
idempotent retries and safe SSD-to-DAS cross-filesystem movement.

## Phase B5: safe saved-request overview and explicit preparation (this PR)

The first version of the **/downloads** prepared-Spotify-request panel is
separate from the running Kima/Soulseek and Downtify queue views:

- `GET /api/download-manager/spotify/intents?limit=20&offset=0` requires a
  Kima login. When the feature flag is **OFF** it returns
  `enabled: false, items: []` without reading the new table or the
  permissions store. When ON it also checks persisted track-download
  permission, and both its count and selection are strictly filtered by the
  **authenticated** Kima user ID (including admins). Pagination is limited
  to 1–50 records per page and offsets 0–1000.
- Results are deliberately labeled **saved requests**, not downloads:
  normalized resource type, validated canonical Spotify URL (or null if a
  historical row is invalid), request status, timestamp and the explicit
  indicators `libraryDuplicateCheck: "not_checked"` and
  `engineStatus: "not_checked"`. The list never serializes remote
  credentials, full metadata, download file paths or other users' IDs.
  A future status other than `prepared` is shown as **not independently
  verified** instead of an unsupported claim of audio availability.
- The English/Dutch form continues to support no-network link preview.
  Only when the backend advertises `enabled: true` does it additionally
  display **Save prepared request (no download)**. That button makes exactly
  one permission-checked `POST /api/download-manager/spotify/intents`
  call on user click. The **database unique key** returns the same saved
  request on repeated clicks or concurrent submissions; the UI describes
  both first save and already-saved cases honestly.
- Saved requests are fetched on mount and after saving. A changed Kima
  account causes the previous React subtree and its pending responses to
  be discarded. The form is not accessible to users lacking track-download
  permission. Failures show generic messages without upstream error text,
  private paths or bearer tokens.
- **No remote download submission, no cancel/retry, no library scan and
  no filesystem change** is possible through this new UI. Saved requests
  are not scheduled jobs, and existing Soulseek, Downtify and Importer v5
  workflows do not poll the intent table. Stable v1.17.1 remains unchanged.

Enabling `KIMA_SPOTIFY_INTENTS_ENABLED=true` is a **separate, operator-owned
staging decision**. Run and validate the additive schema migration first.
Do not add this variable to a public Compose example, commit tokens, or
automatically turn on the feature in production. Before any actual
downloader submission, prove installed Downtify version/contracts,
ownership/consent, safe retries, actual library/file identity, metadata
matching and SSD-to-DAS import/hardlink behavior.

## Phase C1: proof-backed local recording verification (this PR)

**Read-only, user-initiated** `POST /api/download-manager/spotify/check-library`
accepts one canonicalizable Spotify track, album or playlist link. Kima
requires the active Kima session and persisted `canDownloadTracks` permission.
The button is only offered for a successfully validated **single track** on
`/downloads` and is never called on input change or periodic status refresh.

For an individual track, the service obtains Spotify track metadata using
Kima's existing anonymous Spotify metadata client. It requires an exact
returned Spotify ID, a syntactically valid 12-character ISRC, and a
plausible duration. Only then does it search at most 25 Kima `Track` rows
where the ISRC matches case-insensitively, the album's location is
`LIBRARY`, `missingSince` is null and `corrupt` is false.

A candidate can be a **recording_match_on_disk** only when its duration is
within 4 seconds of Spotify's and the backend freshly verifies a **non-empty
regular file** below the configured `MUSIC_PATH`. File verification uses a
normalized relative scanner-owned path, checks canonical paths via
`realpath`, and rejects traversal, symlink escapes and missing DAS mounts.

Returned data is minimal: status, whether the ISRC+duration+file test passed,
optional Kima track ID, and the explicit `audioDecoded: false`,
`albumEditionVerified: false` and `downloadStarted: false` disclaimers.
Never return filesystem paths, raw Spotify metadata, access tokens or
provider error messages. A positive result means a *matching recorded
performance and real local file*, **not** identical master/edition, verified
audio decode, or a guarantee of full playback.

Unknown/uncertain results remain uncertain:

- `metadata_unavailable`: Spotify metadata lookup failed (never "absent").
- `identity_unavailable`: no validated Spotify ID/ISRC/duration.
- `no_verified_match`: no matching ISRC in the eligible catalog. This
  does **not** prove the song is absent, because local files may lack an ISRC.
- `catalog_recording_unverified`: a local ISRC exists but an appropriate
  physical file and duration were not proven.
- `not_supported`: whole album/playlist completeness is not checked by a
  single-track ISRC lookup.

This phase issues no Downtify job, has no metadata-writing fallback,
makes no library changes, does not decode audio, and leaves Importer v5
and production mounts untouched. Future download submission must recheck
the recording/file identity immediately before scheduling rather than
trusting a stale browser result.


## Phase D2: guarded one-track Downtify submission (staging only)

This is the FIRST remote write path. It is behind two independently OFF
operator settings and must NOT be activated in production just by merging
or publishing a PR. Importer v5 and its systemd timer remain untouched.

For isolated staging only, after a verified DB backup and review of the
Downtify instance and its existing music paths, configure:

    KIMA_SPOTIFY_INTENTS_ENABLED=true
    KIMA_DOWNTIFY_ENABLED=true
    KIMA_DOWNTIFY_URL=http://downtify:8000
    KIMA_DOWNTIFY_DEVICE_TOKEN=<paired device token>
    KIMA_DOWNTIFY_OWNER_KIMA_USER_ID=<Kima user database ID>
    KIMA_DOWNTIFY_EXPECTED_USERNAME=<paired Downtify username>
    KIMA_DOWNTIFY_EXPECTED_USER_ID=<numeric Downtify user ID>
    KIMA_DOWNTIFY_EXPECTED_SERVER_ID=<persistent Downtify server_id>
    KIMA_DOWNTIFY_TRACK_SUBMISSION_ENABLED=true

This is a SPECIFICATION, not a command to copy into an existing .env.
Never commit the token. The numeric remote user ID and stable server ID
are mandatory for WRITES, in addition to the older username binding.
The public /api/server/info identity probe never receives a bearer token.
Its product, API version, authenticated mode and persistent server ID
must match exactly before a device token is sent. Authentication via
/api/auth/status must confirm the precise username AND numeric user ID.
A browser may not provide its own remote base URL, token or account.

Kima provides:
- GET /api/download-manager/spotify/dispatch-capability: read-only and
  sanitized eligibility state, with no remote IDs, addresses or credentials.
- POST /api/download-manager/spotify/intents/:intentId/submit:
  accepts only a true acknowledgeUnverified flag; requires a signed-in
  Kima user with persisted canDownloadTracks permission and a prepared
  track request owned by that user. Other resource kinds are blocked.

The UI requires: a checked Spotify single-track link, a previously saved
prepared request, an explicit library check with no verified ISRC match,
and positive confirmation by the user that an unmatched track might still
be in the library. A confirmed local recording, a stale/unavailable DAS
file, an unverified catalog candidate, or missing Spotify metadata blocks
submission. The BACKEND revalidates everything, not the browser alone.

The Downtify queue has shared global rows. An administrator may SEE every
user's jobs, but Kima treats an existing job as owned only when its
user_ids includes the exact pinned remote account. The service refuses
to overwrite or retry owned failed jobs and never sends a duplicate
request for one of that user's already queued/running/done tracks.

For a new song, GET /api/song/url resolves the canonical Spotify link.
The returned source, song ID, URL, title, artists and duration are
validated; only an allowlist of safe metadata fields is forwarded.
A database compare-and-set atomically changes precisely one Kima intent
from prepared to dispatching, recording a timestamp and remote song ID
BEFORE the first network POST. Only its winning concurrent caller sends
one request to POST /api/download/batch with exactly one song and
generate_m3u=false. This Downtify endpoint responds asynchronously;
the blocking /api/download/url endpoint is deliberately not used.

When the response confirms the exact job ID, the intent becomes submitted,
not imported or playable. If the POST times out or returns an ambiguous
reply, the claim remains dispatching or dispatch_unknown and CANNOT be
automatically retried. It requires manual reconciliation against the pinned
owner's remote queue. UI state also blocks repeat clicks for that saved
request until the user switches accounts or the view is reloaded; server DB
claims continue protecting it across restarts.

Only single tracks are supported by this PR. Albums/playlists need their
own bounded resolution, metadata proof and dedup policy. A remote job
status of done does not mean Kima has imported/indexed a playable file.
Hardlinks only work on one filesystem; SSD-to-DAS moves need safe verified
copy/move logic. Importer v5, its systemd service and timer, and production
audio must not be removed before the new importer is separately proven.

The write flag remains OFF in production until actual deployed Downtify
contracts, account owner, duplicate safety, Importer v5 handoff, rollback
and staging end-to-end tests have been approved. No Compose activation,
Docker publication, systemd changes, file moves, old importer cleanup or
/mnt/music modifications belong to this source-code PR.


## Phase D3: manual, read-only verification of a submitted Spotify intent

This phase supplements D2 with a separate **explicit check**, and does not
download, import, index or alter any files. A user can verify only an already
attempted single-track request that they own. A remote transfer in the
`done` state is **NOT** proof of a Kima library import or playable audio.

An operator may enable the isolated read-only capability in an explicitly
verified **staging** environment, in addition to the D2 server/account pins:

    KIMA_SPOTIFY_INTENTS_ENABLED=true
    KIMA_DOWNTIFY_ENABLED=true
    KIMA_DOWNTIFY_RECONCILIATION_ENABLED=true

Use the pinned device token, Kima user ID, remote username, **numeric remote
account ID**, and persistent `server_id` from D2. This is not a ready-to-use
environment file. The new flag is OFF by default, independent of the D2
submission flag. Do not add it to production Compose or expose credentials
in a GitHub commit.

- `GET /api/download-manager/spotify/reconciliation-capability` returns
  only whether manual read-only verification is available to the currently
  authorized Kima user. It does not contact Downtify.
- `GET /api/download-manager/spotify/intents/:intentId/remote-status`
  requires Kima login, current persisted `canDownloadTracks` permission and
  the operator-pinned Kima owner. All lookups are scoped to that same Kima
  user's own saved intent. The feature gate is checked *before* querying
  Prisma or the remote engine. Intent ID must be syntactically valid.
- Only `submitted`, `dispatching`, and `dispatch_unknown` **single-track**
  requests with a stored remote song identity exactly matching the canonical
  Spotify ID are eligible. A prepared request is not a remote job.
- The public Downtify `/api/server/info` is checked first without an
  Authorization header; the API version, authenticated mode and persistent
  server ID must match. The paired `/api/auth/status` must then match BOTH
  numeric ID and username, even when the paired account is an admin.
- `/api/queue` is limited to at most 5000 entries. Remote evidence requires
  a unique queue row with BOTH the exact immutable song ID and numeric user
  ID inside `user_ids`. Someone else's visible jobs never count. Multiple
  matching owned rows are `ambiguous`, not an arbitrarily chosen success.
  Missing jobs, malformed queue data, remote outages and incompatible server
  identities produce conservative states.
- The API returns only a normalized remote phase (`queued`, `processing`,
  `downloaded`, `failed`, `unknown`) and explicit
  `libraryVerification: not_checked`, `playbackVerified: false`,
  `filesChanged: false`, `retryAllowed: false`. No raw URLs, remote IDs,
  passwords, local paths, or upstream errors are returned.
- The responsive EN/NL Download Manager offers **Check Downtify job** only
  on eligible saved request rows when the operator gate is enabled. The
  check runs exclusively after the user clicks. No background polling,
  remote POST, automatic retry, or reconciliation mutation happens.

**Import boundary:** This phase never updates `SpotifyDownloadIntent`
statuses. In particular, a completed Downtify task does not become an
imported Kima track or a safe trigger for another submission. A later
separately reviewed stage must prove physical file identity on the target
DAS, safe transfer/rollback, single-writer handoff with Importer v5, and
Kima indexing before introducing any importer side effects. Existing
Importer v5 and all existing Soulseek/Lidarr code remain untouched.


## Phase D4: admin-only, read-only storage topology preflight

D3 can independently verify that a bound Downtify user has a queue entry
and that Downtify has marked it `done`. That does **not** establish which
local file it produced or whether that file was copied to the Kima DAS,
correctly tagged, indexed or playable. The Downtify `GET /list` API returns
relative downloaded file paths, not a verified immutable Spotify-to-file
import manifest; do not infer exact song identity from a filename.

D4 adds a strictly **admin-only**, **default-OFF**, **read-only** root
topology check that can inform a later single-writer importer design:

    GET /api/download-engines/downtify/storage-preflight

For a separately approved staging environment only, Kima's existing
`MUSIC_PATH` is the candidate destination and the operator can configure:

    KIMA_DOWNTIFY_ENABLED=true
    KIMA_DOWNTIFY_STORAGE_PREFLIGHT_ENABLED=true
    KIMA_DOWNTIFY_STAGING_ROOT=<absolute download-root path visible to Kima>

This is a specification, not a ready-to-paste production env file.
The staging root must be **mounted read-only into the Kima backend** by
the operator and must not overlap with the Kima music root. Neither this
PR nor this endpoint changes container mounts or other configuration.
If the two applications do not share an explicitly provisioned source
directory, the preflight must report the source as unavailable.

The endpoint requires Kima administrator authorization and uses `Cache-Control:
no-store`. Only backend-controlled roots are accepted: no HTTP-supplied
paths, user IDs or URLs. It inspects each absolute root using read-only
`lstat` and `realpath`; rejects missing, non-directory and symlinked
roots, symlinked ancestor paths and overlapping directory trees. It never
traverses download files or asks Downtify to modify jobs.

The sanitized result is deliberately conservative:

- `disabled` or `misconfigured`: no filesystem access.
- `source_unavailable` or `library_unavailable`: inspection failed; no
  assumption about an absent volume or a fallback host directory.
- `unsafe_layout`: symbolic links, unexpected canonical paths or an
  overlapping source/library tree.
- `inspected` with `filesystemRelation: different_device`: device IDs
  differ, so future transfer would require copy-based semantics, not a
  hardlink.
- `inspected` with `filesystemRelation: same_device_candidate`: the device
  IDs match; a hardlink **might** be possible, but two bind mounts can still
  prohibit it. No write or hardlink test is performed.

In every state `mountIdentityVerified`, `sourceAudioVerified`,
`libraryImportVerified`, `importerCutoverAuthorized` and `filesChanged`
remain **false**. No raw host/container paths, device IDs, tokens, filenames
or error messages appear in the response. A successful topology inspection
never means that the source volume is the correct physical volume, that an
audio file matches the Spotify identity, or that the importer is ready.

**Must remain separate work:** verify stable mount identities; obtain a
recording-to-source-file manifest from the deployed Downtify version or a
trusted file-level handoff; prove file format, full-byte integrity, exact
path containment and import ownership; design atomic copy/rename and
rollback across different devices; prove Kima indexing and playback;
and arrange a single-writer cutover from Importer v5. Do **not** disable
the existing Importer v5 systemd timer or delete source files in D4.


## Phase D5: owner-verified, read-only staging file evidence

Downtify's officially documented `GET /api/queue` job rows include a
`filename` field. It is populated for completed jobs; the library's
`GET /list` paths are relative and can include `slskd/...` paths outside
the ordinary downloads root. These are *remote claims*, not trustworthy
filesystem paths or independently verified recording identities. D5
conservatively uses this contract **without trusting a title match**.

This is a **third independent, OFF-by-default staging flag** that depends
on both D3 owner verification and D4 safe root topology:

    KIMA_SPOTIFY_INTENTS_ENABLED=true
    KIMA_DOWNTIFY_ENABLED=true
    KIMA_DOWNTIFY_RECONCILIATION_ENABLED=true
    KIMA_DOWNTIFY_STORAGE_PREFLIGHT_ENABLED=true
    KIMA_DOWNTIFY_SOURCE_EVIDENCE_ENABLED=true
    KIMA_DOWNTIFY_STAGING_ROOT=<operator-controlled read-only mount>

The remote URL and paired token, exact Kima owner, remote username, numeric
remote account ID and persistent Downtify server ID must also be pinned as
specified in D2. These placeholders are NOT a deployment snippet.
The actual Downtify download root needs an **explicit read-only mount**
inside the Kima backend. This PR does not configure it, change Docker mounts,
touch music, enable flags, or replace Importer v5.

New endpoints require login and the **currently stored** Kima track download
permission, and accept no caller-provided path or remote credentials:

- `GET /api/download-manager/spotify/source-file-capability`: sanitized
  eligibility only, without network or filesystem I/O.
- `GET /api/download-manager/spotify/intents/:intentId/source-file`: on
  deliberate user request, D4 checks that both staging and Kima library
  roots are safe, then D3 re-checks immutable Spotify track identity,
  saved Kima intent ownership, Downtify server ID, device credentials,
  exact remote numeric user membership, and unique job ownership.
  Only a remotely **done** single-track job can yield a candidate filename.

The filename is handled only inside the backend. Empty/missing names are
unknown. Absolute paths, backslashes, dot/dotdot, control characters,
unexpected extensions, path component overflow and malformed names are
rejected **before filesystem operations**. `slskd/...` and `ext/...`
are deliberately unsupported: those source files may reside elsewhere.
Within the normal download root, D5 uses only `lstat`/`realpath` to
inspect every parent and the final regular file, rejecting symlinks, nested
mount device changes, escape from the canonical staging root, non-regular
files and empty files. A missing file is never a reason to resubmit: an
external importer might already have moved it.

Response statuses are intentionally narrow:

- `candidate_present_unverified`: a non-empty regular file was **observed**
  under the configured staging root. It might disappear after this instant,
  be on a different physical mount than intended, or contain incorrect audio.
- `source_unavailable`, `source_path_unavailable`,
  `unsafe_source_path`, `external_source_unsupported`,
  `storage_unavailable`: no source-file evidence is established.
- `remote_unverified`, `not_downloaded`, `not_found`: the remote
  state or user-owned intent was insufficient.

Every response explicitly includes `recordingVerified:false`,
`audioDecoded:false`, `stableMountVerified:false`,
`libraryImportVerified:false`, `filesChanged:false`,
`retryAllowed:false`. It never includes the filename, path, file size,
raw remote object, token, remote user ID or upstream error.

The English/Dutch Download Manager shows **Check downloaded source file**
only *after* the user manually verified the owned remote job as done.
The backend repeats ALL validations even though the UI already checked.
No automatic polling, download submission, copy, rename, deletion, DB
mutation, filesystem write, importer cutover or systemd change occurs.

**Following stages (separate PRs):** verify the running container's real
mount identity and trusted source-file provenance, inspect audio and tags
without changing them, define immutable staging-to-DAS delivery proofs,
then design controlled atomic copy/rename, Kima index verification, importer
single-writer handoff and safe rollback. Keep existing Importer v5 running
until an explicit cutover is proven safe on an isolated staging instance.
