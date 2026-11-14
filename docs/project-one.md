# Project ONE — Kima Connect

Project ONE is a staged improvement to the **OxygenGS fork**, designed for any
self-hosted Kima deployment. It does not assume a particular NAS, hostname,
Docker volume, reverse proxy, IP address or external subscription service.

## Stage 1 — Discover and control your own browser players (development)

Kima Connect adds an account-private device menu to desktop and mobile playback.
Signed-in Kima browser tabs announce a temporary, per-user browser identity and
current playback status. The menu shows only that account's active players and
supports remote **Pause**, **Previous**, and **Next** commands on another tab.

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

## Next implementation slices (not yet part of the code)

1. **Explicit handoff:** request an authenticated transfer to a chosen Kima
   browser with queue and position; target must confirm locally before playback.
   Include nonce, TTL and source/target state version checks, stopping the
   source only after the target actually starts.
2. **Live remote controls:** acknowledge commands and show delivery/execution
   statuses, optionally use the existing authenticated SSE event channel for
   lower latency, with durable stale-client cleanup.
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
