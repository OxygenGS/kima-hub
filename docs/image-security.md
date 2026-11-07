# Container image security and residual risk

This document describes the **current published OxygenGS Kima Hub release**, the scanner evidence and remaining risks. Passing a release gate **does not mean the container image is vulnerability-free**.

## v1.19.0 — current published release (7 November 2026)

The [v1.19.0 native preflight](https://github.com/OxygenGS/kima-hub/actions/runs/42394711879)
passed on the **exact published source commit**
`c99605cbb4946a0aee38ea153263732b29eb72cb`, using independent
native AMD64 and ARM64 builds. It verified architecture and revision,
scanned for known vulnerabilities and embedded secrets, and retained
architecture-specific scan evidence. The preflight did **not** push any image.
The separate [stable approval](https://github.com/OxygenGS/kima-hub/actions/runs/42397547487)
and [Docker publication](https://github.com/OxygenGS/kima-hub/actions/runs/42397561696)
both succeeded, publishing [v1.19.0](https://github.com/OxygenGS/kima-hub/releases/tag/v1.19.0)
with both native architectures.

| v1.19.0 native preflight image | Trivy HIGH | Trivy CRITICAL | HIGH/CRITICAL with scanner-listed patched versions |
| :--- | ---: | ---: | ---: |
| linux/amd64 | 266 | 8 | 0 |
| linux/arm64 | 265 | 8 | 0 |

**Eight CRITICAL advisories remain unresolved in the scanner report on each
architecture**, with **no listed patched version**. They match the advisories
reported for v1.18.0 and are reproduced in the table below. An identical
advisory count is **not** a security clearance: severity and exploitability
depend on the reachable components, vendor backports, deployed configuration
and new upstream information.

- [AMD64 retained scan evidence](https://github.com/OxygenGS/kima-hub/actions/runs/42394711879/artifacts/13583039330)
- [ARM64 retained scan evidence](https://github.com/OxygenGS/kima-hub/actions/runs/42394711879/artifacts/13583208284)
- The native release jobs also ran checks for secrets embedded in the assembled images and verified that both architectures were present in the published manifest.
- Package advisories with no reported fix are **not presumed safe**; Kima bundles media decoders, PostgreSQL, Redis and audio analysis libraries that need exposure-aware assessment.
- The numbers above describe the **preflight images and one Trivy database snapshot**, not an independently refreshed scan of every production installation or the later registry digest. Review the actual deployed image and network boundaries.

### Known critical advisories in the v1.19.0 preflight

| Advisory | Package | Trivy status | Patched version reported |
| :--- | :--- | :--- | :--- |
| CVE-2023-45853 | `zlib1g` | will_not_fix | No |
| CVE-2023-6879 | `libaom3` | affected | No |
| CVE-2025-47917 | `libmbedcrypto7` | end_of_life | No |
| CVE-2025-7458 | `libsqlite3-0` | affected | No |
| CVE-2026-34873 | `libmbedcrypto7` | affected | No |
| CVE-2026-34875 | `libmbedcrypto7` | affected | No |
| CVE-2026-58016 | `libglib2.0-0` | fix_deferred | No |
| CVE-2026-6653 | `libxml2` | fix_deferred | No |

The published image is `ghcr.io/oxygengs/kima-hub:v1.19.0`.
Publication does not remotely update running containers. Review host security
and take a complete independently restorable pre-upgrade `/data` backup,
particularly because the release adds an additive Downtify pairing migration.

## Historical: v1.18.0 — published November 6, 2026

The [v1.18.0 native release preflight](https://github.com/OxygenGS/kima-hub/actions/runs/42180411701)
completed successfully on the **exact released source commit**
`26eaa57b0eb284590b6f7d24d7cd9a622c7bff07`. It built the All-in-One
image independently on AMD64 and ARM64, checked image architecture and revision,
and ran Trivy vulnerability and secret scans. The preflight itself **did not
publish**. A separate [stable approval](https://github.com/OxygenGS/kima-hub/actions/runs/42182732220)
and [Docker publication](https://github.com/OxygenGS/kima-hub/actions/runs/42182749230)
then completed successfully for
[the v1.18.0 GitHub release](https://github.com/OxygenGS/kima-hub/releases/tag/v1.18.0).

| Scanned native AIO preflight image | Trivy HIGH | Trivy CRITICAL | HIGH/CRITICAL with scanner-listed patched versions |
| :--- | ---: | ---: | ---: |
| linux/amd64 | 266 | 8 | 0 |
| linux/arm64 | 265 | 8 | 0 |

The eight CRITICAL advisories are the same ones recorded in the historical
v1.16.0 report below:

| Advisory | Package | Scanner-reported status |
| :--- | :--- | :--- |
| CVE-2023-45853 | `zlib1g` | will_not_fix |
| CVE-2023-6879 | `libaom3` | affected |
| CVE-2025-47917 | `libmbedcrypto7` | end_of_life |
| CVE-2025-7458 | `libsqlite3-0` | affected |
| CVE-2026-34873 | `libmbedcrypto7` | affected |
| CVE-2026-34875 | `libmbedcrypto7` | affected |
| CVE-2026-58016 | `libglib2.0-0` | fix_deferred |
| CVE-2026-6653 | `libxml2` | fix_deferred |

**No scanner-listed patched version does not mean these findings are safe,
unreachable or unimportant.** Counts reflect the release preflight images
and a specific Trivy database snapshot; registry publication rebuilt and
separately verified both native image variants. The packaged source may
still include vulnerable media, database or other dependencies. Operators
must assess exposure for their own installations and keep the host and proxy
secured.

- [AMD64 preflight artifacts](https://github.com/OxygenGS/kima-hub/actions/runs/42180411701/artifacts/13486045578)
- [ARM64 preflight artifacts](https://github.com/OxygenGS/kima-hub/actions/runs/42180411701/artifacts/13485597438)
- Published multi-arch image: `ghcr.io/oxygengs/kima-hub:v1.18.0`. The
  [Docker publication workflow](https://github.com/OxygenGS/kima-hub/actions/runs/42182749230)
  verified both native architectures and reported the registry manifest
  `sha256:9a39cbd61db7709f4bd5ab629ec88728e3f91aa9c0013ac31e973c3a4ba5fa33`.
- The preflight's configured image secret scan passed. It is not a guarantee
  that all paths, future data or externally provided credentials are safe.

## Historical: v1.16.0 — native image preflight

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
