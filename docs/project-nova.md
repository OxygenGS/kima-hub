# Project NOVA — Kima Flow

**Status: phases 1–6 shipped in published v1.26.0 on 18 November 2026.** Project NOVA is a
general-purpose improvement to the independent Kima Hub fork. It is designed
for any self-hosted deployment, with no special LAN, NAS, mount or provider.

## Why Flow

The existing Vibe map excels at exploring audio similarity, but its many
operations and 3D interactions are not the easiest way to simply start a
listening session. NOVA Flow provides a clear primary experience, keeping
the existing map under **Vibe** as an optional advanced visual view.

## Phase 1 — Guided listening (merged to main in PR #263)

- New **Flow** entry in desktop and mobile navigation; the 3D Vibe map still
  exists and is linked directly from Flow.
- A short, clearly labeled composer: **My favorites / A bit of both /
  Surprise me**, plus simple **Energy** and **Discovery** controls.
- A read-only, account-scoped preview of up to 25 playable library tracks.
  Current local music is used as a seed if available; otherwise the server
  prefers the signed-in listener's recent plays, favorites, then library
  content. A person without listening history can still start.
- The backend reuses the existing CLAP similarity or music-feature engine,
  then combines energy fit, bounded recent history and favorites. A bounded
  general-library sample works when analysis is not yet available. It spaces
  artists/albums to avoid immediate repetition and returns short explainable
  suggestion labels.
- Only `Album.location = LIBRARY` tracks without `missingSince` or a
  corrupt-file flag can enter a queue. No external catalogs, downloads,
  paths, credentials or hidden user content are included.
- Preparing a preview never plays audio. Playback starts only on a
  user-initiated button press through Kima's **existing audio controller**.
  If the same track is already playing, Kima preserves its audio session and
  replaces only upcoming tracks instead of restarting it.
- Existing Vibe operations remain available, with the new simple Flow
  navigation independent of the heavy WebGL scene. No media files,
  databases, playlist records or provider integrations are modified.

## Phase 2 — Continuous Flow (merged in PR #264)

A user-initiated **Start Flow** action begins a private browser-only Flow
session. While the session is actively playing, Kima can extend the current
queue before it runs out. No other listening experience is opted in.

- The browser checks a **session ID**, authenticated owner, current track,
  shuffle/repeat mode and the **exact ordered queue**. It only asks for more
  music when **six or fewer** songs remain after the playing track.
- Results use the phase-1 authenticated, read-only library-only endpoint.
  The **last queued song** is the similarity seed, and up to 240 recent and
  already queued IDs are excluded. At most 20 candidates are appended at a
  time; the queue uses an approximately 35-track rolling window, preserving
  eight previously played songs for Previous. 180 recent IDs are remembered
  in browser memory, not saved as a new user profile.
- A response is discarded if the session/account changes, current audio
  pauses, the queue is modified, or another device synchronizes a different
  queue while it is in flight. Manual add, remove, reorder or replacement
  stops Flow's automatic continuation without stopping audio or discarding
  the user's edits.
- Stop Flow is always accessible on the Flow and Queue screens. It stops
  auto-refill, **not** playback. Existing Vibe controls retain their own
  clear operation semantics.
- Refill **never** calls Play, Next, load(), seek(), or a media stream
  endpoint. The existing audio element continues through the normal queue.
- On an exhausted small library, Flow stops extending and finishes the
  current queue naturally. Transient failures do not replace the queue;
  the active browser checks again on a bounded interval. Nothing runs as a
  server-side job when the browser is closed.
- No new database tables, service integrations, external music acquisition,
  ports or automatic data writes.

This is continuous **while eligible local songs remain** and the originating
Kima web player stays available. It is not infinite music from an external
catalog, cross-device continuity guaranteed through a closed tab, or audio
autoplay in a background browser.

## Phase 3 — Music DNA explicit feedback (merged in PR #265)

The Flow preview adds two accessible per-track preferences: **More like this**
and **Less like this**. Press the selected option again to undo it.

- **Account-private:** each preference is a `NovaFlowFeedback` record with
  unique `(userId, trackId)`, plus its `-1/+1` value. An additive Prisma
  migration installs the table and SQL value constraint. User or track
  deletion cascades cleanly. No provider tokens, IPs, listening timestamps,
  file locations or cloud data are stored in the new table.
- **Separate from Favorites:** no existing `LikedTrack` records are changed.
  Explicit positive choices increase future Flow ranking and appear as
  explainable **You asked for more like this** suggestions. Strongly similar
  tracks receive a bounded positive influence; negative choices suppress the
  explicitly rated song and reduce the rank of its close audio neighbors.
  A song explicitly playing as the seed can still appear as the seed.
  At most **four** recent taste signals and 45 sound neighbors each are
  evaluated per preview. No CLAP vectors required means no derived-neighbor
  influence, but explicit per-track feedback still works.
- **Validation:** authenticated routes derive the owner from the session;
  only actual local, available, non-corrupt library tracks can receive new
  preferences. Strict bounded request validation, no-store response headers,
  scoped upsert and idempotent undo prevent writing into another account.
- **No sudden playback changes:** setting or undoing feedback does not change
  existing audio sessions or reorder songs already in the queue. Future
  previews and subsequent Continuous Flow refills apply the new preference.
  Feedback labels never enter the shared playback queue JSON.
- **Bilingual and reversible:** thumbs-up/down controls on the Flow preview
  show the current value. A second click clears it. Failed writes display a
  clear message and do not claim success.
- **One migration:** this is the first NOVA schema change. Back up the entire
  `/data` volume before updating an existing installation, including the
  PostgreSQL database. A database rollback may require restoring the backup.

