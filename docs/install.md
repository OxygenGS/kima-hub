# Install OxygenGS Kima Hub

**Current published fork release:** [v1.19.0](https://github.com/OxygenGS/kima-hub/releases/tag/v1.19.0) — Downtify connection and device pairing in Settings.

The published All-in-One image is `ghcr.io/oxygengs/kima-hub:v1.19.0`, with native **linux/amd64** and **linux/arm64** images. [Stable publication workflow](https://github.com/OxygenGS/kima-hub/actions/runs/42397561696) · [v1.19.0 release notes](https://github.com/OxygenGS/kima-hub/releases/tag/v1.19.0).

**Upgrading an existing installation:** v1.19.0 adds **one additive PostgreSQL migration** for encrypted Downtify device pairing, on top of the two migrations introduced by v1.18.0. Stop application writes, make a cold backup of the complete persistent `/data` volume, and verify an independent restore before changing the version. Preserve the exact `/music` and Compose/Dockge mounts. A rollback across migrations **requires the pre-upgrade `/data` backup**. All newly paired Downtify controls are OFF by default; **Importer v5 is not replaced**.

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
  ghcr.io/oxygengs/kima-hub:v1.19.0
```

Open `http://localhost:3030` on the Docker host, finish setup and create the administrator account. If connecting from a different computer, use your server's appropriate address.

| Path or port | Purpose |
| :--- | :--- |
| `/music` | Mounted library; preserve the correct host music path when upgrading. |
| `/data` | Database, users, generated secrets, configuration, processing state and cached artwork. **Back up the entire volume.** |
| `3030` | Web and OpenSubsonic client API. Internal services do not need separate public ports. |

**Soulseek download permissions:** v1.16.1 creates a narrowly writable `/music/Singles/Kima Downloads` import directory for the backend when possible. The rest of `/music` remains unchanged. If the host mount is read-only or prevents creating/chowning that folder, grant the container's backend user limited write access to this specific import directory; never recursively make the whole music collection writable.

### Docker Compose / Dockge

Use the repository's [production Compose file](../docker-compose.prod.yml) for the all-in-one stack. The [server Compose file](../docker-compose.server.yml) includes optional download-management companions; review its extra services before deploying.

For a **new** production Compose installation, the example defaults to the currently published and fixed `v1.19.0` image (never `:latest`). Set `MUSIC_PATH` to an existing **absolute path** to the intended music filesystem; Compose rejects a missing setting and does **not** create a missing host folder. For a NAS/DAS, independently confirm the correct disk or share is mounted: an existing but empty directory is not proof of storage identity.

For an **existing** installation, continue pinning its exact image tag in `VERSION`, and preserve its Compose project name, `/data` and `/music` mounts. Do not let a changed example version trigger an upgrade before backup and restore validation:

```bash
MUSIC_PATH=/absolute/path/to/music VERSION=v1.19.0 docker compose -f docker-compose.prod.yml up -d
```

Minimal standalone Compose example:

```yaml
services:
  kima:
    image: ghcr.io/oxygengs/kima-hub:v1.19.0
    ports:
      - "3030:3030"
    volumes:
      - /absolute/path/to/music:/music
      - kima_data:/data
    restart: unless-stopped

volumes:
  kima_data:
```

For source development use [development.md](development.md); the general `docker-compose.yml` runs source services instead of the published all-in-one image.

## Updating an existing installation

**Back up and verify a restore before updating.** An existing installation's database may undergo migrations, and reverting a Docker tag does not reverse them.

1. Privately record the running image version, deployment configuration, Compose project name and volume mounts. Never post installation-specific values to this repository.
2. Stop the current stack and make a **cold, complete backup** of its original `/data` volume, including secrets, plus the Compose/environment configuration.
3. Verify an independent restore into a **different** volume. Keep the pre-upgrade original and backup intact for rollback.
4. Select `ghcr.io/oxygengs/kima-hub:v1.19.0` in the existing deployment without changing its music mount, `/data` volume or Compose project identity. Test with a separate non-production copy where possible.
5. After updating, verify accounts, music playback/seek, playlists, user permissions, client authentication and language settings. If rolling back after a migration, restore the independent **pre-upgrade data backup** before starting the older image.

**Database migration note:** v1.19.0 adds the `DowntifyIntegration` table; v1.18.0 added two migrations for `SpotifyDownloadIntent` and dispatch claim metadata. Earlier versions also introduced reversible album links and search indexes. When upgrading from before v1.14.0, the earlier PostgreSQL `pg_trgm` extension and three search indexes may still need to be created. Allow disk space and I/O time, particularly with large libraries.

Follow the complete [safe all-in-one backup and rollback guide](safe-aio-updates.md). Its named-volume commands apply only to named Docker volumes, not arbitrary host-directory bind mounts. **Never use `docker compose down -v`** when the application data must be retained.

## Configure Downtify in v1.19.0

Administrators can now open **Settings → Integrations → Downtify** to enter a trusted backend-reachable server URL, test a paired-device token and save encrypted pairing details. The connection and all related Spotify request/manual dispatch switches start OFF. If Docker already holds a Downtify URL/device token, the UI keeps it environment-managed until the operator explicitly migrates it. A browser setting cannot enable advanced source/audio verification or create a read-only mount. There is no automatic music copy, library import or Importer v5 cutover. [Full Downtify instructions](downtify-settings.md).

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
| Stable | `ghcr.io/oxygengs/kima-hub:v1.19.0` | Versioned production release; pin a tag or immutable digest. |
| Pre-release | Explicit published `prerelease-…` tag or digest | Testing only. |
| `:latest` | Not automatically promoted | Avoid for controlled updates. |

The v1.19.0 exact-commit native preflight and both architecture-specific stable publication jobs passed. The preflight still reported unresolved HIGH/CRITICAL dependency advisories with no scanner-listed fixes; these are not automatically safe and require ongoing risk review. Approval does not establish that all dependencies are free of known vulnerabilities. See the [image security report](image-security.md) and the exact release's native preflight for risk guidance.

[v1.19.0 preflight](https://github.com/OxygenGS/kima-hub/actions/runs/42394711879) · [All releases](https://github.com/OxygenGS/kima-hub/releases) · [GHCR image](https://github.com/OxygenGS/kima-hub/pkgs/container/kima-hub) · [Safe updates](safe-aio-updates.md)
