# Project NOVA — Kima Flow

**Status: development, not part of published v1.25.0.** Project NOVA is a
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

## Phase 2 — Continuous Flow (this PR)

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

## Planned phases

1. **Music DNA:** explicit per-user feedback and understandable ranking
   explanations without exporting listening profiles to external servers.
2. **Discovery integration:** optional, explicit missing-music requests
   through available integrations; never automatic downloads.
3. **Library Guardian:** read-only diagnosis and reviewed, storage-safe
   repair proposals.

## Security, release and compatibility

The new endpoint requires an authenticated Kima user and derives the
listener's identity from the session, not a request-supplied user ID.
Preferences have strict bounded schemas, the response is `private, no-store`
and candidates are constrained to actually indexed local library tracks.
Preview generation performs no writes.

This phase-2 PR does not create or publish a Docker tag and cannot update a
running installation. Existing OpenSubsonic, Symfonium, Feishin, playlist,
Lidarr, Soulseek, backup, audio-analysis and Kima Connect behavior should
remain unchanged. Require backend/frontend tests, EN/NL UI, database upgrade,
privacy/security checks and native AMD64/ARM64 AIO builds before merging.
