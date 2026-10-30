<div align="center">

<img src="assets/readme-header.svg" width="100%" alt="Kima Hub — Oxygen's Fork. Your music. Your space." />

# Kima Hub — Oxygen's Fork

**A self-hosted music server for your library, your listening habits and your devices.**

Browse and stream your own music, discover new connections between tracks and manage your collection from one place. Your music, accounts and application data stay on your server.

[![Stable release](https://img.shields.io/github/v/release/OxygenGS/kima-hub?label=stable&style=flat-square&color=ffb000)](https://github.com/OxygenGS/kima-hub/releases/latest)
[![Docker image](https://img.shields.io/badge/Docker-GHCR-2779bd?style=flat-square&logo=docker&logoColor=white)](https://github.com/OxygenGS/kima-hub/pkgs/container/kima-hub)
[![Languages](https://img.shields.io/badge/UI-English%20%7C%20Dutch-6554ad?style=flat-square)](docs/internationalization.md)
[![License](https://img.shields.io/badge/License-GPL--3.0-555555?style=flat-square)](LICENSE)

[**What's new**](#latest-release-v1160) · [**Features**](#what-kima-offers) · [**Artwork recovery**](#recover-missing-artwork) · [**Install**](#quick-start) · [**Native clients**](#symfonium-feishin-and-opensubsonic) · [**Docs**](#documentation)

</div>

## Latest release: v1.16.0

**[Kima Hub v1.16.0 — Artwork Recovery](https://github.com/OxygenGS/kima-hub/releases/tag/v1.16.0)** is published for **linux/amd64** and **linux/arm64**.

This update improves missing album covers and artist pictures, including music that was indexed before the new artwork detection was added.

| Better album covers | Repair existing albums | Repair artist photos |
| :--- | :--- | :--- |
| When processing music, Kima checks embedded artwork and nearby `cover`, `folder`, `front` or `album` images in JPG, JPEG, PNG and WebP formats. | Admins can repair up to **200 albums per round** from **Settings → Artwork**, without a full library rescan. | Admins can repair up to **100 artists per round**, using local `artist.*` pictures and the existing external providers. |

**Designed to preserve your library:** valid artwork, user-selected images, existing external image URLs, music files, playlists and track metadata are not replaced by these repair actions. Where local artwork is unavailable, Kima uses its existing providers (including Deezer, Cover Art Archive and Fanart.tv, as applicable).

**Compatibility:** v1.16.0 adds no database schema migration, playback-engine replacement or authentication change. Older versions may have their own migrations; always back up persistent data before upgrading.

[Full v1.16.0 release notes](https://github.com/OxygenGS/kima-hub/releases/tag/v1.16.0) · [Release history](CHANGELOG.md)

## What Kima offers

| Music and listening | Discovery and browsing | Your server, your settings |
| :--- | :--- | :--- |
| Your own artists, albums and tracks; playlists, queue management, lyrics and responsive playback. | Mood Mixer, Vibe Map, personalized discovery, artist radio, listening statistics and search across your library. | Self-hosted accounts, user permissions, instance branding, English/Dutch UI and persistent local data. |
| Desktop and mobile web experience, with installable PWA support where available. | Local-first artist pages, consistent loading states, Unicode-aware search and more useful results across Library, Discover and P2P. | Admin-managed API keys, artwork controls, library management and documented Docker upgrades. |

Podcasts, Audiobookshelf integration and additional services are available where configured. Recommendations and vibe features depend on your music, background analysis and enabled integrations.

### Improvements maintained by this fork

- **Artwork recovery:** local album covers, missing-covers repair, local artist portraits and provider fallback, without forcing a complete library rescan.
- **Modern music clients:** improved authentication and synchronization for existing Symfonium and Feishin support, without needing Legacy Authentication or Symfonium Compatibility Mode with newly generated keys.
- **Faster-feeling browsing:** local-first artist information, fewer unnecessary repeated requests, bounded artwork processing and layout-stable loading states. No unmeasured speedup percentage is claimed.
- **Better search:** source-aware result tabs, more reliable exact matches, support for accented characters and a typo-tolerant fallback for local music.
- **Administration:** backend-enforced user permissions, configurable application name/logo/colors and English/Dutch language settings.
- **Safer releases:** CI, independent restore checks, native AMD64/ARM64 image builds, secret scanning and explicit review of residual vulnerabilities before stable publication.

This fork retains the original Kima Hub foundations and upstream features. Its version numbers refer to **OxygenGS releases**, not upstream version numbers.

## Recover missing artwork

Sign in as an **administrator** and open **Settings → Artwork**.

1. Use **Repair missing album covers** to check albums that have no cover or a missing local cache file. The job processes up to **200 albums per round**.
2. Use **Repair missing artist photos** to find images named `artist.jpg`, `artist.jpeg`, `artist.png` or `artist.webp`. A `folder.*` image is only considered when its directory matches the artist name. The job processes up to **100 artists per round**.
3. Follow the progress and recovered/skipped/failed counts. If more items remain, use the continuation button for the next round.

Both operations are **manual and admin-only**. They preserve hand-picked artwork and valid existing images. Remote providers do not have artwork for every artist or album, so complete coverage is not guaranteed. Progress and batch position are held in the running API process; after a restart, begin a new pass.

## Quick start

**Published image:** `ghcr.io/oxygengs/kima-hub:v1.16.0`  
**Platforms:** `linux/amd64`, `linux/arm64`  
**Web interface / API:** port `3030`

You need Docker, a music directory and persistent storage for Kima's data. The all-in-one image includes the web app, backend, database, Redis and bundled analysis services.

```bash
docker run -d \
  --name kima \
  -p 3030:3030 \
  -v /absolute/path/to/music:/music \
  -v kima_data:/data \
  --restart unless-stopped \
  ghcr.io/oxygengs/kima-hub:v1.16.0
```

Replace the example music path with your own, then open `http://localhost:3030` on the Docker host and create the first administrator account. For access from another device, use the server's appropriate hostname or address.

| Mount / port | What it is for |
| :--- | :--- |
| `/music` | Your music library; keep the host path consistent when updating. |
| `/data` | Database, accounts, configuration, secrets and caches. **Persist and back up the full volume.** |
| `3030` | Web application and client API. Restrict exposure and use HTTPS when accessed remotely. |

### Docker Compose / Dockge

Use [docker-compose.prod.yml](docker-compose.prod.yml) or the [installation guide](docs/install.md), and **explicitly select the published image version**:

```bash
MUSIC_PATH=/absolute/path/to/music VERSION=v1.16.0 docker compose -f docker-compose.prod.yml up -d
```

The Compose files intentionally retain a conservative fallback tag; omitting `VERSION` does **not** mean v1.16.0. The `:latest` image alias is **not automatically promoted** by the release publisher. Pin an explicit version or digest.

### Updating an existing installation

Back up the **entire persistent `/data` volume** and your deployment configuration, and verify an independent restore **before** changing the image. Preserve the original volume, music mounts, secrets and Compose project identity. Never use `docker compose down -v` for an upgrade.

If upgrading from **before v1.14.0**, an earlier migration creates PostgreSQL `pg_trgm` support and search indexes; allow extra time and disk space. **v1.16.0 adds no new schema migration**, but returning to an older image after any earlier migration may require restoring the original pre-upgrade data snapshot.

Use the [safe AIO upgrade and rollback guide](docs/safe-aio-updates.md). Publishing a release does not update running containers automatically.

## Symfonium, Feishin and OpenSubsonic

Symfonium and Feishin support existed in upstream Kima Hub; this fork improves how those integrations authenticate and synchronize.

1. In **Settings → Native Apps**, generate a separate **new API key** for each client.
2. Use your Kima server address and the account's username if the client requests one. Enter the newly generated API key as the password where applicable.
3. Leave **Legacy Authentication disabled**; in Symfonium, leave **Compatibility Mode disabled** too.

Keys issued before the improved authentication implementation must be replaced for salted-token authentication to work without Legacy Authentication. See [OpenSubsonic setup, key handling and troubleshooting](docs/subsonic.md). Treat each key as a password.

## Security and privacy

The v1.16.0 native preflight and release publisher completed successfully, but **the images are not vulnerability-free**. The October 30, 2026 preflight reported remaining HIGH and CRITICAL package advisories on both architectures, without a scanner-listed fixed version for those findings. These require risk assessment; a passing CI gate does not demonstrate that the vulnerabilities are harmless.

[Current image security findings](docs/image-security.md) · [v1.16.0 native preflight](https://github.com/OxygenGS/kima-hub/actions/runs/41067045144) · [v1.16.0 publisher](https://github.com/OxygenGS/kima-hub/actions/runs/41072280580)

Keep credentials private, limit network access, use HTTPS for remote access and maintain recoverable backups. Never include real installation hostnames, addresses, credentials, private paths or installation screenshots in public issues or contributions.

[Privacy policy](PRIVACY.md) · [Security / responsible disclosure](SECURITY.md)

## Documentation

| Getting started | Running your server | Listening and integrations |
| :--- | :--- | :--- |
| [Install](docs/install.md) | [Safe updates and rollback](docs/safe-aio-updates.md) | [Using Kima](docs/using-kima.md) |
| [Configuration](docs/configuration.md) | [Administration](docs/administration.md) | [OpenSubsonic / native apps](docs/subsonic.md) |
| [Version history](CHANGELOG.md) | [User permissions](docs/user-permissions.md) | [Integrations](docs/integrations.md) |
| [Security guidance](docs/image-security.md) | [Custom branding](docs/instance-branding.md) | [Languages](docs/internationalization.md) |

Historical UI captures and their synthetic-data provenance remain available in the [screenshot archive](assets/screenshots/v1.13/README.md); they are **not presented as v1.16.0 screenshots**.

[Report an issue](https://github.com/OxygenGS/kima-hub/issues) · [Contribute](CONTRIBUTING.md) · [Upstream compatibility](docs/upstream-compatibility.md)

## Upstream and license

**Kima Hub — Oxygen's Fork** is independently maintained by [OxygenGS](https://github.com/OxygenGS/kima-hub), based on the original [Kima Hub by Chevron7Locked](https://github.com/Chevron7Locked/kima-hub). Upstream developers and contributors retain credit for the original application and its features. This is **not an official upstream release**.

Kima Hub remains licensed under [GNU GPL v3.0](LICENSE). Third-party dependencies and machine-learning models retain their respective licenses and notices, including the [model notice](services/audio-analyzer/models/LICENSE-upf-models).
