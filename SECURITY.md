# Security — OxygenGS Kima Hub

This is an independently maintained [Kima Hub fork](https://github.com/Chevron7Locked/kima-hub), not an official upstream security release. Security assurances apply to **specific source commits, images and configurations**, not to every installation.

## Current release and verification

**Published stable:** [v1.19.0](https://github.com/OxygenGS/kima-hub/releases/tag/v1.19.0), source commit `c99605cbb4946a0aee38ea153263732b29eb72cb`.

The [exact-source native preflight](https://github.com/OxygenGS/kima-hub/actions/runs/42394711879) and [stable Docker publication](https://github.com/OxygenGS/kima-hub/actions/runs/42397561696) succeeded for AMD64 and ARM64. Their configured checks found no image-embedded secrets, but reported **8 CRITICAL and 265–266 HIGH** vulnerability advisories with **no scanner-listed fixes**. CI success is not proof of zero residual risk. See the [full image security report](docs/image-security.md).

## Authentication and authorization

- Enforce roles and the current account's acquisition/download permissions on every backend request, regardless of front-end visibility or language.
- Keep downloaded music, tokens, user data and image endpoints isolated by account. Reject untrusted paths or filenames escaping the configured music root.
- Native-player API tokens should be unique per client, revocable, and handled as credentials; no legacy authentication or compatibility mode is required for freshly configured supported clients.
- Downtify settings use **administrator-only**, server-and-account-bound encrypted device pairing. All active controls default OFF. No other user's jobs or devices may be exposed through the queue or dispatch APIs.
- A saved Spotify request does not automatically start a download; manual Downtify dispatch must be explicitly authorized and independently checked. Uncertain dispatch outcomes must not be automatically retried.

## Data and upgrade boundaries

- Private installation values (credentials, hostnames, addresses, media paths, backups, container IDs and runtime logs) must not be committed to public source or issues.
- A release merge, tag, build or GitHub Action does **not** deploy changes to a running Docker/Proxmox installation.
- Before any upgrade, create a **cold, complete backup** of the original persistent `/data` (including generated secrets), retain the original deployment configuration and verify an independent restore.
- Database migrations, including the new v1.19.0 Downtify pairing table, are not reversed by changing the Docker image tag. Restore an untouched pre-upgrade `/data` backup when rolling back across migrations.
- No browser setting provisions a new Docker staging mount or automatically authorizes SSD-to-DAS file transfers, import cleanup or replacement of the existing external importer.

## Known limitations and release review

- Native scans block HIGH/CRITICAL findings only when the scanner explicitly reports a patched version. Findings without one are **not automatically accepted as safe**. Review actual runtime reachability, vendor status and deployment exposure before each stable release.
- Independent permission and abuse-case testing remains necessary; static analysis, regression suites and smoke tests are not penetration tests.
- Docker images may contain vulnerable components even when the source repository contains no secrets. Reassess installed packages and scan the actual deployed image.
- Upstream source changes must preserve fork-specific authentication, privacy, storage and data-loss safeguards.

## Reporting vulnerabilities

Do not publish exploitable details, credentials or personal data in public GitHub issues or pull requests. Contact the maintainer through an available **private** GitHub security-reporting channel when enabled. This document makes no promise of a specific response time or availability of a private advisory inbox.

See [Privacy](PRIVACY.md), [Secure upgrades](docs/safe-aio-updates.md), [Image security](docs/image-security.md) and the [release history](CHANGELOG.md).
