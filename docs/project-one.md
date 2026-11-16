# Project ONE — Kima Connect

Project ONE is a staged improvement to the **OxygenGS fork**, designed for any
self-hosted Kima deployment. It does not assume a particular NAS, hostname,
Docker volume, reverse proxy, IP address or external subscription service.

## Stage 1 — Discover and control your own browser players (development)

Kima Connect adds an account-private device menu to desktop and mobile playback.
Signed-in Kima browser tabs announce a temporary, per-user browser identity and
current playback status. The menu shows only that account's active players and
supports remote **Pause**, **Previous**, and **Next** commands on another actively playing tab. Paused/idle devices remain visible but their transport buttons are disabled. The receiver also checks its actual player state before a skip; a delayed command cannot start audio on a paused browser.

- The existing web player, queue, gapless engine and playback-state synchronizer
  remain the owners of audio. Connect does not create a second player.
- The server stores *only* device ID, name, play/paused/idle status, optional
  current title and last-seen time. No media files, passwords or tokens are
  copied into the device registry.
- Presence and commands live in Redis with short timeouts (45 seconds for
  presence, 20 seconds for a pending instruction). Maximum 12 active tabs per
  account. There is no new database migration, container port or volume.
- All endpoints authenticate and derive the account from the server session or
  authenticated API token. Device IDs are locators, **not** credentials. Every
  Redis key is scoped to the authenticated user. Unsupported commands and
  malformed device records are rejected.
- Instructions are **queued**, then atomically consumed by the target browser
  at its next heartbeat. HTTP 202 only confirms queueing, not execution;
  background-tab throttling, disconnects or session expiry can delay or lose an
  instruction. The browser player continues working if Redis is unavailable.
- Device names are generic (Kima desktop / mobile / tablet / TV). Each browser
  tab is a separate player; this is not OS-wide hardware discovery.

### Explicit exclusions

Stage 1 **does not** transfer playback between devices, remotely trigger
autoplay, control Symfonium/Feishin over OpenSubsonic, play on arbitrary speakers,
synchronize simultaneous speakers, or expose devices to other Kima users.
Browsers generally require a local gesture to start a newly opened audio
session. We will not silently bypass that restriction or claim that a remote
command succeeded before the target confirms it.

## Stage 2 — Explicit playback handoff (merged into main; not released)

A signed-in person can offer their current playing **local-library track queue** to a
second active Kima browser under the same account. The destination sees a
non-automatic prompt and must tap **Play here**. The source keeps playing until
the receiver's **existing audio engine** reports a new generation actually
playing the requested track, the receiver sends an acknowledgement, and the
source observes that acknowledgement.

- The offer includes library track IDs (not file paths), current queue index,
  seek position, device IDs and small display labels. Redis scopes the request
  to the authenticated account with a two-minute acceptance window.
- The destination loads track metadata with the existing authenticated library
  API, in small batches, **before** accepting. A missing track blocks transfer;
  no unvalidated file paths or stream URLs are relayed.
- Browser gesture restrictions are respected: the receiver explicitly clicks
  Play to start the existing player. No remotely triggered autoplay.
- After the receiver reports *playing*, the source stops only if it is still
  on the same track and its play position remains approximately continuous.
  Changed sessions are never forcibly paused.
- The source's transfer is bounded to 50 queue entries for this first slice.
  Longer queues are rejected rather than silently truncated.
- Network loss, browser throttling, failed stream playback or a timed-out
  offer leave the source playing. A receiver with a failed acknowledgement
  warns that both devices may be playing, and permits retry.
- Existing account access, OpenSubsonic clients, media files and mounts are
  unaffected; the protocol adds no ports and no database migration.
- This stage does **not** implement synchronized multiroom, external-player
  control, automatic device wake-up or a guarantee of gapless transition
  between physically separate browsers.

This is not a published stable release. Source and end-to-end checks, exact
native build checks and a controlled release review must pass first.

## Stage 3 — Remote command receipts (merged into main; not released)

The Kima Connect device menu tracks the most recently sent **Pause**, **Previous**
or **Next** command. The sender initially sees **queued**; after a receiver
heartbeat, that browser reports whether it called the corresponding local
player handler (**handled**) or refused it because the current player state
does not allow the action (**ignored**).

