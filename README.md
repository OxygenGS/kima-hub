<div align="center">

<img src="assets/readme-header.svg" width="100%" alt="Kima Hub — Your music. Your space." />

# Kima Hub

### Your music. Your server. Your way to listen.

**OxygenGS fork** · A modern, self-hosted music server for the collection you own.

Stream your library, discover what to play next, repair missing artwork and manage your music on infrastructure you control.

[![Stable v1.18.0](https://img.shields.io/badge/stable-v1.18.0-ffb000?style=flat-square)](https://github.com/OxygenGS/kima-hub/releases/tag/v1.18.0)
[![Docker / GHCR](https://img.shields.io/badge/Docker-GHCR-2779bd?style=flat-square&logo=docker&logoColor=white)](https://github.com/OxygenGS/kima-hub/pkgs/container/kima-hub)
[![AMD64 & ARM64](https://img.shields.io/badge/Linux-amd64%20%7C%20arm64-4c6473?style=flat-square)](https://github.com/OxygenGS/kima-hub/actions/runs/42182749230)
[![English / Dutch](https://img.shields.io/badge/UI-English%20%2F%20Dutch-6554ad?style=flat-square)](docs/internationalization.md)
[![GPLv3](https://img.shields.io/badge/License-GPLv3-555555?style=flat-square)](LICENSE)

**[What's new](#latest-stable-release) · [Features](#features) · [Downloads](#unified-download-manager) · [Install](#installation) · [Native apps](#symfonium--feishin) · [Docs](#documentation)**

</div>

---

## Latest stable release

### v1.18.0 — Unified Download Manager, first stage

**Published November 6, 2026.** The new **Downloads** screen combines a permission-aware overview of existing download jobs with a guarded Spotify request workflow and optional Downtify integration. The release also adds a manual, read-only verification sequence for completed Downtify tracks. Existing Soulseek, Lidarr and library-import behavior remain intact.

**[Read the v1.18.0 release notes](https://github.com/OxygenGS/kima-hub/releases/tag/v1.18.0)** · [Changelog](CHANGELOG.md) · [Safe upgrade guide](docs/safe-aio-updates.md)

> **Important:** This release does **not** automatically import Downtify music to your storage or replace external Importer v5. Downtify submission and source/audio verification are **disabled by default**. Two additive database migrations require a complete, independently restorable `/data` backup before upgrading.

## Features

| Listen | Discover | Manage |
| :--- | :--- | :--- |
| Your own artists, albums, tracks, playlists and queue, with responsive playback, lyrics, shuffle, repeat, seeking and a sleep timer. | Mood Mixer, Vibe Map, artist radio, personalized recommendations, listening history and local-library discovery. | Per-account music permissions, EN/NL interface coverage, configurable instance branding, native-client tokens and a unified download overview. |
| Installable web app (PWA) where supported, plus OpenSubsonic-compatible players. | Fast artist pages, accent-aware search, typo-tolerant fallback and Library Intelligence tools. | Manual album/artist artwork recovery, safer Soulseek singles handling and optional integrations. |

Podcasts, Audiobookshelf, Lidarr and other upstream integrations remain available where supported and configured. Analysis-driven features depend on your library and its enrichment state.

## Unified Download Manager

Open **Downloads** in Kima to see existing jobs and, where enabled, your saved Spotify track requests.

| Capability | In v1.18.0 |
| :--- | :--- |
| **Download overview** | Read-only status of Kima jobs, scoped to the signed-in user. |
| **Spotify track intake** | Validate individual track links, save owner-specific requests and avoid duplicate submissions. Requires the relevant operator feature flag and Kima permission. |
| **Downtify dispatch** | Optional, explicitly requested **single-track** submission after exact account/server binding. No automatic retry of uncertain dispatches. |
| **Verify completed download** | One user-initiated, fail-closed sequence: remote job ownership → staging file → audio header → complete decode and SHA-256 calculation → ISRC/duration comparison. |
| **Existing import pipeline** | **Unchanged.** No automatic SSD-to-DAS copying, library import confirmation or Importer v5 takeover. |

The five checks are **diagnostics, not a recording-authenticity guarantee**. A matching ISRC, duration or audio header does not prove the correct Spotify recording, completed library import or reliable playback. The verification process does not move, delete or rewrite music files.

All Downtify connection, dispatch and advanced verification functions require deliberate administrator configuration, suitable user permissions, exact remote identity matching and (for file checks) a separately mounted **read-only** staging directory. They do not activate automatically in a fresh installation.

[Technical design and limitations](docs/unified-download-manager.md) · [User permissions](docs/user-permissions.md)

## Artwork recovery

Missing images should not require a destructive rescan.

From **Settings → Artwork**, administrators can recover:

- **Album covers:** Up to **200 albums per round**. Kima checks embedded art, local `cover` / `folder` / `front` / `album` images and configured external providers.
- **Artist photos:** Up to **100 artists per round**, using local `artist.*` images and existing external sources.

Both tools report progress and support continued batches. They preserve manually selected images, existing good artwork and original music files. Online sources may not provide a result for every artist or album.

## Why this fork?

The OxygenGS fork builds on the original Kima Hub while retaining upstream music-server and playback functionality.

- **UI and performance:** refined navigation, responsive artwork, faster local artist browsing, more efficient Home loading and improved accessibility.
- **Library Intelligence:** Library Doctor, Smart Download Inbox, manual album corrections and improved search.
- **Native player interoperability:** improved modern OpenSubsonic authentication and synchronization with **Symfonium** and **Feishin**.
- **Download safety:** more predictable Soulseek singles imports, account-scoped downloads and opt-in Downtify controls.
- **Operational reliability:** full-stack health checks, non-root service boundaries where supported, tested database upgrades and native AMD64/ARM64 release builds.

Fork changes are kept reviewable so future upstream improvements can be integrated without silently replacing local security or data-protection behavior.

## Installation

**Published image:** `ghcr.io/oxygengs/kima-hub:v1.18.0`  
**Linux platforms:** `amd64`, `arm64`  
**Web UI / OpenSubsonic API:** port `3030`

The All-in-One container includes the application, PostgreSQL, Redis and bundled music-analysis services.

### Docker

```bash
docker run -d \
  --name kima \
  -p 3030:3030 \
  -v /absolute/path/to/music:/music \
  -v kima_data:/data \
  --restart unless-stopped \
  ghcr.io/oxygengs/kima-hub:v1.18.0
```

Replace `/absolute/path/to/music` with your music directory and open `http://localhost:3030` for the initial setup.

### Docker Compose / Dockge

Use the [production Compose example](docker-compose.prod.yml), retaining the exact project and volume names on an existing installation.

```bash
MUSIC_PATH=/absolute/path/to/music VERSION=v1.18.0 docker compose -f docker-compose.prod.yml up -d
```

The checked-in Compose example has a conservative fallback tag and **does not** automatically choose the newest release. Always set `VERSION` explicitly. The `:latest` image alias is not automatically promoted.

| Mount / port | Purpose |
| :--- | :--- |
| `/music` | Your existing music directory. Preserve its mapping and permissions when upgrading. |
| `/data` | Persistent database, accounts, settings, keys and artwork cache. **Back up and verify a separate restore.** |
| `3030` | Web and client API. Restrict network exposure and use HTTPS for remote access. |

### Updating an existing installation

**v1.18.0 introduces two additive PostgreSQL migrations** for saved Spotify track requests and Downtify dispatch state. Before changing the running image:

1. Record your current Docker image, Compose/Dockge project, configuration and actual `/music` and `/data` mounts.
2. Stop application writes, take a **cold backup of the entire original `/data`**, and verify an independent restore to a separate volume.
3. Upgrade within the same Compose/Dockge project; keep existing music mounts and Importer v5 unchanged.
4. Verify login, playback, playlists, artwork, native clients and user permissions after the upgrade.

**Rolling back across these migrations requires restoring the pre-upgrade `/data` backup.** Running an older Kima image against a migrated database is not a safe rollback. Never use `docker compose down -v` when you intend to retain your data.

[Full installation guide](docs/install.md) · [Backup, upgrade and rollback procedure](docs/safe-aio-updates.md)

## Symfonium & Feishin

Both apps already had support in upstream Kima. This fork improves modern token-based connectivity.

1. Open **Settings → Native Apps** and generate a **separate API token per client**.
2. Enter your Kima URL, account username and new token (as the password or API key supported by the client).
3. Use **Legacy Authentication disabled**. Symfonium can also operate with **Compatibility Mode disabled** using a newly generated token.

Old tokens may need replacement. Keep credentials private. [OpenSubsonic client setup and troubleshooting](docs/subsonic.md).

## Security and privacy

Your media and accounts remain on your own server. Restrict access, use HTTPS remotely, protect API keys and keep independently restorable backups.

The **v1.18.0** native release preflight and published AMD64/ARM64 images passed their configured build, vulnerability-policy and secret checks. **This does not mean the image is free of vulnerabilities.** The preflight reported remaining HIGH/CRITICAL advisories without scanner-listed patches; residual risks require review for your deployment.

[Current image security report](docs/image-security.md) · [v1.18.0 native preflight](https://github.com/OxygenGS/kima-hub/actions/runs/42180411701) · [Release publication checks](https://github.com/OxygenGS/kima-hub/actions/runs/42182749230) · [Security policy](SECURITY.md)

## Documentation

| Start | Configure | Explore |
| :--- | :--- | :--- |
| [Installation](docs/install.md) | [Administration](docs/administration.md) | [Using Kima](docs/using-kima.md) |
| [Safe updates](docs/safe-aio-updates.md) | [User permissions](docs/user-permissions.md) | [Download Manager](docs/unified-download-manager.md) |
| [Configuration](docs/configuration.md) | [Instance branding](docs/instance-branding.md) | [Native clients](docs/subsonic.md) |
| [Releases](https://github.com/OxygenGS/kima-hub/releases) | [Image security](docs/image-security.md) | [Language settings](docs/internationalization.md) |

[Report an issue](https://github.com/OxygenGS/kima-hub/issues) · [Contribute](CONTRIBUTING.md) · [Upstream compatibility](docs/upstream-compatibility.md)

## Credits and license

This is an independently maintained fork of **[Kima Hub by Chevron7Locked](https://github.com/Chevron7Locked/kima-hub)**. Credit for the original application, existing integrations and upstream work belongs to their respective contributors; this repository is not an official upstream release.

Licensed under [GNU GPL v3.0](LICENSE). Dependencies and machine-learning models retain their own license terms, including the [model notice](services/audio-analyzer/models/LICENSE-upf-models).
