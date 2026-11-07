# Downtify settings — stable in v1.19.0

**Available from [Kima Hub v1.19.0](https://github.com/OxygenGS/kima-hub/releases/tag/v1.19.0).** The feature is included in the published, native AMD64/ARM64 Docker image. Existing deployments must still be upgraded explicitly and backed up first. Publication does not change any Proxmox, DAS or Importer v5 installation.

## Admin UI

Open **Settings → Integrations → Downtify** as an administrator. The original Kima **Downloads** screen remains at `/downloads`.

1. Enter a Downtify URL reachable **from the Kima container**, for example
   `http://downtify:8000` if the services share a Docker network. On a
   different Docker or Proxmox network, use the real trusted private LAN URL.
   Public URLs must use HTTPS.
2. Generate/pair a Downtify **device token** on the actual Downtify instance.
   Use the `dtfy_...` token, **not** a password or browser cookie.
3. Test the connection. Kima first verifies a public authenticated Downtify
   API v1 server identity without a token, then checks the exact paired
   device and remote account via authenticated GET. It follows no redirects.
4. Pair the device. The backend saves the token encrypted with Kima's
   existing settings encryption key, and pins that specific Downtify
   server, numeric account, username and **current Kima admin**. The UI
   receives only a sanitized status; it never reads the token back.
5. All features start disabled. Use separate switches to enable the
   owner-bound queue, to save Spotify track requests and (with explicit
   acknowledgement) to allow **manual single-track Downtify submission**.
   A fourth switch enables the manual remote-job status check.

The settings are saved in a new, additive `DowntifyIntegration` PostgreSQL
table. They never overwrite the running container's `.env` or Docker mounts.
Enabling a feature takes effect through a private request-scoped configuration
projection and needs no container restart. If `KIMA_DOWNTIFY_ENABLED=true` **or a Docker-managed `KIMA_DOWNTIFY_DEVICE_TOKEN` is present**, pairing through Settings is blocked to protect the existing configuration. Explicit operator migration is needed before using database-owned pairing. Re-pairing resets **all** feature switches to OFF.

## Safety

- Only the Kima admin who performed the pairing can modify the switches or
  re-test/replace its stored secret. Other admin users see only a sanitized
  status. A current download permission is independently checked whenever
  a user views/starts a request.
- Even an enabled submission is **not automatic**: it requires a prepared
  Spotify track owned by the current user, a fresh library duplicate check,
  exact pinned server and account verification, and explicit confirmation.
  Ambiguous dispatch results are never automatically retried.
- **No audio/source verification toggle is exposed from database pairing.**
  The advanced D4–D9 staging-file features remain OFF in the DB-managed
  configuration. They require a separately approved read-only Docker mount
  and a later safety review; a browser setting cannot create that mount.
- **There is no automatic SSD-to-DAS file transfer, cleanup, scanner/indexing
  receipt or Importer v5 takeover.** Existing import services remain active,
  and no source/destination music files are modified by pairing.
- Never paste tokens into GitHub issues, Compose commits or public logs.
  The existing `SETTINGS_ENCRYPTION_KEY` must remain stable; changing it
  invalidates encrypted credentials. The generic `/system-settings` API
  does not include Downtify device secrets.
- v1.19.0 includes a new additive database migration; make a complete cold `/data`
  backup and independently verify restoration **before upgrading an existing deployment**.
  An older image may not undo this schema change; do not rely on image
  downgrade as a database rollback.

**Released image:** `ghcr.io/oxygengs/kima-hub:v1.19.0`. The [native preflight](https://github.com/OxygenGS/kima-hub/actions/runs/42394711879) and [stable publisher](https://github.com/OxygenGS/kima-hub/actions/runs/42397561696) passed their configured gates; residual image vulnerabilities remain documented in [image security](image-security.md). Follow the [backup and rollback guide](safe-aio-updates.md) before a deployment update.