- The command and receipt are written together to Redis. Every receipt uses an
  authenticated account-scoped key and expires after 90 seconds. A queued
  command is shown as **expired / unconfirmed** after its 20-second delivery
  window, including when a newer instruction replaces an undelivered command.
- The browser sends a strict-schema acknowledgement including its own temporary
  device ID. Server checks the authenticated owner, command ID, recipient ID and
  deadline, then atomically transitions the receipt; duplicate confirmations
  are idempotent and conflicting confirmations do not overwrite a result.
- The open device menu checks the status of only the latest command every
  2.5 seconds. The interface does not display a previous account's receipt.
  Brief network failures do not alter audio; an unconfirmed action is not
  represented as successful.
- **Handled is not proof that playback changed or audio was audible.** It
  means the existing browser player callback was invoked. The audio engine
  remains authoritative for actual track/playback state.
- Existing players running older versions can still receive commands but do
  not send acknowledgements; their commands will show as unconfirmed. No ports,
  database migration, media move, deployment change or new external service.
- Commands still use the existing seven-second heartbeat and its single
  per-device command slot. A newer pending command replaces the previous one;
  this stage does not yet use push/SSE or guarantee real-time delivery.

Stage 3 is merged into the development branch, but not published in the stable
Docker image. A reviewed native release remains necessary before deployment.

## Stage 4 — Low-latency browser wake hints (development PR; not released)

Kima now reuses its existing authenticated, one-time-ticket **SSE event stream**
for a minimal device-specific *wake hint*. When an authorized sender queues a
remote control action, the server first commits the 20-second Redis instruction
and 90-second status receipt; then the existing per-account event bus emits
`connect:command-wake` containing only the target device ID.

- **No remote instruction is carried in SSE.** Each signed-in tab checks
  whether the hint's device ID matches its own account-scoped tab ID. If so,
  it immediately performs its existing authenticated heartbeat, retrieving the
  command via Redis GETDEL. The callback and receipt rules from stage 3 stay in
  force. Unrelated tabs do nothing.
- A single pending wake is retained if a prior heartbeat is in flight, so a
  notification cannot be lost merely because the prior call is still running.
  Additional queued wake hints coalesce rather than causing parallel fetches.
- Existing 7-second heartbeats continue unchanged. If the SSE ticket, socket,
  reverse proxy, browser background tab, or process-local event bus cannot
  deliver the hint, control requests still work through Redis on the next
  periodic heartbeat. This is **best-effort lower latency**, not guaranteed
  instant delivery.
- The event stream is already authenticated per user with short-lived
  single-use tickets and a connection cap; on account change the frontend
  closes the old subscription and obtains a fresh user-scoped ticket.
- The in-memory event bus does not fan out across separate backend processes.
  Multi-instance users retain the heartbeat fallback until a shared bus is
  introduced. The event does not include file paths, titles, media, passwords,
  API credentials or command payloads.
- No new HTTP endpoint, service port, database migration, Docker service,
  audio engine, music relocation or automatic release.

This stage remains unreleased pending the exact-head CI checks, language
regressions, security/source-privacy review and native AMD64/ARM64 build checks.

## Further development



1. **Handoff reliability:** add low-latency confirmation delivery, explicit source
   status receipts, and carefully verified recovery when a browser disconnects.
2. **Playback assurance:** richer audio-engine outcome reporting, and where
   relevant a shared notification bus for multi-process backends, without
   remotely triggering autoplay or expanding Redis's bounded command window.
3. **Smart DJ:** use existing library audio-analysis, Vibe similarity, likes,
   user preferences and listening history to produce on-device/library-only
   listening sessions. All suggested tracks must be available and playable.
4. **Library Guardian:** expand the existing read-only Library Doctor with
   permission diagnostics, duplicate evidence and explicit repair review;
   never automatically change media file locations or permissions.
5. **Discovery 3.0:** surface verified missing music and use existing optional
   Lidarr/Soulseek workflows, without making integrations mandatory.

## Compatibility and safe rollout

This feature remains **unreleased** until complete backend, frontend,
compatibility, language and security CI passes and a new native AMD64/ARM64
Docker release is reviewed. It must not change an installed Compose project,
database, media mount or current stable tag. Existing OpenSubsonic clients,
playlists, user accounts, audio quality settings and library workflows remain
separate and compatible.
