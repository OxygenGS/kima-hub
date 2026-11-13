<div align="center">

<img src="assets/readme-header.svg" alt="Kima Hub — Your music. Your space." width="100%" />

# Kima Hub

**Your music. Your space. Your server.**

A modern, self-hosted music experience. **OxygenGS** builds on the original Kima Hub with a polished interface, responsive library browsing, modern music-client authentication and carefully integrated download tools.

[![Stable v1.22.0](https://img.shields.io/badge/stable-v1.22.0-ffb000?style=flat-square)](https://github.com/OxygenGS/kima-hub/releases/tag/v1.22.0)
[![Container](https://img.shields.io/badge/container-GHCR-2779bd?style=flat-square&logo=docker&logoColor=white)](https://github.com/OxygenGS/kima-hub/pkgs/container/kima-hub)
[![Linux AMD64 + ARM64](https://img.shields.io/badge/Linux-amd64%20%7C%20arm64-4c6473?style=flat-square)](https://github.com/OxygenGS/kima-hub/actions/workflows/docker-publish.yml)
[![English + Dutch](https://img.shields.io/badge/UI-English%20%7C%20Dutch-6554ad?style=flat-square)](docs/internationalization.md)
[![GPLv3](https://img.shields.io/badge/license-GPLv3-555555?style=flat-square)](LICENSE)

**[Download / Releases](https://github.com/OxygenGS/kima-hub/releases)** · **[Installation](docs/install.md)** · **[Features](#what-you-get)** · **[Configuration](docs/configuration.md)** · **[Security](SECURITY.md)**

</div>

---

## Current release

**Kima Hub [v1.22.0](https://github.com/OxygenGS/kima-hub/releases/tag/v1.22.0)** — published **13 November 2026**, with native **linux/amd64** and **linux/arm64** images.

This release introduces **Settings Studio 2.0**: a redesigned configuration experience, built for the same dark, refined look as the rest of the OxygenGS fork. It preserves the existing settings APIs, permissions, configured services and music library. [What's new in v1.22.0](https://github.com/OxygenGS/kima-hub/releases/tag/v1.22.0)

### Settings Studio 2.0

| Clear navigation | A better editing experience |
| :--- | :--- |
| Five organized areas: **Personal, Appearance, Downloads & Services, Music Library, Administration**. | Focus on one settings panel at a time instead of scrolling through every option. |
| A searchable sidebar on desktop, with an active-section indicator. | Consistent cards, inputs, switches, spacing and keyboard focus. |
| Category shortcuts and grouped navigation on mobile. | Unsaved changes remain available when switching panels; administrator-only tools remain restricted. |

## What you get

| Listen & explore | Library & server |
| :--- | :--- |
| **Music playback** — artists, albums, tracks, playlists, lyrics, queue, shuffle, repeat and sleep timer. | **Library Doctor** — review missing or suspicious tracks and album associations before correcting them. |
| **Discover music** — Mood Mixer, Vibe Map, radio, search and personalized listening views. | **Artwork recovery** — manually repair missing album covers and artist images while preserving good artwork. |
| **Fast, responsive UI** — improved artist and library pages, desktop and mobile layouts. | **Download Manager** — per-user Kima job history, with optional Lidarr and Soulseek connections. |
| **Music players** — web app plus compatible OpenSubsonic clients, including Symfonium and Feishin. | **Self-hosted control** — user roles, acquisition permissions, encrypted stored credentials and persistent data volumes. |

### Modern OpenSubsonic clients

Create a separate key for each supported music client in **Settings → Personal → Native Apps**. Newly generated tokens support modern authentication without requiring legacy authentication; Symfonium can also work with Compatibility Mode disabled.

[Client setup](docs/subsonic.md) · [User permissions](docs/user-permissions.md)

### Optional integrations

- **Lidarr** — request and manage albums through your existing music automation setup.
- **Soulseek** — search and download individual tracks through the built-in P2P client or an external slskd service.
- **Audiobookshelf** — connect audiobook and podcast libraries.
- **ListenBrainz** — optional scrobbling and listening-related metadata.

The experimental Downtify connector was retired in **v1.21.0**. It is **not** part of the current application. Previously imported music and historical database records are retained.

[Integrations](docs/integrations.md) · [Using Kima](docs/using-kima.md) · [Administration](docs/administration.md)

## Installation

**Versioned image:** `ghcr.io/oxygengs/kima-hub:v1.22.0`

The published All-in-One container includes the web application, backend, PostgreSQL, Redis and bundled audio-analysis services. You supply a real music directory and persistent storage for application data.

### Docker — new installations

```bash
# Replace the example path with an existing host directory containing your music.
docker run -d \
  --name kima \
  -p 3030:3030 \
  -v /absolute/path/to/music:/music \
  -v kima_data:/data \
  --restart unless-stopped \
  ghcr.io/oxygengs/kima-hub:v1.22.0
```

Open **http://localhost:3030** from the Docker host to complete the initial setup.

### Docker Compose / Dockge

Use [docker-compose.prod.yml](docker-compose.prod.yml) for a standalone all-in-one installation. It pins `v1.22.0`, not a moving `:latest` tag, and requires `MUSIC_PATH` to identify an **existing** music directory.

```bash
MUSIC_PATH=/absolute/path/to/music VERSION=v1.22.0 docker compose -f docker-compose.prod.yml up -d
```

The [optional full-stack example](docker-compose.server.yml) adds separately configured media services; do not deploy those services unless you need them.

**Existing installations:** Do **not** run a fresh-install command over an existing stack. Keep the original Compose/Dockge project name, `/data` volume and `/music` and `/downloads` mounts. Verify an independent backup and restore before changing the pinned image.

[Full installation and upgrade guide](docs/install.md) · [Safe backups and rollback](docs/safe-aio-updates.md)

## Security & update policy

- Back up the **complete, stopped** `/data` volume, including generated secrets, and test restoration into a separate volume before upgrading. A Docker image downgrade does not reverse database migrations.
- Preserve the existing media mount and application permissions. Never use `docker compose down -v` when the current data must survive.
- Stable releases require exact-source native AMD64/ARM64 builds, image scans and explicit security review. **Passing scans does not mean the image has no vulnerabilities.**
- The v1.22.0 preflight reported remaining HIGH and CRITICAL findings without scanner-listed patched versions. Review the [published report](docs/image-security.md) and your own network exposure before deployment.
- GitHub releases and pull requests do **not** update anyone's running Docker host automatically.

[Security policy](SECURITY.md) · [Image advisories](docs/image-security.md) · [Privacy](PRIVACY.md) · [Safe upgrades](docs/safe-aio-updates.md)

## Documentation

| Get started | Configure and maintain |
| :--- | :--- |
| [Install or update](docs/install.md) | [Configuration & Settings Studio](docs/configuration.md) |
| [Using Kima](docs/using-kima.md) | [Lidarr, Soulseek and other integrations](docs/integrations.md) |
| [OpenSubsonic music clients](docs/subsonic.md) | [Library health and repair](docs/library-doctor.md) |
| [Release history](CHANGELOG.md) | [Image security and known risks](docs/image-security.md) |
| [Development](docs/development.md) | [Upstream compatibility](docs/upstream-compatibility.md) |

## Credits & license

OxygenGS is an independent fork of [Kima Hub by Chevron7Locked](https://github.com/Chevron7Locked/kima-hub), not an official upstream release. Original contributions, third-party components and model licenses remain with their respective authors.

Licensed under [GNU GPL v3.0](LICENSE). Additional [model notices](services/audio-analyzer/models/LICENSE-upf-models) apply.
