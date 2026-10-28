# OxygenGS image security and residual risks

This is an overview of **known scanner findings**, not a certification, an exploit demonstration or a claim that the final published registry image has been independently audited. The original source and full GitHub Actions reports remain accessible through Git history and the linked runs.

## Native v1.12.0 source-built image preflight

The v1.12.0 native preflight built and scanned the exact source commit `400058238dcf826bd50faaf2b1b59cb425e944be` on AMD64 and ARM64 runners without publishing images. The subsequent stable Docker publisher completed successfully. These scan counts describe the **preflight images**, not a separate verification of the published registry digest.

| Native preflight image | Trivy HIGH | Trivy CRITICAL | HIGH/CRITICAL with scanner-listed fixed versions |
| --- | ---: | ---: | ---: |
| AMD64 | 288 | 8 | 0 |
| ARM64 | 287 | 8 | 0 |

The critical advisories reported for both architectures were CVE-2023-45853 (zlib1g), CVE-2023-6879 (libaom3), CVE-2025-47917, CVE-2026-34873 and CVE-2026-34875 (libmbedcrypto7), CVE-2025-7458 (libsqlite3-0), CVE-2026-58016 (libglib2.0-0), and CVE-2026-6653 (libxml2).

The prior v1.11.0 report also listed eight critical findings across the same package families. This is **not** proof that every CVE identifier was unchanged or that the affected code is exploitable in Kima. The scanner blocks findings that report a fixed package version, and reports the others for explicit assessment; passing it is **not** a zero-risk certification. Bookworm security-tracker statuses and residual-risk review are recorded in [release PR #141](https://github.com/OxygenGS/kima-hub/pull/141).

## Native v1.11.0 source-built image audit

The real AIO images built on native AMD64 and ARM64 GitHub runners from the combined application source `4c26b502537092da764791e83266f7b1a2d0ab61` passed the [9-job implementation workflow](https://github.com/OxygenGS/kima-hub/actions/runs/39296775113), including actual login/audio behavior, service identity checks and old-image copy-upgrade with independent rollback.

| Native image | Trivy HIGH | Trivy CRITICAL | HIGH/CRITICAL entries with scanner-listed fixed versions |
| --- | ---: | ---: | ---: |
| AMD64 | 295 | 8 | 0 |
| ARM64 | 294 | 8 | 0 |

The reports and Debian package inventory were retained as artifacts on that workflow. These are **package/advisory findings**, not 303 distinct demonstrated app exploits. The absence of a `FixedVersion` does **not** prove they are harmless or resolved.

The eight critical scanner records included `libaom3`, `libglib2.0-0`, `libmbedcrypto7` (three advisories), `libsqlite3-0`, `libxml2` and `zlib1g`. Some are dependencies of FFmpeg, PostgreSQL or Python, so blindly removing them may break the app. The image-build workflow blocks any HIGH/CRITICAL item with an explicitly listed available fixed version, and separately scans for embedded secrets.

## Service boundaries

The v1.11.0 backend and Essentia/CLAP audio analyzers run under distinct **non-root service identities** with reduced capabilities; native CI confirmed denial of stored backend secrets and Supervisor socket access. The bootstrap and Supervisor remain privileged, and these controls do not verify a custom host's GPU, ACLs, filesystem mounts or network exposure.

## Before exposing an instance

Use current supported host updates, network access controls and HTTPS reverse proxy configuration. Limit access to port 3030, back up all `/data` (including secrets) and verify rollback before upgrades. Review the [stable Docker publisher](https://github.com/OxygenGS/kima-hub/actions/workflows/docker-publish.yml) for the **exact release tag**, since the published digest is a distinct image from a local CI build.

See [security](security.md), [safe updates](safe-aio-updates.md), [configuration](configuration.md) and [SECURITY.md](../SECURITY.md).
