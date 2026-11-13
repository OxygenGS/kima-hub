# Security — OxygenGS Kima Hub

OxygenGS is an independently maintained fork of [Kima Hub](https://github.com/Chevron7Locked/kima-hub). Release reviews apply to **specific images and source commits**, not every network or installation.

## Current stable release

**[v1.22.0](https://github.com/OxygenGS/kima-hub/releases/tag/v1.22.0)** was published on **13 November 2026**, from commit `64b7fbfa4839bcec89f160dc43103fe2887bc979`.

- [Exact-main native preflight](https://github.com/OxygenGS/kima-hub/actions/runs/43379684353): AMD64 and ARM64 builds, image vulnerability scans and configured secret scans passed.
- [Security-reviewed approval](https://github.com/OxygenGS/kima-hub/actions/runs/43391025604) and [stable Docker publisher](https://github.com/OxygenGS/kima-hub/actions/runs/43391050043): completed successfully for both architectures.
- **Residual risk remains:** Trivy reported **327 HIGH / 8 CRITICAL** (AMD64) and **326 HIGH / 8 CRITICAL** (ARM64) advisories. None had an explicitly scanner-listed patched version. This **does not** establish that they are unexploitable or harmless. Review [current image security evidence](docs/image-security.md) before exposing your installation to untrusted networks.

## Authentication and authorization

- Enforce account roles, data isolation and music acquisition/download permissions in the backend, not only by hiding buttons in the frontend.
- Keep tokens, playlists, saved service credentials and per-account download information private. Reject untrusted file paths escaping configured media storage.
- Use a distinct, revocable API token per supported OpenSubsonic client. New supported clients can use modern authentication without enabling legacy authentication.
- The experimental Downtify connection, paired credentials UI, dispatch API and import worker were **removed in v1.21.0**. Do not treat historical receipts and schema records as active integrations.

## Safe deployment and data continuity

- Do not commit a live instance's credentials, hostnames, IP addresses, paths, runtime logs, screenshots or backup archives to this public repository.
- GitHub merges, tags, releases and image uploads **never** update a user-operated Docker host automatically.
- Before changing an existing container, stop application writes, back up its **entire original `/data` volume** and generated secrets, and independently verify a restore. Keep the original Compose/Dockge project identity and `/music` mounts.
- Historical schema migrations remain for upgrades and data preservation. A container-tag rollback is **not** a database rollback; restore a verified pre-upgrade backup when required.
- Do not run `docker compose down -v` against an installation whose data must remain intact.

## Known limitations

- The automatic vulnerability gate blocks HIGH/CRITICAL findings only when the scanner explicitly reports a patched version. Review remaining findings, runtime reachability, vendor advice and exposure manually before accepting release risk.
- CI scans and unit/browser tests are not a penetration test or an independently updated security audit of a deployed digest.
- Keep the reverse proxy on HTTPS, restrict network access and enable appropriate administrator protection. [Deployment security guide](docs/security.md).

## Reporting vulnerabilities

Do not post exploits, private data or tokens in public pull requests. Use a private security-reporting channel provided by the repository if one is enabled; this project does not guarantee that a private GitHub advisory inbox is available.

[Privacy](PRIVACY.md) · [Safe upgrades](docs/safe-aio-updates.md) · [Image advisories](docs/image-security.md) · [Changelog](CHANGELOG.md)
