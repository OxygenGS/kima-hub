# Install OxygenGS Kima Hub

**Current version:** [v1.22.0](https://github.com/OxygenGS/kima-hub/releases/tag/v1.22.0) — published 13 November 2026. This stable release introduces the Settings Studio 2.0 interface and retains the existing Lidarr, Soulseek, music library and application data.

The published multi-architecture image is `ghcr.io/oxygengs/kima-hub:v1.22.0` for **linux/amd64** and **linux/arm64**, verified by the [stable publisher](https://github.com/OxygenGS/kima-hub/actions/runs/43391050043). Before updating an existing installation, independently verify a complete `/data` backup and restore. The publication does not automatically change a running installation.

**Upgrading an existing installation:** v1.20.0 adds **forward-only, additive PostgreSQL migrations** for native import discovery, Lidarr handoff and durable receipts, on top of v1.19.0 Downtify pairing. Stop application writes, back up the complete persistent `/data` volume and verify an independent restore before updating. Preserve the exact `/music` and Compose/Dockge mounts. A rollback across schema migrations **requires the pre-upgrade `/data` backup**. Any external importer from an older deployment must be disabled by its operator before updating; upgrading never removes media.

Kima runs the web app, API, PostgreSQL, Redis and bundled analysis services in one container. Your music and persistent application data remain on volumes you control.

## Fresh install

You need Docker, an existing music folder and space for the persistent `/data` volume. Replace `/absolute/path/to/music` with the host directory containing your audio files.

```bash
docker run -d \
  --name kima \
  -p 3030:3030 \
  -v /absolute/path/to/music:/music \
  -v kima_data:/data \
  --restart unless-stopped \
  ghcr.io/oxygengs/kima-hub:v1.22.0
```

Open `http://localhost:3030` on the Docker host, finish setup and create the administrator account. If connecting from a different computer, use your server's appropriate address.

| Path or port | Purpose |
| :--- | :--- |
| `/music` | Mounted library; preserve the correct host music path when upgrading. |
| `/data` | Database, users, generated secrets, configuration, processing state and cached artwork. **Back up the entire volume.** |
| `3030` | Web and OpenSubsonic client API. Internal services do not need separate public ports. |

**Soulseek download permissions:** v1.16.1 creates a narrowly writable `/music/Singles/Kima Downloads` import directory for the backend when possible. The rest of `/music` remains unchanged. If the host mount is read-only or prevents creating/chowning that folder, grant the container's backend user limited write access to this specific import directory; never recursively make the whole music collection writable.

### Docker Compose / Dockge

Use the repository's [production Compose file](../docker-compose.prod.yml) for the all-in-one stack. The [server Compose file](../docker-compose.server.yml) includes optional download-management companions; review its extra services and additional music/download mounts before deploying. **The optional full-stack example adds separate download services.** Its versioned source fallback may reference the unpublished v1.23.0 candidate, so set `VERSION=v1.22.0` until the new stable version is published. It also requires an explicit existing `MUSIC_PATH` for Kima. Review the extra download-service mounts separately before using it. Existing installations should preserve their own pinned tag until their backup/restore is verified.

For a **new** production Compose installation, explicitly set `VERSION=v1.22.0` for the currently published stable image until the v1.23.0 candidate is approved and published. Compose uses a versioned fallback (never `:latest`). Set `MUSIC_PATH` to an existing **absolute path** to the intended music filesystem; Compose rejects a missing setting and does **not** create a missing host folder. For a NAS/DAS, independently confirm the correct disk or share is mounted: an existing but empty directory is not proof of storage identity.

For an **existing** installation, continue pinning its exact image tag in `VERSION`, and preserve its Compose project name, `/data` and `/music` mounts. Do not let a changed example version trigger an upgrade before backup and restore validation:

```bash
MUSIC_PATH=/absolute/path/to/music VERSION=v1.22.0 docker compose -f docker-compose.prod.yml up -d
```

Minimal standalone Compose example:

```yaml
services:
  kima:
    image: ghcr.io/oxygengs/kima-hub:v1.22.0
    ports:
      - "3030:3030"
    volumes:
      - /absolute/path/to/music:/music
      - kima_data:/data
    restart: unless-stopped

volumes:
  kima_data:
```

This source version does not provide an external-provider staging overlay. Keep normal Lidarr and Soulseek mounts configured separately; do not mount a download directory inside Kima merely to recreate a removed integration.

For source development use [development.md](development.md); the general `docker-compose.yml` runs source services instead of the published all-in-one image.

## Updating an existing installation

**Back up and verify a restore before updating.** An existing installation's database may undergo migrations, and reverting a Docker tag does not reverse them.

1. Privately record the running image version, deployment configuration, Compose project name and volume mounts. Never post installation-specific values to this repository.
2. Stop the current stack and make a **cold, complete backup** of its original `/data` volume, including secrets, plus the Compose/environment configuration.
3. Verify an independent restore into a **different** volume. Keep the pre-upgrade original and backup intact for rollback.
4. Once the pre-upgrade backup and independent restore are verified, select the published `ghcr.io/oxygengs/kima-hub:v1.22.0` image in the existing deployment without changing its music mount, `/data` volume or Compose project identity. Test with a separate non-production copy where possible.
5. After updating, verify accounts, music playback/seek, playlists, user permissions, client authentication and language settings. If rolling back after a migration, restore the independent **pre-upgrade data backup** before starting the older image.

**Database migration note:** v1.20.0 adds native import cursor, ledger and optional Lidarr-hand-off fields; v1.19.0 added the `DowntifyIntegration` table, and v1.18.0 added the `SpotifyDownloadIntent` and dispatch-claim migrations. Earlier versions also introduced reversible album links and search indexes. When upgrading from before v1.14.0, the earlier PostgreSQL `pg_trgm` extension and three search indexes may still need to be created. Allow disk space and I/O time, particularly with large libraries.

Follow the complete [safe all-in-one backup and rollback guide](safe-aio-updates.md). Its named-volume commands apply only to named Docker volumes, not arbitrary host-directory bind mounts. **Never use `docker compose down -v`** when the application data must be retained.

## Download sources

Configure supported Lidarr and Soulseek integrations through **Settings**. The **Downloads** page displays Kima's own download history. Retired external importer records are not deleted or migrated. See [integrations](integrations.md) for setup.

## Recover missing images after updating

Administrators can go to **Settings → Artwork** and initiate:

- **Repair missing album covers:** at most **200 albums** per round, using embedded artwork, local cover/folder/front/album images and existing trusted external providers.
- **Repair missing artist photos:** at most **100 artists** per round, with local `artist.*` images and existing external providers.

Each control displays progress and a continuation option if more candidates remain. Good existing images, manually chosen artwork and music files are preserved. The normal music scanner does not need to rescan unchanged files; artwork repair is a separate manual action. Batch progress resets after an API restart, and providers may not have a picture for every item.

## Native music applications

Symfonium and Feishin already had upstream support. The fork improves modern authentication and Symfonium synchronization so newly generated keys work with **Legacy Authentication disabled**, and Symfonium can work with **Compatibility Mode disabled**.

Create a new API key under **Settings → Native Apps** for each client; use the appropriate Kima username and new key in the client. Older keys may require replacement for salted-token authentication. Read [OpenSubsonic client setup](subsonic.md) for exact methods and troubleshooting.

## Release and security notes

| Channel | Image | Recommendation |
| :--- | :--- | :--- |
| Stable | `ghcr.io/oxygengs/kima-hub:v1.22.0` | Versioned production release; pin a tag or immutable digest. |
| Pre-release | Explicit published `prerelease-…` tag or digest | Testing only. |
| `:latest` | Not automatically promoted | Avoid for controlled updates. |

The [v1.22.0 native preflight](https://github.com/OxygenGS/kima-hub/actions/runs/43379684353), [explicit security approval](https://github.com/OxygenGS/kima-hub/actions/runs/43391025604) and [multi-architecture publication](https://github.com/OxygenGS/kima-hub/actions/runs/43391050043) all succeeded. Residual HIGH and CRITICAL advisories remain; automatic scanner success and explicit approval do not establish that an image is vulnerability-free. See the [image security report](image-security.md) and the exact release's native preflight for risk guidance.

[Native preflights](https://github.com/OxygenGS/kima-hub/actions/workflows/v112-native-preflight.yml) · [All releases](https://github.com/OxygenGS/kima-hub/releases) · [GHCR image](https://github.com/OxygenGS/kima-hub/pkgs/container/kima-hub) · [Safe updates](safe-aio-updates.md)
