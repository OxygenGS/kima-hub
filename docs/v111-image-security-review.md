# v1.11 draft AIO assembled-image vulnerability triage

**Status: OPEN / NOT RELEASE APPROVED.** Report reviewed 16 October 2026. This document concerns *disposable GitHub Actions-built images only*, never an independently operated installation.

## Verified evidence

- Combined Draft #7 commit `d42a966379288cae91d437432cbe65f17d5816fc`; [successful Actions run #38946015055](https://github.com/OxygenGS/kima-hub/actions/runs/38946015055) with **9/9 passing jobs**.
- Trivy v0.74.0 scanned the actual assembled local images `kima-hub:aio-ci-smoke`, with `--scanners vuln --severity HIGH,CRITICAL`. It saved JSON reports as CI artifacts `v111-aio-image-vulnerabilities-amd64` and `v111-aio-image-vulnerabilities-arm64`, each retained for 14 days from that run.
- Both images identified Debian 12.15 (bookworm). Trivy's Node.js and Python *language-package* targets contained zero findings in that run. This is **not** proof that all runtime components are secure.

| Architecture | HIGH findings | CRITICAL findings | Findings with Trivy-reported fixed version |
| --- | ---: | ---: | ---: |
| AMD64 | 297 | 8 | 0 |
| ARM64 | 296 | 8 | 0 |

**Important interpretation:** These are vulnerability/package findings, **not distinct exploitable attack paths**; shared FFmpeg libraries create many repeated records. The report contains no vendor-provided fixed-version field for the flagged packages. That does **not** mean the findings are false, safely mitigated or acceptable. A dependency/secret-source scan also passing is insufficient to clear assembled OS packages.

## CRITICAL advisories in both architectures

| Package | Trivy advisory | Scanner status | Release treatment |
| --- | --- | --- | --- |
| `libaom3` | CVE-2023-6879 | affected | Manual codec-exposure and distro-package assessment |
| `libglib2.0-0` | CVE-2026-58016 | fix_deferred | Review linked Debian security status and actual call paths |
| `libmbedcrypto7` | CVE-2025-47917 | end_of_life | Investigate removal/replacement and loaded consumers |
| `libmbedcrypto7` | CVE-2026-34873 | affected | Investigate crypto call paths and packaged mitigations |
| `libmbedcrypto7` | CVE-2026-34875 | affected | Investigate crypto call paths and packaged mitigations |
| `libsqlite3-0` | CVE-2025-7458 | affected | Assess actual consumers and database/input exposure |
| `libxml2` | CVE-2026-6653 | fix_deferred | Validate distro security notes and XML data paths |
| `zlib1g` | CVE-2023-45853 | will_not_fix | Verify affected API use rather than assuming all zlib operations vulnerable |

FFmpeg and corresponding `libav*` packages account for numerous HIGH findings; their use on media files deserves particular scrutiny. These scanner labels are **report observations**, not independent exploit verification.

## Debian dependency-chain evidence (new audit)

The latest fully completed combined test [#38963824375](https://github.com/OxygenGS/kima-hub/actions/runs/38963824375) passed 9/9, including actual image Trivy and secret scans. Its downloadable Debian dependency inventories from both native CPU architectures agree on the critical package versions and direct consumers:

- `libmbedcrypto7 2.28.3-1` is a direct dependency of `librist4`; [Debian's bookworm `libavformat59` package explicitly depends on `librist4`](https://packages.debian.org/bookworm/libs/libavformat59). `ffmpeg` depends on `libavformat59`. **Removing `libmbedcrypto7` or `librist4` without replacing this package chain may break FFmpeg.** It has three CRITICAL advisories according to the scanned Debian metadata.
- `libaom3 3.6.0-1+deb12u3` is used by `libavcodec59`; FFmpeg also requires that library. Do not remove the AOM codec library until audio/video compatibility and the actual dependency chain are proven.
- `libxml2` is also required by `postgresql-16` and `libavformat59`, so simply removing it is not an acceptable shortcut. `libsqlite3-0` has direct consumers in `gpg` and `libpython3.11-stdlib`; `zlib1g` has many direct consumers.
- These are installed-package relationships, **not proof that a particular vulnerable function is reachable by a user's music file**. The scope of FFmpeg file/stream decoding, available codec/protocol functions, and the exact upstream patched package availability need separate expert review.
- The CI inventory script now records the transitive installed-package paths from priority vulnerable packages to FFmpeg on *both* CPU architectures, allowing any attempted mitigation to be compared with the original image.
- **Mitigation decision remains open:** compare a supported base with patched packages, or build/minimize only the required FFmpeg features in an isolated disposable test image. Neither a partial cross-distribution package upgrade nor unconditional `apt purge` is approved. Any alternative must pass ARM64/AMD64 builds, library/audio parity, authentication, and original-image copy-upgrade with independent rollback before considering candidate publication.

## Current published rc2 evidence — 18 October 2026

The historical image scans above are not the final published artifact. The exact rc2 GHCR OCI digest `sha256:c566c59b2aabb150d63cb623c61c5335a41122b224bb08b1df4c55b3a8a2fe56` was [published](https://github.com/OxygenGS/kima-hub/actions/runs/39069358767), [independently runtime-verified](https://github.com/OxygenGS/kima-hub/actions/runs/39070979565), then [scanned by pulling both real platform images](https://github.com/OxygenGS/kima-hub/actions/runs/39101135942). **AMD64: 295 HIGH / 8 CRITICAL; ARM64: 294 HIGH / 8 CRITICAL; neither has Trivy-listed FixedVersion fields.** Exact affected package versions and the non-root/frontend versus root/backend/analyzer inventory are recorded in the [rc2 security disposition](https://github.com/OxygenGS/kima-hub/blob/feature/prerelease-f31e589-verification/docs/v111-rc2-security-disposition.md). CVE triage is OPEN; this is not security approval.

## Security gate and next actions

- The development CI now runs a source-level fixable HIGH/CRITICAL + secrets scan. The AIO-image jobs also produce the full vulnerability JSON for both architectures.
- A small evaluator now **fails each assembled-image CI job for any HIGH/CRITICAL entry with a nonempty `FixedVersion`**; malformed/missing JSON likewise fails closed. It does *not* suppress the unresolved findings. Exact-head CI for this *new gate* must finish before it is claimed validated.
- Review the eight CRITICAL advisories individually against current Debian advisories, installed packages and reachable application data paths; evaluate an updated supported base distribution and rebuilding without unnecessary runtime libraries only in isolated CI (changing the Debian/PostgreSQL/Essentia runtime can break upgrades or audio compatibility).
- Inspect the actual image for non-root process execution, token leakage, server privilege boundaries, dependency and upstream vendored Apache-2.0 licensing; run manual security and device accessibility tests. Record any risk acceptances explicitly with an owner and rationale before approving a candidate.
- None of these findings should be marked fixed or accepted solely because the nine-job workflow is green. No PR merge, release tag, GHCR push, `:latest` update or production deployment is authorized.

References: [security development review](security-review-development.md), [v1.11 release acceptance](v111-release-acceptance.md), [first fork release checklist](first-fork-release-checklist.md).
