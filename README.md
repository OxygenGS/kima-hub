<div align="center">

<img src="assets/readme-header.svg" width="100%" alt="Kima Hub — Your music. Your space." />

# Kima Hub

**Your music. Your server. Your way to listen.**

The **OxygenGS fork**: a self-hosted music server with fast browsing, modern music-player support, artwork recovery and controlled download integrations.

[![Stable v1.21.0](https://img.shields.io/badge/stable-v1.21.0-ffb000?style=flat-square)](https://github.com/OxygenGS/kima-hub/releases/tag/v1.21.0)
[![Docker](https://img.shields.io/badge/OCI-GHCR-2779bd?style=flat-square&logo=docker&logoColor=white)](https://github.com/OxygenGS/kima-hub/pkgs/container/kima-hub)
[![AMD64 + ARM64](https://img.shields.io/badge/Linux-amd64%20%7C%20arm64-4c6473?style=flat-square)](https://github.com/OxygenGS/kima-hub/actions/workflows/docker-publish.yml)
[![English + Dutch](https://img.shields.io/badge/UI-English%20%7C%20Dutch-6554ad?style=flat-square)](docs/internationalization.md)
[![GPLv3](https://img.shields.io/badge/License-GPLv3-555555?style=flat-square)](LICENSE)

[Published release](#published-release-and-current-source) · [Features](#features) · [Installation](#installation) · [Security](#security-and-upgrades) · [Documentation](#documentation)

</div>

---

## Published release and current source

**Latest stable release: [v1.21.0](https://github.com/OxygenGS/kima-hub/releases/tag/v1.21.0)** (12 November 2026). This release removes the experimental Downtify integration, including its UI, native import jobs, API endpoints and staging integration. Lidarr, Soulseek and previously imported music remain available. Existing Docker installations are not automatically upgraded.

This fork focuses on local music playback, modern OpenSubsonic apps, Lidarr, Soulseek, artwork recovery, fast browsing and library health checks. Existing music and persistent data remain under the operator's control.

[Release history](CHANGELOG.md) · [Update safety](docs/safe-aio-updates.md)

## Features

| Listen | Discover | Manage |
| :--- | :--- | :--- |
| Stream your local tracks, albums, artists and playlists; queue, lyrics, shuffle, repeat and sleep timer. | Mood Mixer, Vibe Map, artist radio, personalized recommendations and listening history. | Library Doctor, Smart Download Inbox, artwork recovery, individual user permissions and download history. |
| Web playback, installable PWA where supported, plus compatible OpenSubsonic apps. | Fast artist pages, typo-tolerant search and music-library enrichment. | Optional Lidarr, Soulseek, Audiobookshelf and podcasts. |

### Library and artwork

- Repair missing **album covers** and **artist photos** from **Settings → Artwork**, in bounded manual batches. Keep existing good or manually chosen images.
- Review suspicious tracks, album associations and imports in **Library Doctor** and **Smart Download Inbox** before making supported corrections.
- Soulseek downloads and locally indexed singles are treated separately from catalog previews; a playable local recording is not mistaken for ownership of an entire album.

### Native music players

**Symfonium and Feishin** work with the existing OpenSubsonic API. Generate a unique token for each client under **Settings → Native Apps**. New tokens support modern authentication without enabling legacy authentication; Symfonium can also operate with Compatibility Mode disabled.

[Native-client instructions](docs/subsonic.md) · [Library Doctor](docs/library-doctor.md) · [Internationalization](docs/internationalization.md)

## Download Manager

The **Downloads** page shows the current account's Kima jobs for Lidarr and Soulseek. It does not offer a separate external-provider queue, Spotify request submission or automatic third-party import. Library files already imported by older releases remain untouched.

[Download permissions](docs/user-permissions.md) · [Lidarr and Soulseek setup](docs/integrations.md)

## Installation

**Versioned image:** `ghcr.io/oxygengs/kima-hub:v1.21.0`

**Platforms:** `linux/amd64`, `linux/arm64` · **Web/API:** port `3030`.

The All-in-One image includes Kima, PostgreSQL, Redis and music-analysis services. Keep the music library and application data on persistent volumes.

### Docker

```bash
docker run -d \
  --name kima \
  -p 3030:3030 \
  -v /absolute/path/to/music:/music \
  -v kima_data:/data \
  --restart unless-stopped \
  ghcr.io/oxygengs/kima-hub:v1.21.0
```

Open `http://localhost:3030` to complete the first-run setup. Replace the example music path with your own.

### Docker Compose / Dockge

Use [docker-compose.prod.yml](docker-compose.prod.yml). Set a real, existing music directory. The example pins the published `v1.21.0` image, never `:latest`. Existing deployments must preserve their Compose identity, media mounts and verified `/data` backups when updating:

```bash
MUSIC_PATH=/absolute/path/to/music VERSION=v1.21.0 docker compose -f docker-compose.prod.yml up -d
```

**New installs:** `MUSIC_PATH` is mandatory; Docker Compose will not create an absent host music directory. An existing directory is not proof that a removable or network disk is mounted—verify the actual backing storage. **Existing installs:** keep the original Compose project, `/music` and `/data` mounts, and the running version pinned until a verified backup/restore and controlled upgrade. The fixed example tag never follows `:latest`.

[Full installation guide](docs/install.md) · [Configuration](docs/configuration.md)

## Security and upgrades

- Before upgrading an existing image, make a **complete cold backup of the original persistent `/data` volume**, plus configuration and secrets, and verify an **independent restore**.
- v1.21.0 retires the Downtify application code but preserves the historical receipt tables and migrations created by v1.18.0-v1.20.0. A **container downgrade alone does not reverse migrations**; rollback requires a pre-upgrade `/data` backup.
- Preserve user permissions, original media mounts, third-party import services and any reverse-proxy restrictions. Use HTTPS for remote access.
- The native AMD64/ARM64 builds and configured security gates passed. **Residual HIGH/CRITICAL dependency advisories without published fixes remain**, and a passing scan does not prove the container is vulnerability-free.
- No release action in this repository changes a user's running host, Docker installation or storage mounts.

[Image security and known residual advisories](docs/image-security.md) · [Native release preflights](https://github.com/OxygenGS/kima-hub/actions/workflows/v112-native-preflight.yml) · [Stable publisher](https://github.com/OxygenGS/kima-hub/actions/workflows/docker-publish.yml) · [Safe updates and rollback](docs/safe-aio-updates.md) · [Security policy](SECURITY.md)

## Documentation

| Start | Configure | Explore |
| :--- | :--- | :--- |
| [Installation](docs/install.md) | [Administration](docs/administration.md) | [Using Kima](docs/using-kima.md) |
| [Safe updates](docs/safe-aio-updates.md) | [Integrations](docs/integrations.md) | [Download Manager](docs/unified-download-manager.md) |
| [Configuration](docs/configuration.md) | [Download preferences](docs/configuration.md) | [Native clients](docs/subsonic.md) |
| [Releases](https://github.com/OxygenGS/kima-hub/releases) | [Image security](docs/image-security.md) | [Language settings](docs/internationalization.md) |

[Contribution guidelines](CONTRIBUTING.md) · [Upstream compatibility](docs/upstream-compatibility.md) · [Security reporting](SECURITY.md)

## Credits and license

An independently maintained fork of [Kima Hub by Chevron7Locked](https://github.com/Chevron7Locked/kima-hub). Original functionality and third-party dependencies retain their respective authorship and licensing. This fork is **not** an official upstream release.

Licensed under [GNU GPL v3.0](LICENSE); see the separate [model notices](services/audio-analyzer/models/LICENSE-upf-models).
