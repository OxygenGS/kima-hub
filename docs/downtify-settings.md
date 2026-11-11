# Downtify settings and native importing — Kima Hub

**Encrypted Downtify pairing was introduced in [v1.19.0](https://github.com/OxygenGS/kima-hub/releases/tag/v1.19.0). Native single-track importing and the optional Lidarr-managed handoff are available from [v1.20.0](https://github.com/OxygenGS/kima-hub/releases/tag/v1.20.0).** Upgrading does not enable automatic importing, alter existing mounts or replace any external importer. Verify the complete persistent `/data` backup and an independent restore before upgrading.

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
5. All features start disabled. Use separate switches for the owner-bound queue, saved Spotify track requests, manually confirmed single-track submission and remote-job checks. **Automatic importing** has its own opt-in after a verified source/mount preflight, post-activation baseline and single-writer confirmation. Choose Kima-only or optional Lidarr-managed ownership while import is paused.

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
- Pairing a Downtify device **does not** enable native importing or any media writes. Once the administrator explicitly enables native single-track importing, Kima performs its own original audio/metadata/complete-hash validation. The advanced separate read-only diagnostics remain independently gated; a browser setting cannot mount a host directory.
- There is **no automatic SSD-to-DAS move, source deletion, album/playlist batch dispatch or Importer v5 takeover**. Enabling native importing requires the operator to stop any conflicting external writer; pairing alone changes no music files. For Lidarr-managed mode use an existing separate shared downloads directory, never the final Lidarr library root.
- Never paste tokens into GitHub issues, Compose commits or public logs.
  The existing `SETTINGS_ENCRYPTION_KEY` must remain stable; changing it
  invalidates encrypted credentials. The generic `/system-settings` API
  does not include Downtify device secrets.
- v1.20.0 adds forward-only native-import/Lidarr ledger migrations on top of v1.19.0 encrypted pairing. Make a complete cold `/data` backup and independently verify restoration **before upgrading an existing deployment**.
  An older image may not undo this schema change; do not rely on image
  downgrade as a database rollback.

**Versioned image:** `ghcr.io/oxygengs/kima-hub:v1.20.0` (after the guarded stable publication). [Native importer instructions](downtify-native-auto-import.md) · [Optional Lidarr-managed setup](downtify-lidarr-managed-handoff.md) · [Image security](image-security.md) · [Backup and rollback](safe-aio-updates.md).
