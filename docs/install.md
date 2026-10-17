# Install and update the OxygenGS Kima Hub fork

This guide covers the **OxygenGS fork** and its published container image. It is not the installation guide for the original upstream project. Source development, public image publishing and each person's own deployment are independent activities. No personal host name, hypervisor container ID, network address or volume location belongs in the fork's release metadata.

## Published version versus development

- **Current published OxygenGS stable:** `ghcr.io/oxygengs/kima-hub:v1.10.0`. This tag exists; it remains the default in the supplied production Compose templates until a new stable release is published.
- **Combined Kima v1.11 + English/Dutch interface:** under development in [Draft PR #7](https://github.com/OxygenGS/kima-hub/pull/7) stacked on Draft #6 and #5. Its frontend/backend package versions being 1.11.0 does **not** mean an OxygenGS v1.11 image or tag has been released.
- **Candidate/pre-release:** only use an explicitly published OxygenGS pre-release tag after the release notes identify it. A development branch, CI image built with `no push`, or official upstream image is **not** a published OxygenGS candidate.

## Choose a setup

| File or method | Purpose |
| --- | --- |
| `docker run ghcr.io/oxygengs/kima-hub:v1.10.0` | Published all-in-one fork image |
| `docker-compose.prod.yml` | Published all-in-one fork image with configurable `VERSION` |
| `docker-compose.server.yml` | All-in-one fork plus optional companion download services |
| `docker-compose.services.yml` | Companion services without the Kima app |
| `docker-compose.yml` | Separate services built from the repository for source development |
| `docker-compose.dev.yml` | Development databases and analyzers |

For the source build, follow [development.md](development.md). Do not substitute an upstream image for the OxygenGS fork; doing so would omit our fork-specific features.

## Fresh all-in-one installation

Use only a version that has actually been published in [OxygenGS releases](https://github.com/OxygenGS/kima-hub/releases).

```bash
docker run -d \
  --name kima \
  -p 3030:3030 \
  -v /path/to/your/music:/music \
  -v kima_data:/data \
  ghcr.io/oxygengs/kima-hub:v1.10.0
```

Open `http://localhost:3030` and create the first administrator account.

- `/music` is your library mount.
- `/data` stores database state, application secrets and caches. Preserve this volume through updates.
- Port 3030 is the public web interface. Database services remain internal to the all-in-one image.

### Docker Compose

```yaml
services:
  kima:
    image: ghcr.io/oxygengs/kima-hub:v1.10.0
    container_name: kima
    ports:
      - "3030:3030"
    volumes:
      - /path/to/your/music:/music
      - kima_data:/data
    restart: unless-stopped

volumes:
  kima_data:
```

The repository's `docker-compose.prod.yml` and `docker-compose.server.yml` already default to the published fork tag. Their `VERSION` variable lets you pin a different **existing, verified** release later; do not point it to an unpublished tag.

If you bind-mount `/data` on Linux instead of using a named volume, check permissions and create the required directories before startup:

```bash
mkdir -p /path/to/kima-data/postgres /path/to/kima-data/redis
```

## Safe updates and independent rollback

Database migrations can be irreversible. Before changing a running installation:

1. Identify the actual container image and Compose project, the mounted `/data` location and the music mount. Treat these as **private deployment facts**, not repository build settings.
2. Take a **cold backup of the complete original `/data` volume and Compose configuration**. Verify that the backup can be restored to a **separate test volume**.
3. Choose a tested **published OxygenGS tag or digest**, never a floating `:latest` tag for a controlled update.
4. Test the candidate in a disposable environment with synthetic or separately copied data before applying any upgrade to real data.
5. Only after an explicit deployment decision, update the pinned image and start the stack. Check login, users, media library, playback, integrations and permissions.

For exact commands and the non-destructive rollback procedure see [safe-aio-updates.md](safe-aio-updates.md). **Never run `docker compose down -v` when preserving data. Never start an old image on a database that a newer image has migrated.** Rollback requires the complete pre-upgrade snapshot restored to an independent volume.

## Release channels

**Stable:** use the versioned image referenced in [OxygenGS releases](https://github.com/OxygenGS/kima-hub/releases). The existing stable version is:

```bash
docker pull ghcr.io/oxygengs/kima-hub:v1.10.0
```

**Pre-release:** the fork's manual publishing workflow can produce a separately tagged GHCR pre-release after explicit approval. A pre-release is **not** automatically published when PR CI passes and should not be used with the current real-data volume. Only pull a pre-release when the fork's release notes confirm its actual tag and digest. Stable publishing must not promote it silently to `:latest`.

**Upstream comparison:** official `chevron7locked/kima` images are used in isolated migration/rollback **test fixtures** only. They are not the default installation image of the OxygenGS fork.

## Mobile devices and TV

Kima is a progressive web app. In Android Chrome use *Install app* or *Add to Home screen*. On iPhone/iPad use Safari's Share menu and *Add to Home Screen*. TV browser support depends on the device; `?tv=1` forces the dedicated TV layout. The experimental EN/NL language selector is part of the combined development branch and will be available in a published fork release only after acceptance.