This initial Music DNA slice is **explicit per-track feedback**, not an
automatically trained vector model, behavior-based inference, or externally
hosted personalization service. Those can be evaluated separately after
owner-safe listening tests.

## Phase 4 — Discovery Radar (merged in PR #266)

The Flow screen gains an **opt-in** `Beyond your library` area. A person
clicks **Find new artists** to search for similar artists starting from the
current playable local track (or the prepared Flow seed). Unlike normal
Flow sessions, Radar deliberately contacts the existing external
ListenBrainz/Deezer matching sources only after this user gesture.

- Read-only `GET /api/vibe/flow/discover?seedTrackId=...&limit=8`, session
  authentication, strict bounded query validation and `private, no-store`.
- The seed must be an indexed, non-missing, non-corrupt **LIBRARY** track.
  Artist candidates originate exclusively from the established similarity
  source; Kima does not invent names or pretend an outage is no match.
- An artist is marked missing only after verifying no local
  `Album.location=LIBRARY` and non-missing, non-corrupt track exists for its
  MBID or normalized identity. A bare Artist placeholder or DISCOVER catalog
  row is not ownership proof.
- Up to eight verified names link into the existing artist detail and
  discography experience, where the listener may inspect albums. Any
  subsequent download request still uses the existing explicit
  `POST /api/downloads` route and its `canRequestAlbums` permission check;
  the Radar endpoint never calls an acquisition service.
- No playback or queue changes, downloading, library writes, schema
  migration, background polling or new integration credentials. The
  original Flow continues locally while the user explores.

**Scope:** this first Discovery slice recommends **artists**, not tracks
from a streaming subscription catalog. It does not automatically add
missing songs to Flow or initiate a Lidarr/Soulseek request. Existing
artist pages continue to own album requests, and nonconfigured providers
remain optional. Missing or offline external sources are shown as empty or
partial evidence, never as fabricated recommendations.

## Phase 5 — Library Guardian duplicate evidence (merged in PR #267)

The existing **Settings → Library Doctor** now offers an additional,
explicit **potential duplicate recordings** check. It is an administrator
view only and is independent of all Flow playback/queue processing.

- A single read-only, bounded PostgreSQL query groups available `LIBRARY`
  tracks by real MusicBrainz recording ID. The result is capped to eight
  groups by default (maximum twelve) and four tracks per group, with
  a flag when more groups exist.
- Album title, track duration, relative indexed filename and matching
  recording identity provide human-review evidence. The backend optionally
  compares the indexed acoustic fingerprints **without exporting** them
  to the browser. Equal fingerprints and nearby durations are stronger
  evidence than shared recording identity alone, but are **not proof of
  identical file bytes**.
- Results link to existing local album pages for comparison. The view has
  no update, delete, scan, retag, move, acquire or merge action. Reports
  describe *candidates*, never "waste" or an exact cleanup opportunity.
- Strict admin authentication, bounded query parameters, private no-store
  response, EN/NL UI, error and account-switch behavior; no new database
  migration, external integration or service.
- Review candidates may include legitimate greatest-hits compilations,
  reissues and alternate encodings. A collection with no indexed
  recording IDs can report none, even if it contains duplicate files.

The implementation and review policy are documented in
[Library Doctor](library-doctor.md).

## Phase 6 — Album Spotlight (merged in PR #268)

When Discovery Radar has identified a similar artist with a validated
MusicBrainz artist ID, a separate **Preview albums** button can request a
small catalog sample, without leaving Flow. Opening Flow, starting playback,
and requesting artist matches alone never fetch album release groups.

- New authenticated, read-only endpoint:
  `GET /api/vibe/flow/discover/albums?artistMbid=...&limit=3` with strict
  MusicBrainz UUID validation, an allowed limit of 1–4 and `private, no-store`.
- Uses the established MusicBrainz release-group service in interactive mode,
  filtered to Album/EP release groups without compilation/live/remix flags.
  A bounded sample excludes release groups with already-playable local library
  tracks; unindexed releases are **not** proven absent from storage.
- Returns up to three **unranked** album names, years and release-group IDs,
  no file paths, credentials, recommendations scores or download actions.
  Failure and empty results remain separate. An artist without a source MBID
  keeps the existing Explore albums link without a fabricated preview.
- Each album links to the existing album page, where separate permission
  checks govern any explicitly requested download. The preview never calls
  download, scanner, media or queue endpoints.
- EN/NL UI, opt-in fetch, abort and account/seed result isolation; no schema
  migration, background job, data writes, port or new external provider.

**Status:** phase 6 is included in published v1.26.0 with on-demand lookups.

## Planned phases

1. **Library Guardian follow-up:** optionally verify audio-file checksums
   only after an explicit action, with conservative human review and no
   automatic deletion.
2. **Discovery follow-up:** investigate richer release metadata and optional
   requests through existing album-page permission checks, never initiated
   by Flow itself.

## Security, release and compatibility

The new endpoint requires an authenticated Kima user and derives the
listener's identity from the session, not a request-supplied user ID.
Preferences have strict bounded schemas, the response is `private, no-store`
and candidates are constrained to actually indexed local library tracks.
Preview generation performs no writes.

v1.26.0 is published for AMD64 and ARM64; publication alone does not update
a running installation. Existing OpenSubsonic, Symfonium, Feishin, playlist,
Lidarr, Soulseek, backup, audio-analysis and Kima Connect behavior should
remain unchanged. Music DNA adds one database migration; protect the full
`/data` volume with a separately verified cold backup before upgrading.
The v1.26.0 source checks and exact-main native AMD64/ARM64 preflight
succeeded, followed by reviewed stable publication. Before a live upgrade,
preserve existing mounts and verify a separately restorable cold `/data`
backup. Review residual vulnerabilities in the image-security report.
