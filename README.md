<div align="center">

<img src="assets/readme-header.svg" width="100%" alt="Kima Hub — Your music. Your space." />

# Kima Hub

**Your music. Your server. Your way to listen.**

The **OxygenGS fork**: a self-hosted music server with fast browsing, modern music-player support, artwork recovery and controlled download integrations.

[![Stable v1.19.0](https://img.shields.io/badge/stable-v1.19.0-ffb000?style=flat-square)](https://github.com/OxygenGS/kima-hub/releases/tag/v1.19.0)
[![Docker](https://img.shields.io/badge/OCI-GHCR-2779bd?style=flat-square&logo=docker&logoColor=white)](https://github.com/OxygenGS/kima-hub/pkgs/container/kima-hub)
[![AMD64 + ARM64](https://img.shields.io/badge/Linux-amd64%20%7C%20arm64-4c6473?style=flat-square)](https://github.com/OxygenGS/kima-hub/actions/runs/42397561696)
[![English + Dutch](https://img.shields.io/badge/UI-English%20%7C%20Dutch-6554ad?style=flat-square)](docs/internationalization.md)
[![GPLv3](https://img.shields.io/badge/License-GPLv3-555555?style=flat-square)](LICENSE)

[Latest release](#latest-release) · [Features](#features) · [Downtify](#downtify-integration) · [Installation](#installation) · [Security](#security-and-upgrades) · [Documentation](#documentation)

</div>

---

## Latest release

### v1.19.0 — Downtify settings and secure pairing

**Published 7 November 2026.** Kima administrators can now open **Settings → Integrations → Downtify** to test a Downtify connection, pair a device token and enable specific functions without editing the container environment.

- **Admin-managed pairing:** verify the actual Downtify server and device account before storing the token encrypted at rest.
- **Four opt-in switches:** owner-scoped remote queue, saved Spotify track requests, manually confirmed single-track submission and manual remote-status checks.
- **Safe migration:** existing Docker-managed Downtify settings remain separate until explicitly migrated. Re-pairing turns all functions OFF.
- **No import takeover:** the existing music library, external Importer v5 and storage mounts are unchanged.

[Release notes](https://github.com/OxygenGS/kima-hub/releases/tag/v1.19.0) · [Downtify setup](docs/downtify-settings.md) · [Changelog](CHANGELOG.md)

## Features

| Listen | Discover | Manage |
| :--- | :--- | :--- |
| Stream your local tracks, albums, artists and playlists; queue, lyrics, shuffle, repeat and sleep timer. | Mood Mixer, Vibe Map, artist radio, personalized recommendations and listening history. | Library Doctor, Smart Download Inbox, artwork recovery, individual user permissions and download history. |
| Web playback, installable PWA where supported, plus compatible OpenSubsonic apps. | Fast artist pages, typo-tolerant search and music-library enrichment. | Optional Lidarr, Soulseek, Audiobookshelf, podcasts and Downtify integration. |

### Library and artwork

- Repair missing **album covers** and **artist photos** from **Settings → Artwork**, in bounded manual batches. Keep existing good or manually chosen images.
- Review suspicious tracks, album associations and imports in **Library Doctor** and **Smart Download Inbox** before making supported corrections.
- Soulseek downloads and locally indexed singles are treated separately from catalog previews; a playable local recording is not mistaken for ownership of an entire album.

### Native music players

**Symfonium and Feishin** work with the existing OpenSubsonic API. Generate a unique token for each client under **Settings → Native Apps**. New tokens support modern authentication without enabling legacy authentication; Symfonium can also operate with Compatibility Mode disabled.

[Native-client instructions](docs/subsonic.md) · [Library Doctor](docs/library-doctor.md) · [Internationalization](docs/internationalization.md)

## Downtify integration

The **Downloads** screen shows permission-filtered jobs and saved Spotify track requests. The new administrator panel lives under **Settings → Integrations → Downtify**.

| Function | Behaviour |
| :--- | :--- |
| Connection and pairing | Test an authenticated Downtify API v1 instance; save one encrypted device pairing linked to a Kima administrator. |
| Owner-scoped queue | Display only jobs that pass the configured server, remote account and user-ownership checks. |
| Spotify track requests | Save individual track links for permitted users without automatically starting a download. |
| Manual track submission | Submit **one prepared track** only after an explicit acknowledgement and duplicate/identity checks. Uncertain submissions are not automatically retried. |
| Manual remote checks | Read owner-bound remote job state. A completed Downtify job is **not** proof that Kima imported the recording. |
| Advanced audio evidence | Read-only source/header/decode/tag checks exist for operator-managed environments, but are **not unlocked by the browser pairing**. They require a separately reviewed read-only staging mount. |

**Not included:** automatic album/playlist dispatch through Downtify, automatic SSD-to-DAS copying, scanner/index receipts, file deletion or replacement of external Importer v5. Every new switch starts **OFF**.

[Downtify setup and limitations](docs/downtify-settings.md) · [Download Manager design](docs/unified-download-manager.md) · [User permissions](docs/user-permissions.md)

## Installation

**Stable image:** `ghcr.io/oxygengs/kima-hub:v1.19.0` · **Platforms:** `linux/amd64`, `linux/arm64` · **Web/API:** port `3030`.

The All-in-One image includes Kima, PostgreSQL, Redis and music-analysis services. Keep the music library and application data on persistent volumes.

### Docker

```bash
docker run -d \
  --name kima \
  -p 3030:3030 \
  -v /absolute/path/to/music:/music \
  -v kima_data:/data \
  --restart unless-stopped \
  ghcr.io/oxygengs/kima-hub:v1.19.0
```

Open `http://localhost:3030` to complete the first-run setup. Replace the example music path with your own.

### Docker Compose / Dockge

Use [docker-compose.prod.yml](docker-compose.prod.yml) and set the version explicitly:

```bash
MUSIC_PATH=/absolute/path/to/music VERSION=v1.19.0 docker compose -f docker-compose.prod.yml up -d
```

**Do not replace the Compose project, `/music` or `/data` mounts when upgrading an existing installation.** The example Compose file has a conservative fallback version; `:latest` is not automatically promoted.

[Full installation guide](docs/install.md) · [Configuration](docs/configuration.md)

## Security and upgrades

- Before upgrading an existing image, make a **complete cold backup of the original persistent `/data` volume**, plus configuration and secrets, and verify an **independent restore**.
- v1.19.0 adds the `DowntifyIntegration` PostgreSQL table. A **container downgrade alone does not reverse migrations**. Rolling back across them requires the pre-upgrade data backup.
- Preserve user permissions, original media mounts, third-party import services and any reverse-proxy restrictions. Use HTTPS for remote access.
- The native AMD64/ARM64 builds and configured security gates passed. **Residual HIGH/CRITICAL dependency advisories without published fixes remain**, and a passing scan does not prove the container is vulnerability-free.
- No release action in this repository changes a running Proxmox, Docker or NAS installation.

[Published image security assessment](docs/image-security.md) · [v1.19.0 native preflight](https://github.com/OxygenGS/kima-hub/actions/runs/42394711879) · [Stable publication](https://github.com/OxygenGS/kima-hub/actions/runs/42397561696) · [Safe updates and rollback](docs/safe-aio-updates.md) · [Security policy](SECURITY.md)

## Documentation

| Start | Configure | Explore |
| :--- | :--- | :--- |
| [Installation](docs/install.md) | [Administration](docs/administration.md) | [Using Kima](docs/using-kima.md) |
| [Safe updates](docs/safe-aio-updates.md) | [Integrations](docs/integrations.md) | [Download Manager](docs/unified-download-manager.md) |
| [Configuration](docs/configuration.md) | [Downtify settings](docs/downtify-settings.md) | [Native clients](docs/subsonic.md) |
| [Releases](https://github.com/OxygenGS/kima-hub/releases) | [Image security](docs/image-security.md) | [Language settings](docs/internationalization.md) |

[Issues](https://github.com/OxygenGS/kima-hub/issues) · [Contribution guidelines](CONTRIBUTING.md) · [Upstream compatibility](docs/upstream-compatibility.md)

## Credits and license

An independently maintained fork of [Kima Hub by Chevron7Locked](https://github.com/Chevron7Locked/kima-hub). Original functionality and third-party dependencies retain their respective authorship and licensing. This fork is **not** an official upstream release.

Licensed under [GNU GPL v3.0](LICENSE); see the separate [model notices](services/audio-analyzer/models/LICENSE-upf-models).
