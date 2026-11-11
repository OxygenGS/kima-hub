<div align="center">

<img src="assets/readme-header.svg" width="100%" alt="Kima Hub — Your music. Your space." />

# Kima Hub

**Your music. Your server. Your way to listen.**

The **OxygenGS fork**: a self-hosted music server with fast browsing, modern music-player support, artwork recovery and controlled download integrations.

[![Stable v1.20.0](https://img.shields.io/badge/stable-v1.20.0-ffb000?style=flat-square)](https://github.com/OxygenGS/kima-hub/releases/tag/v1.20.0)
[![Docker](https://img.shields.io/badge/OCI-GHCR-2779bd?style=flat-square&logo=docker&logoColor=white)](https://github.com/OxygenGS/kima-hub/pkgs/container/kima-hub)
[![AMD64 + ARM64](https://img.shields.io/badge/Linux-amd64%20%7C%20arm64-4c6473?style=flat-square)](https://github.com/OxygenGS/kima-hub/actions/workflows/docker-publish.yml)
[![English + Dutch](https://img.shields.io/badge/UI-English%20%7C%20Dutch-6554ad?style=flat-square)](docs/internationalization.md)
[![GPLv3](https://img.shields.io/badge/License-GPLv3-555555?style=flat-square)](LICENSE)

[Latest release](#latest-release) · [Features](#features) · [Downtify](#downtify-integration) · [Installation](#installation) · [Security](#security-and-upgrades) · [Documentation](#documentation)

</div>

---

## Latest release

### v1.20.0 — Native Downtify imports, with optional Lidarr ownership

**Release candidate validated 11 November 2026.** Kima can automatically discover newly completed single-track Downtify downloads, verify the original audio, and import it into Kima or let Lidarr manage the final library file.

- **Automatic, opt-in imports:** only newly observed, owner-bound individual tracks after activation. Previous downloads are not re-imported.
- **Optional Lidarr handoff:** Kima verifies and stages the recording; Lidarr assigns its own artist, album, track and final filename. Kima then indexes the same final file.
- **Two independent receipts:** exact registered Lidarr TrackFile and complete SHA-256 first, then a Kima scanner/index receipt. Completed commands alone are never counted as imported.
- **Safe defaults:** native imports start OFF, Lidarr is not required, and no existing Kima recordings, persistent volumes or storage mounts are automatically moved.

A pre-release end-to-end canary confirmed correct album association and playback in both apps. This does not replace host-specific mount and backup checks.

[Release notes](https://github.com/OxygenGS/kima-hub/releases/tag/v1.20.0) · [Native importer](docs/downtify-native-auto-import.md) · [Lidarr handoff](docs/downtify-lidarr-managed-handoff.md) · [Changelog](CHANGELOG.md)

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
| Verified single-track auto-import | Explicit admin opt-in after a new-download baseline, music-volume proof and full original audio/metadata/hash validation. No automatic backfill. |
| Optional Lidarr-managed import | Separate shared staging mount, unique MusicBrainz artist/album/track match and Lidarr-managed final path. The Kima-only default works without Lidarr. |
| Independent library receipts | Lidarr TrackFile and physical SHA-256 are confirmed separately from Kima indexing; settings display distinct progress counters. |

**Importing remains OFF until enabled.** Single-track importing does not dispatch entire albums or playlists, erase source files, overwrite Lidarr-managed recordings, migrate existing RC6 paths, or automatically replace another importer. Administrators must establish a working storage mount, restorable backup and exclusive media writer before enabling it. [Kima native importer](docs/downtify-native-auto-import.md) · [Lidarr-managed setup](docs/downtify-lidarr-managed-handoff.md).

[Downtify setup and limitations](docs/downtify-settings.md) · [Download Manager design](docs/unified-download-manager.md) · [User permissions](docs/user-permissions.md)

## Installation

**Versioned image:** `ghcr.io/oxygengs/kima-hub:v1.20.0`

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
  ghcr.io/oxygengs/kima-hub:v1.20.0
```

Open `http://localhost:3030` to complete the first-run setup. Replace the example music path with your own.

### Docker Compose / Dockge

Use [docker-compose.prod.yml](docker-compose.prod.yml). Set a real, existing music directory. The new-installation image default is pinned to `v1.20.0`, not `:latest`:

```bash
MUSIC_PATH=/absolute/path/to/music VERSION=v1.20.0 docker compose -f docker-compose.prod.yml up -d
```

**New installs:** `MUSIC_PATH` is mandatory; Docker Compose will not create an absent host music directory. An existing directory is not proof that a removable or network disk is mounted—verify the actual backing storage. **Existing installs:** keep the original Compose project, `/music` and `/data` mounts, and the running version pinned until a verified backup/restore and controlled upgrade. The fixed example tag never follows `:latest`.

[Full installation guide](docs/install.md) · [Configuration](docs/configuration.md)

## Security and upgrades

- Before upgrading an existing image, make a **complete cold backup of the original persistent `/data` volume**, plus configuration and secrets, and verify an **independent restore**.
- v1.20.0 adds native-import and Lidarr-managed receipt tables/fields through additive PostgreSQL migrations on top of v1.19.0 pairing. A **container downgrade alone does not reverse migrations**; rollback requires a pre-upgrade `/data` backup.
- Preserve user permissions, original media mounts, third-party import services and any reverse-proxy restrictions. Use HTTPS for remote access.
- The native AMD64/ARM64 builds and configured security gates passed. **Residual HIGH/CRITICAL dependency advisories without published fixes remain**, and a passing scan does not prove the container is vulnerability-free.
- No release action in this repository changes a user's running host, Docker installation or storage mounts.

[Image security and known residual advisories](docs/image-security.md) · [Native release preflights](https://github.com/OxygenGS/kima-hub/actions/workflows/v112-native-preflight.yml) · [Stable publisher](https://github.com/OxygenGS/kima-hub/actions/workflows/docker-publish.yml) · [Safe updates and rollback](docs/safe-aio-updates.md) · [Security policy](SECURITY.md)

## Documentation

| Start | Configure | Explore |
| :--- | :--- | :--- |
| [Installation](docs/install.md) | [Administration](docs/administration.md) | [Using Kima](docs/using-kima.md) |
| [Safe updates](docs/safe-aio-updates.md) | [Integrations](docs/integrations.md) | [Download Manager](docs/unified-download-manager.md) |
| [Configuration](docs/configuration.md) | [Downtify settings](docs/downtify-settings.md) | [Native clients](docs/subsonic.md) |
| [Releases](https://github.com/OxygenGS/kima-hub/releases) | [Image security](docs/image-security.md) | [Language settings](docs/internationalization.md) |

[Contribution guidelines](CONTRIBUTING.md) · [Upstream compatibility](docs/upstream-compatibility.md) · [Security reporting](SECURITY.md)

## Credits and license

An independently maintained fork of [Kima Hub by Chevron7Locked](https://github.com/Chevron7Locked/kima-hub). Original functionality and third-party dependencies retain their respective authorship and licensing. This fork is **not** an official upstream release.

Licensed under [GNU GPL v3.0](LICENSE); see the separate [model notices](services/audio-analyzer/models/LICENSE-upf-models).
