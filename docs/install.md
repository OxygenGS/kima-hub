# Install OxygenGS Kima Hub

**Current published fork release:** [v1.12.1](https://github.com/OxygenGS/kima-hub/releases/tag/v1.12.1). It includes the missing English/Dutch in-app v1.12.0 release notes and retains the existing fork features, including modern Symfonium/Feishin authentication and Symfonium synchronization without Compatibility Mode.

**v1.13.0 is an unpublished source candidate.** Do not use a v1.13.0 image until its native publisher and GitHub release have completed. The examples below intentionally use the currently published stable release.

Use the versioned **OxygenGS** image, not the upstream `chevron7locked/kima` image. Confirm the [Docker publish workflow](https://github.com/OxygenGS/kima-hub/actions/workflows/docker-publish.yml) has succeeded before pulling a newly released tag. The guarded workflow creates its GitHub Release after verifying the multi-architecture image; a Git tag alone is not proof of publication.

## Fresh installation

An all-in-one container runs the web app, API, PostgreSQL, Redis and audio analyzers. Replace `/absolute/path/to/music` with an existing folder containing your music.

```bash
docker run -d \
  --name kima \
  -p 3030:3030 \
  -v /absolute/path/to/music:/music \
  -v kima_data:/data \
  --restart unless-stopped \
  ghcr.io/oxygengs/kima-hub:v1.12.1
```

Open [http://localhost:3030](http://localhost:3030), complete onboarding and create your administrator account.

- **`/music`** is the music library; keep its host path consistent.
- **`/data`** is the complete persistent database, job/caching state and generated secrets. Keep it through updates and always back it up.
- **3030** is the web UI port. Internal API/database ports are not meant to be separately published.

### Docker Compose / Dockge

Use the repository's [production Compose file](../docker-compose.prod.yml) for the single-container stack, or [server Compose](../docker-compose.server.yml) for optional download companions. Explicitly select the desired **published** release with `VERSION=v1.12.1`; the Compose files retain a conservative older default.

```bash
MUSIC_PATH=/absolute/path/to/music VERSION=v1.12.1 docker compose -f docker-compose.prod.yml up -d
```

A minimal standalone Compose configuration:

```yaml
services:
  kima:
    image: ghcr.io/oxygengs/kima-hub:v1.12.1
    ports:
      - "3030:3030"
    volumes:
      - /absolute/path/to/music:/music
      - kima_data:/data
    restart: unless-stopped

volumes:
  kima_data:
```

For development builds, see [development](development.md); `docker-compose.yml` runs the separate source services rather than the released AIO image.

## Updating

**Do not update an existing installation by simply swapping Docker tags.** The application can migrate its database automatically. An older image cannot necessarily start on data that has been migrated.

1. Record the current image/tag and actual mounts privately. Do not commit installation-specific information to this public repository.
2. Stop the existing stack and make a **cold backup of the entire original `/data` volume**, including `/data/secrets`, plus the Compose configuration.
3. Verify a full restore to a **different volume**. Keep the original snapshot unchanged for rollback.
4. Choose an explicitly published, verified image digest or versioned tag, then upgrade a nonproduction copy first.
5. On an approved installation update, verify accounts, playlists, audio/seek, downloads, per-user rights and language preferences. For rollback, restore the separate **pre-upgrade** data snapshot before restarting the old image.

Follow the full [safe AIO update and rollback guide](safe-aio-updates.md). Never use `docker compose down -v` to update a database you want to keep.

## Release channels

| Channel | Docker image | Usage |
| --- | --- | --- |
| Stable | `ghcr.io/oxygengs/kima-hub:v1.12.1` | Current versioned OxygenGS release; verify GHCR publishing first |
| Previous stable | `ghcr.io/oxygengs/kima-hub:v1.12.0` | Previous release; use only with a compatible data backup |
| Pre-release | A specific published `prerelease-...` tag/digest | Testing only, not a production upgrade path |
| `:latest` | Not automatically promoted | Avoid for controlled upgrades |

[All GitHub releases](https://github.com/OxygenGS/kima-hub/releases) · [GHCR package](https://github.com/OxygenGS/kima-hub/pkgs/container/kima-hub)
