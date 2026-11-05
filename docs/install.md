# Install OxygenGS Kima Hub

**Current published fork release:** [v1.17.1](https://github.com/OxygenGS/kima-hub/releases/tag/v1.17.1) — Upstream Polish, Library Intelligence and reliability fixes

**Upcoming v1.18.0:** source-only release candidate with the guarded Unified Download Manager. **Not yet published; do not pull an unverified v1.18.0 image.** It introduces two additive database migrations and leaves Downtify staging/download features default-OFF and Importer v5 intact. Review the [v1.18.0 release checklist](v118-release-readiness.md) and complete `/data` backup/restore checks before any eventual upgrade.

The published all-in-one Docker image is `ghcr.io/oxygengs/kima-hub:v1.17.1`, with native **linux/amd64** and **linux/arm64** support. The [v1.17.1 GitHub Release](https://github.com/OxygenGS/kima-hub/releases/tag/v1.17.1) and both native Docker publication workflows have completed successfully.

**v1.17.1 is a published stable release.** It adds no new PostgreSQL migration or music re-enrichment, but v1.17.0 introduced a database migration for reversible album links. Before upgrading, stop application writes, back up the entire persistent `/data` volume, verify an independent restore and keep `/music` mounted exactly as before. Never point an older image at a migrated database; restore the matching pre-upgrade `/data` backup when rolling back across a migration.

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
  ghcr.io/oxygengs/kima-hub:v1.17.1
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

Set the version **explicitly**. The checked-in Compose files deliberately retain an older conservative fallback, so leaving `VERSION` unset does **not** select the current release:

```bash
MUSIC_PATH=/absolute/path/to/music VERSION=v1.17.1 docker compose -f docker-compose.prod.yml up -d
```

Minimal standalone Compose example:

```yaml
services:
  kima:
    image: ghcr.io/oxygengs/kima-hub:v1.17.1
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
4. Select `ghcr.io/oxygengs/kima-hub:v1.17.1` in the existing deployment without changing its music mount, `/data` volume or Compose project identity. Test with a separate non-production copy where possible.
5. After updating, verify accounts, music playback/seek, playlists, user permissions, client authentication and language settings. If rolling back after a migration, restore the independent **pre-upgrade data backup** before starting the older image.

**Database migration note:** v1.17.0 introduced a PostgreSQL migration for reversible album links, and v1.17.1 adds no new one. When upgrading from before v1.14.0, the earlier PostgreSQL `pg_trgm` extension and three search indexes may still need to be created. Allow disk space and I/O time, particularly with large libraries.

Follow the complete [safe all-in-one backup and rollback guide](safe-aio-updates.md). Its named-volume commands apply only to named Docker volumes, not arbitrary host-directory bind mounts. **Never use `docker compose down -v`** when the application data must be retained.

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
| Stable | `ghcr.io/oxygengs/kima-hub:v1.17.1` | Versioned production release; pin a tag or immutable digest. |
| Pre-release | Explicit published `prerelease-…` tag or digest | Testing only. |
| `:latest` | Not automatically promoted | Avoid for controlled updates. |

Native image builds and a security preflight must pass for the exact release commit before approval and publication. Previously recorded HIGH and CRITICAL image advisories remain relevant until reassessed. Approval does not establish that all dependencies are free of known vulnerabilities. See the [image security report](image-security.md) and the exact release's native preflight for risk guidance.

[All releases](https://github.com/OxygenGS/kima-hub/releases) · [GHCR image](https://github.com/OxygenGS/kima-hub/pkgs/container/kima-hub) · [Safe updates](safe-aio-updates.md)
