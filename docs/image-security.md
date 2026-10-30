# Container image security and residual risk

This document describes the **current published OxygenGS Kima Hub release**, the scanner evidence and remaining risks. Passing a release gate **does not mean the container image is vulnerability-free**.

## v1.16.0 — native image preflight

The [v1.16.0 native preflight](https://github.com/OxygenGS/kima-hub/actions/runs/41067045144) completed on **October 30, 2026** using the exact merged `main` commit `46b0dba68a28d5ebc47e8085d617e431b86723cb`. It built the application independently on AMD64 and ARM64, ran vulnerability and secret checks, and **did not publish an image**.

| Scanned native AIO image | Trivy HIGH | Trivy CRITICAL | HIGH/CRITICAL with scanner-listed patched versions |
| :--- | ---: | ---: | ---: |
| linux/amd64 | 270 | 8 | 0 |
| linux/arm64 | 269 | 8 | 0 |

The eight CRITICAL advisories reported on each architecture were:

| Advisory | Reported package | Scanner-reported status |
| :--- | :--- | :--- |
| CVE-2023-45853 | `zlib1g` | will_not_fix |
| CVE-2023-6879 | `libaom3` | affected |
| CVE-2025-47917 | `libmbedcrypto7` | end_of_life |
| CVE-2025-7458 | `libsqlite3-0` | affected |
| CVE-2026-34873 | `libmbedcrypto7` | affected |
| CVE-2026-34875 | `libmbedcrypto7` | affected |
| CVE-2026-58016 | `libglib2.0-0` | fix_deferred |
| CVE-2026-6653 | `libxml2` | fix_deferred |

The preflight reports **no explicitly scanner-listed fixed version** for these advisories. This does **not** establish that they are harmless, unreachable, resolved or impossible to patch. Some affected packages are used by bundled media processing, database or other system software. Removing packages without examining runtime dependencies can break playback, indexing or startup.

Trivy's image secret scan found no findings under its configured rules and exclusions. That result is limited to the scan scope and does not replace protecting application-generated secrets in `/data`.

### Source validation and publication

The release was published only after an explicit security-reviewed approval:

- [Native AMD64/ARM64 preflight and retained scan artifacts](https://github.com/OxygenGS/kima-hub/actions/runs/41067045144)
- [Approved stable-release gate](https://github.com/OxygenGS/kima-hub/actions/runs/41072247107)
- [Docker publication workflow](https://github.com/OxygenGS/kima-hub/actions/runs/41072280580)
- [v1.16.0 GitHub Release](https://github.com/OxygenGS/kima-hub/releases/tag/v1.16.0)

The published multi-architecture registry image is a **separate build artifact**. The figures above describe the native **preflight** images, not an independent post-publication vulnerability audit of every registry digest. Verify the exact released tag/digest when assessing your deployment.

## Runtime and deployment boundaries

The application backend and bundled audio analysis services run under separate non-root identities with reduced capabilities. Bootstrap and supervisor operations still require elevated privileges; these controls are not a replacement for host hardening. CI does not validate the particular ACLs, network exposure, storage permissions or GPU setup of your installation.

Before exposing an instance:

- Keep the Docker host, operating system and reverse proxy patched; restrict access to the web/API port `3030` and use HTTPS for remote connections.
- Use explicit version tags or immutable image digests instead of an implicitly moving `:latest` reference.
- Protect API keys and all application data in `/data`, including secrets. Create a complete pre-upgrade backup and verify a separate restore.
- Review scanner advisories against the actual packages and functions in use; track fixes and reassess residual risk before subsequent upgrades.

Earlier release preflight reports and security evidence remain available in [GitHub Actions history](https://github.com/OxygenGS/kima-hub/actions/workflows/v112-native-preflight.yml) and the [release history](../CHANGELOG.md). Previous snapshot counts are not treated as current-release findings here.

[General security guidance](security.md) · [Safe updates](safe-aio-updates.md) · [Configuration](configuration.md) · [Responsible disclosure](../SECURITY.md)
