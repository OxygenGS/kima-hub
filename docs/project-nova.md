# Project NOVA — Kima Flow

**Status: development, not part of published v1.25.0.** Project NOVA is a
general-purpose improvement to the independent Kima Hub fork. It is designed
for any self-hosted deployment, with no special LAN, NAS, mount or provider.

## Why Flow

The existing Vibe map excels at exploring audio similarity, but its many
operations and 3D interactions are not the easiest way to simply start a
listening session. NOVA Flow provides a clear primary experience, keeping
the existing map under **Vibe** as an optional advanced visual view.

## Phase 1 — Guided listening (this PR)

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

## Deliberate limitations and follow-up

This first phase creates a finite, ordered listening session. It is **not yet
an endless auto-refilling queue**, a personalized model continuously trained
from thumbs-up/down, or a background music-acquisition agent. Those would
require a carefully owned Flow session lifecycle, state-safe queue extension,
a per-user feedback model, and tests against cross-device synchronization and
manual queue edits. We will add those in separate reviewed phases.

Next:

1. **Continuous Flow:** safe refill near the end of a session without
   changing a user-edited queue, skipping songs or restarting audio.
2. **Music DNA:** explicit per-user likes/dislikes and understandable
   explanations without exporting listening profiles to external servers.
3. **Discovery integration:** recommend missing songs with optional, explicit
   Lidarr/Soulseek requests; never automatically download.
4. **Library Guardian:** extend read-only Library Doctor with reviewed
   repair proposals and storage-safety verification.

## Security, release and compatibility

The new endpoint requires an authenticated Kima user and derives the
listener's identity from the session, not a request-supplied user ID.
Preferences have strict bounded schemas, the response is `private, no-store`
and candidates are constrained to actually indexed local library tracks.
Preview generation performs no writes.

This PR does not create or publish a Docker tag and cannot update a
running installation. Existing OpenSubsonic, Symfonium, Feishin, playlist,
Lidarr, Soulseek, backup, audio-analysis and Kima Connect behavior should
remain unchanged. Require backend/frontend tests, EN/NL UI, database upgrade,
privacy/security checks and native AMD64/ARM64 AIO builds before merging.
