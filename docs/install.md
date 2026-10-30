# Install OxygenGS Kima Hub

**Current stable release: [v1.16.0 — Artwork Recovery](https://github.com/OxygenGS/kima-hub/releases/tag/v1.16.0)**

The published all-in-one Docker image is `ghcr.io/oxygengs/kima-hub:v1.16.0`, with native **linux/amd64** and **linux/arm64** support. Its [Docker publication workflow](https://github.com/OxygenGS/kima-hub/actions/runs/41072280580) and GitHub Release completed successfully.

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
  ghcr.io/oxygengs/kima-hub:v1.16.0
```

Open `http://localhost:3030` on the Docker host, finish setup and create the administrator account. If connecting from a different computer, use your server's appropriate address.

| Path or port | Purpose |
| :--- | :--- |
| `/music` | Mounted library; preserve the correct host music path when upgrading. |
| `/data` | Database, users, generated secrets, configuration, processing state and cached artwork. **Back up the entire volume.** |
| `3030` | Web and OpenSubsonic client API. Internal services do not need separate public ports. |

### Docker Compose / Dockge

Use the repository's [production Compose file](../docker-compose.prod.yml) for the all-in-one stack. The [server Compose file](../docker-compose.server.yml) includes optional download-management companions; review its extra services before deploying.

Set the version **explicitly**. The checked-in Compose files deliberately retain an older conservative fallback, so leaving `VERSION` unset does **not** select the current release:

```bash
MUSIC_PATH=/absolute/path/to/music VERSION=v1.16.0 docker compose -f docker-compose.prod.yml up -d
```

Minimal standalone Compose example:

```yaml
services:
  kima:
    image: ghcr.io/oxygengs/kima-hub:v1.16.0
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
4. Select `ghcr.io/oxygengs/kima-hub:v1.16.0` in the existing deployment without changing its music mount, `/data` volume or Compose project identity. Test with a separate non-production copy where possible.
5. After updating, verify accounts, music playback/seek, playlists, user permissions, client authentication and language settings. If rolling back after a migration, restore the independent **pre-upgrade data backup** before starting the older image.

**Database migration note:** v1.16.0 introduces **no new schema migration**. When upgrading from before v1.14.0, the earlier PostgreSQL `pg_trgm` extension and three search indexes may still need to be created. Allow disk space and I/O time, particularly with large libraries.

Follow the complete [safe all-in-one backup and rollback guide](safe-aio-updates.md). Its named-volume commands apply only to named Docker volumes, not arbitrary host-directory bind mounts. **Never use `docker compose down -v`** when the application data must be retained.

## Recover missing images after updating

In v1.16.0, administrators can go to **Settings → Artwork** and initiate:

- **Repair missing album covers:** at most **200 albums** per round, using embedded artwork, local cover/folder/front/album images and existing trusted external providers.
- **Repair missing artist photos:** at most **100 artists** per round, with local `artist.*` images and existing external providers.

Each control displays progress and a continuation option if more candidates remain. Good existing images, manually chosen artwork and music files are preserved. The normal music scanner does not need to rescan unchanged files; artwork repair is a separate manual action. Batch progress resets after an API restart, and providers may not have a picture for every item.

## Native music applications

Symfonium and Feishin already had upstream support. The fork improves modern authentication and Symfonium synchronization so newly generated keys work with **Legacy Authentication disabled**, and Symfonium can work with **Compatibility Mode disabled**.

Create a new API key under **Settings → Native Apps** for each client; use the appropriate Kima username and new key in the client. Older keys may require replacement for salted-token authentication. Read [OpenSubsonic client setup](subsonic.md) for exact methods and troubleshooting.

## Release and security notes

| Channel | Image | Recommendation |
| :--- | :--- | :--- |
| Stable | `ghcr.io/oxygengs/kima-hub:v1.16.0` | Versioned production release; pin a tag or immutable digest. |
| Pre-release | Explicit published `prerelease-…` tag or digest | Testing only. |
| `:latest` | Not automatically promoted | Avoid for controlled updates. |

The [v1.16.0 native preflight](https://github.com/OxygenGS/kima-hub/actions/runs/41067045144) passed on the exact merged source, but residual HIGH and CRITICAL image advisories remain. Approval and publication do not establish that all dependencies are free of known vulnerabilities. See [image security](image-security.md) for the current findings and risk guidance.

[All releases](https://github.com/OxygenGS/kima-hub/releases) · [GHCR image](https://github.com/OxygenGS/kima-hub/pkgs/container/kima-hub) · [Safe updates](safe-aio-updates.md)
