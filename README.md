<div align="center">

<img src="assets/readme-header.svg" alt="Kima Hub — OxygenGS fork. Your music. Your space." width="100%" />

# Kima Hub

**A beautiful home for the music you own.**

A modern, self-hosted listening experience with a distinctive dark interface, personal discovery, library tools and the freedom to run it all on your own server.

[![Stable release](https://img.shields.io/badge/stable-v1.25.0-ffb000?style=flat-square)](https://github.com/OxygenGS/kima-hub/releases/tag/v1.25.0)
[![Docker image](https://img.shields.io/badge/image-GHCR-316797?style=flat-square&logo=docker&logoColor=white)](https://github.com/OxygenGS/kima-hub/pkgs/container/kima-hub)
[![Platforms](https://img.shields.io/badge/Linux-amd64%20%7C%20arm64-41434f?style=flat-square)](https://github.com/OxygenGS/kima-hub/actions/workflows/docker-publish.yml)
[![Languages](https://img.shields.io/badge/UI-English%20%2B%20Dutch-8150a1?style=flat-square)](docs/internationalization.md)
[![License](https://img.shields.io/badge/license-GPL--3.0-555?style=flat-square)](LICENSE)

**[What's new](#whats-new-in-v1250--kima-connect) · [Experience](#the-experience) · [Settings Studio](#settings-studio-20) · [Features](#features) · [Install](#quick-start) · [Docs](#documentation)**

</div>

---

## What's new in v1.25.0 — Kima Connect

**Your music, between your Kima browsers.** [v1.25.0](https://github.com/OxygenGS/kima-hub/releases/tag/v1.25.0) brings Project ONE / **Kima Connect** to the stable OxygenGS fork. Control an active Kima browser from another signed-in browser on the **same account**, or offer your current music queue to it.

| Find your players | Transfer with consent | Clear command feedback |
| :--- | :--- | :--- |
| See up to **12 recently active browser tabs** (desktop, mobile, tablet or TV). Devices are private to your account. | Send a **local-library queue of up to 50 tracks** and the current play position. The receiver must choose **Play here**. | Send **Pause, Previous or Next** and see **queued**, **handled**, **ignored** or **unconfirmed**, instead of assuming an action worked. |
| No separate pairing service or new port. | The source pauses only after confirmed receiver playback and a source continuity check. | Existing authenticated SSE wake hints improve responsiveness; Redis polling remains the fallback. |

**Playback handoff:** Start playing a track, open Kima Connect from the player, choose another active Kima browser, then confirm **Play here** on that browser. A failed or expired transfer leaves the original player running.

**Scope:** Kima Connect works between logged-in *Kima web players*. It does not remotely control Symfonium, Feishin or arbitrary smart speakers, does not bypass browser autoplay requirements, and does not provide synchronized multiroom or guaranteed gapless cross-device audio. A browser reporting **handled** does not guarantee audible output.

[Full v1.25.0 release notes](https://github.com/OxygenGS/kima-hub/releases/tag/v1.25.0) · [Kima Connect technical guide](docs/project-one.md) · [Changelog](CHANGELOG.md)

## Project NOVA — Flow (development preview)

**Unreleased development work, not included in stable v1.25.0.** Project NOVA
starts with **Kima Flow**, a simpler listening interface built on the existing
Vibe music-analysis engine. Choose **My favorites**, **A bit of both**, or
**Surprise me**, then adjust energy and discovery. Flow prepares a
personalized, playable queue using only indexed tracks in your local library.

This first phase deliberately does **not** auto-download music, automatically
refill a never-ending queue, or replace the original 3D Vibe map. It is
an opt-in guided listening mode that will gain safe automatic continuation
and explicit feedback in later development stages.

[Project NOVA roadmap](docs/project-nova.md)

## The experience

One music space for your favorite albums, artists, playlists and discoveries. Built for a personal library rather than a subscription catalog.

<div align="center">
  <img src="assets/screenshots/desktop-home.png" alt="Kima Hub home dashboard showing personalized listening and library discovery" width="100%" />
  <sub>Home · your library, listening and discoveries together</sub>
</div>

## Settings Studio 2.0

**New in [v1.22.0](https://github.com/OxygenGS/kima-hub/releases/tag/v1.22.0).** The old, endless settings screen is gone. A focused settings workspace now matches the rest of the OxygenGS theme: dark surfaces, warm amber accents, thoughtful spacing and clearer controls.

<div align="center">
  <img src="assets/settings-studio-showcase.svg" alt="Illustrated preview of Settings Studio 2.0, showing grouped navigation, search and the five settings categories" width="100%" />
  <sub>Illustrated preview based on the v1.22.0 interface structure; not a screenshot of a live installation.</sub>
</div>

| Find what matters | Change settings with confidence |
| :--- | :--- |
| **Five areas:** Personal, Appearance, Downloads & services, Music library, Administration. | **One active panel at a time**, rather than a giant page of unrelated options. |
| Searchable desktop navigation and mobile-friendly category shortcuts. | Unsaved inputs remain intact when switching panels, with the existing save workflow. |
| Existing deep links continue to work; obsolete navigation is removed. | Admin-only controls stay permission-restricted; existing service connections and settings APIs are preserved. |

[See all settings](docs/configuration.md) · [Read the v1.22.0 release notes](https://github.com/OxygenGS/kima-hub/releases/tag/v1.22.0)

## Made for your music

### Explore the library

<table>
<tr>
<td width="50%" align="center"><img src="assets/screenshots/desktop-library.png" alt="Kima Hub desktop music library" width="100%"/><sub>Browse your library</sub></td>
<td width="50%" align="center"><img src="assets/screenshots/desktop-artist.png" alt="Kima Hub artist overview with artwork and releases" width="100%"/><sub>Artists, albums and tracks</sub></td>
</tr>
<tr>
<td width="50%" align="center"><img src="assets/screenshots/desktop-album.png" alt="Kima Hub album details and track listing" width="100%"/><sub>Albums and track lists</sub></td>
<td width="50%" align="center"><img src="assets/screenshots/desktop-collection.png" alt="Kima Hub personal music collection" width="100%"/><sub>Your personal collection</sub></td>
</tr>
</table>

### Find your next favorite

Go beyond artist and album lists. **Vibe Map** places analyzed tracks in an interactive music space; **Mood Mixer**, radio and discovery views help you build something new from what you already have.

<table>
<tr>
<td width="50%" align="center"><img src="assets/screenshots/vibe-map.png" alt="Kima Hub Vibe Map for discovering similar-sounding music" width="100%"/><sub>Vibe Map · explore relationships between tracks</sub></td>
<td width="50%" align="center"><img src="assets/screenshots/mood-mixer.png" alt="Kima Hub Mood Mixer interface" width="100%"/><sub>Mood Mixer · shape the next listening session</sub></td>
</tr>
</table>

Vibe also includes **Match Vibe**, **Song Path** and **Blend** for listening paths and mixes built from audio similarity. [Explore the listening experience](docs/using-kima.md)

### Built for smaller screens, too

<div align="center">
<table>
<tr>
<td width="33%" align="center"><img src="assets/screenshots/mobile-home.png" alt="Kima Hub mobile home" width="100%"/></td>
<td width="33%" align="center"><img src="assets/screenshots/mobile-player.png" alt="Kima Hub full-screen mobile music player" width="100%"/></td>
<td width="33%" align="center"><img src="assets/screenshots/mobile-vibe.png" alt="Kima Hub mobile Vibe view" width="100%"/></td>
</tr>
<tr><td align="center"><sub>Home</sub></td><td align="center"><sub>Player</sub></td><td align="center"><sub>Vibe</sub></td></tr>
</table>
</div>

Responsive desktop and mobile layouts, installable browser-based PWA support and a dedicated television-browser layout. Existing repository screenshots are illustrative of product features and may differ slightly from the latest release.

## Features

| Listen & discover | Own & manage |
| :--- | :--- |
| **Music playback** — queue, shuffle, repeat, lyrics, playlists, radio and sleep timer. | **Local music library** — keep your own files and use your own storage paths. |
| **Personal discovery** — Mood Mixer, Vibe Map, Similar, Song Path, Blend and listening stats. | **Library Doctor** — inspect missing tracks, album associations and library health. |
| **Playlists** — make, reorder, share and import from supported links or M3U. | **Artwork tools** — repair missing artist imagery and album covers without overwriting curated artwork. |
| **Podcasts and audiobooks** — podcast subscriptions and optional Audiobookshelf playback. | **Downloads** — per-user Kima job history with optional Lidarr and Soulseek workflows. |
| **Modern music clients** — compatible OpenSubsonic players, including Symfonium and Feishin. | **Server controls** — separate users and roles, 2FA, branding, language and audio quality settings. |
| **Kima Connect** — private browser-device discovery, consent-based queue transfer and remote playback control. | **Safe handoff** — playback confirmation, bounded Redis commands, timeout recovery and SSE fallback. |

### Connect the tools you already use

| Integration | What it adds |
| :--- | :--- |
| **Lidarr** | Request albums using your existing automation and library-import workflow. |
| **Soulseek / slskd** | Search for and download individual tracks using the built-in client or an external slskd server. |
| **OpenSubsonic** | Connect compatible music apps, including **Symfonium** and **Feishin**; per-client Native Apps keys support modern authentication without requiring legacy login modes. |
| **Audiobookshelf** | Bring audiobooks and podcast libraries into your listening space. |
| **ListenBrainz** | Optional scrobbling and listening-related recommendations. |
| **Fanart.tv / AcoustID** | Optional artwork enrichment and audio identification. |

Services are optional: Kima runs as a self-hosted music server without requiring Lidarr, Soulseek or Audiobookshelf. The experimental **Downtify connector was retired in v1.21.0** and is **not** part of the current app; previously imported files and historical database records are preserved.

[Integration guide](docs/integrations.md) · [Native music clients](docs/subsonic.md) · [Library Doctor](docs/library-doctor.md) · [Privacy](PRIVACY.md)

## Quick start

**Current stable version:** [v1.25.0](https://github.com/OxygenGS/kima-hub/releases/tag/v1.25.0) · **Image:** `ghcr.io/oxygengs/kima-hub:v1.25.0` · **Platforms:** `linux/amd64` and `linux/arm64`.

**Versioned image:** `ghcr.io/oxygengs/kima-hub:v1.25.0`

Kima Connect is included in this stable image. Existing Lidarr, Soulseek, Settings Studio, library artwork and modern OpenSubsonic integrations remain available. [What changed](#whats-new-in-v1250--kima-connect).

The all-in-one image bundles the frontend, API, PostgreSQL, Redis and audio-analysis services. All you need is Docker, a real music directory and a persistent `/data` volume.

### Docker — new installations only

```bash
docker run -d \
  --name kima \
  --restart unless-stopped \
  -p 3030:3030 \
  -v /absolute/path/to/music:/music \
  -v kima_data:/data \
  ghcr.io/oxygengs/kima-hub:v1.25.0
```

Replace `/absolute/path/to/music` with an **existing** host directory holding your music. Open **http://localhost:3030** from the Docker host and finish the first-run setup.

### Docker Compose / Dockge — new installations only

The [production Compose file](docker-compose.prod.yml) defaults to the published, versioned v1.25.0 image and requires `MUSIC_PATH` to point to an existing music directory. Set `VERSION` explicitly to the version you have reviewed; do not replace an existing Dockge/Compose stack with this example.

```bash
MUSIC_PATH=/absolute/path/to/music VERSION=v1.25.0 \
  docker compose -f docker-compose.prod.yml up -d
```

The [optional companion stack](docker-compose.server.yml) includes additional media services if you choose to run them. [Full installation guide](docs/install.md)

> [!IMPORTANT]
> **Already running Kima? Do not replace your existing Compose/Dockge stack with these new-install examples.** Preserve the original project name, complete `/data` volume, and existing `/music` and `/downloads` mounts. Back up the **stopped** `/data` volume, verify a separate restore and only then change a pinned image version. Database migrations may make a rollback without the original data backup impossible. See [safe updates and recovery](docs/safe-aio-updates.md).

## Security and release quality

- [v1.25.0 native preflight](https://github.com/OxygenGS/kima-hub/actions/runs/43942681293) and [published AMD64/ARM64 images](https://github.com/OxygenGS/kima-hub/actions/runs/43945829307) passed the configured release gates. Publication does **not** automatically change any running installation or promote the `:latest` alias.
- The v1.25.0 native preflight recorded **393 HIGH / 8 CRITICAL** advisories (AMD64) and **392 HIGH / 8 CRITICAL** (ARM64), with **no scanner-listed fixes**. The additional FFmpeg findings compared with v1.24.1 still require risk-aware operation; a green build is not a clean security scan.
- Keep Kima behind appropriate network access controls, maintain host and proxy updates, and protect account credentials. Before upgrades, verify a **separately restorable, complete cold backup** of `/data`. Do not change existing media mounts or Compose project identity casually.

[Security policy](SECURITY.md) · [Image-security evidence](docs/image-security.md) · [Safe AIO upgrades](docs/safe-aio-updates.md) · [Privacy policy](PRIVACY.md)

## Documentation

| Start exploring | Operate and improve |
| :--- | :--- |
| [Install & upgrade](docs/install.md) | [Settings Studio & configuration](docs/configuration.md) |
| [Using Kima](docs/using-kima.md) | [Administration](docs/administration.md) |
| [Integrations](docs/integrations.md) | [Library health & repairs](docs/library-doctor.md) |
| [Symfonium, Feishin & OpenSubsonic](docs/subsonic.md) | [Image security](docs/image-security.md) |
| [User permissions](docs/user-permissions.md) | [Safe backups & rollback](docs/safe-aio-updates.md) |
| [Full changelog](CHANGELOG.md) | [Development](docs/development.md) |
| [Branding](docs/instance-branding.md) | [Upstream compatibility](docs/upstream-compatibility.md) |

## About the fork

**OxygenGS Kima Hub** is an independent community fork of [Kima Hub by Chevron7Locked](https://github.com/Chevron7Locked/kima-hub), not an official upstream release. The aim is to make a more polished, capable and approachable self-hosted music application while keeping upstream improvements practical to integrate.

Licensed under [GNU GPL v3.0](LICENSE). Original contributions and third-party components remain with their respective owners; see the [audio model notices](services/audio-analyzer/models/LICENSE-upf-models).

<div align="center">

**Your music. Your space. Your server.**

[Releases](https://github.com/OxygenGS/kima-hub/releases) · [Installation](docs/install.md) · [Changelog](CHANGELOG.md)

</div>
