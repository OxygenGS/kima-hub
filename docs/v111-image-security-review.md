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

## Security gate and next actions

- The development CI now runs a source-level fixable HIGH/CRITICAL + secrets scan. The AIO-image jobs also produce the full vulnerability JSON for both architectures.
- A small evaluator now **fails each assembled-image CI job for any HIGH/CRITICAL entry with a nonempty `FixedVersion`**; malformed/missing JSON likewise fails closed. It does *not* suppress the unresolved findings. Exact-head CI for this *new gate* must finish before it is claimed validated.
- Review the eight CRITICAL advisories individually against current Debian advisories, installed packages and reachable application data paths; evaluate an updated supported base distribution and rebuilding without unnecessary runtime libraries only in isolated CI (changing the Debian/PostgreSQL/Essentia runtime can break upgrades or audio compatibility).
- Inspect the actual image for non-root process execution, token leakage, server privilege boundaries, dependency and upstream vendored Apache-2.0 licensing; run manual security and device accessibility tests. Record any risk acceptances explicitly with an owner and rationale before approving a candidate.
- None of these findings should be marked fixed or accepted solely because the nine-job workflow is green. No PR merge, release tag, GHCR push, `:latest` update or production deployment is authorized.

References: [security development review](security-review-development.md), [v1.11 release acceptance](v111-release-acceptance.md), [first fork release checklist](first-fork-release-checklist.md).
