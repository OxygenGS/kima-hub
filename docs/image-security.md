# Container image security and residual risk

This document describes the **current published OxygenGS Kima Hub release**, the scanner evidence and remaining risks. Passing a release gate **does not mean the container image is vulnerability-free**.

## v1.26.0 — current published release (18 November 2026)

The [v1.26.0 exact-main native preflight](https://github.com/OxygenGS/kima-hub/actions/runs/44255014369) verified commit `3a1e0d84c12ed1e0e429bba4e7bb4bc3f4c0f4a7`, built native AMD64/ARM64 images and passed the configured architecture, source, vulnerability-policy and secret checks. [Explicit release approval](https://github.com/OxygenGS/kima-hub/actions/runs/44257548201) and [Docker publication](https://github.com/OxygenGS/kima-hub/actions/runs/44257591587) succeeded. The published image is `ghcr.io/oxygengs/kima-hub:v1.26.0`.

| Native v1.26.0 preflight | Trivy HIGH | Trivy CRITICAL | HIGH/CRITICAL with scanner-listed patched versions |
| :--- | ---: | ---: | ---: |
| linux/amd64 | **393** | **8** | **0** |
| linux/arm64 | **392** | **8** | **0** |

These are the same counts and eight CRITICAL advisory identifiers as v1.25.0. **They remain unresolved**: neither a missing scanner-listed patch nor a green release workflow proves a risk is not exploitable. Kima processes media and can be exposed to untrusted inputs; review network/media exposure and maintain a separately restorable cold `/data` backup before upgrading.

- [AMD64 Trivy evidence](https://github.com/OxygenGS/kima-hub/actions/runs/44255014369/artifacts/14405189464)
- [ARM64 Trivy evidence](https://github.com/OxygenGS/kima-hub/actions/runs/44255014369/artifacts/14405993333)
- [Recorded residual findings](https://github.com/OxygenGS/kima-hub/pull/269#issuecomment-6971795290) (not an acceptance statement)
- [Published v1.26.0 release](https://github.com/OxygenGS/kima-hub/releases/tag/v1.26.0)

These values reflect the *preflight build and its scanner database*, not an independently scanned live deployment.

## Unpublished v1.27.0 and v1.28.0 source candidates — NOT approved for publication

The **published stable remains v1.26.0**. The following numbers come from GitHub Actions builds of unpublished PR source at the stated exact commits, **not** final exact-`main` Native Release Preflight results or registry images.

| Candidate source and architecture | Trivy HIGH | Trivy CRITICAL | HIGH/CRITICAL with a scanner-listed fixed version |
| :--- | ---: | ---: | ---: |
| [v1.27.0 PR #277, commit `42b19a7`](https://github.com/OxygenGS/kima-hub/pull/277), amd64 | 389 | 8 | 0 |
| v1.27.0, arm64 | 388 | 8 | 0 |
| [v1.28.0 PR #284, commit `92b7bdd`](https://github.com/OxygenGS/kima-hub/pull/284), amd64 | 391 | 8 | 0 |
| v1.28.0, arm64 | 390 | 8 | 0 |

- v1.27.0: [AMD64 scan](https://github.com/OxygenGS/kima-hub/actions/runs/44609091119/artifacts/14572637841) and [ARM64 scan](https://github.com/OxygenGS/kima-hub/actions/runs/44609091119/artifacts/14573321003).
- v1.28.0 at **`92b7bdd` only**: [AMD64 scan](https://github.com/OxygenGS/kima-hub/actions/runs/45257169903/artifacts/14860915206) and [ARM64 scan](https://github.com/OxygenGS/kima-hub/actions/runs/45257169903/artifacts/14858529755).

Both scans report the same eight CRITICAL advisories for `zlib1g`, `libaom3`, `libmbedcrypto7` (three advisories), `libsqlite3-0`, `libglib2.0-0`, and `libxml2` as the published stable above. A missing scanner-listed patched version is **not** proof that a package cannot be exploited or that no fix or mitigation is possible. The v1.28.0 release branch has **advanced beyond `92b7bdd`**; the figures in this table must not be misrepresented as the final candidate's results.

**Release gate:** obtain independent source review of v1.27.0, inspect each unresolved advisory and available package/feature mitigations, document the human security decision, and build/scan **the exact merged `main`** on AMD64 and ARM64 before separately approving any stable publication. Only after an approved v1.27.0 release can the v1.28.0 branch be reconciled to the actual `main`, revalidated, independently reviewed, and considered for separate publication. Green PR CI does not waive this gate.

## Historical: v1.25.0 — published 16 November 2026

The [exact-main v1.25.0 native preflight](https://github.com/OxygenGS/kima-hub/actions/runs/43942681293) verified `main` source `0bda03e90ac12260b0f9307c799f2fc3a96a44a2`, built separate AMD64/ARM64 images, confirmed their architecture and revision labels, and passed configured secret and fixable-vulnerability checks without publishing. [Explicit approved stable publication](https://github.com/OxygenGS/kima-hub/actions/runs/43945776519) preceded the [successful native multi-architecture Docker publication](https://github.com/OxygenGS/kima-hub/actions/runs/43945829307). The previously published v1.25.0 image is `ghcr.io/oxygengs/kima-hub:v1.25.0`.

| Native v1.25.0 preflight image | Trivy HIGH | Trivy CRITICAL | HIGH/CRITICAL with scanner-listed patched versions |
| :--- | ---: | ---: | ---: |
| linux/amd64 | **393** | **8** | **0** |
| linux/arm64 | **392** | **8** | **0** |

Relative to the v1.24.1 preflight, the HIGH count increased by 62 per architecture while CRITICAL remained at eight. The change is dominated by seven newly listed FFmpeg vulnerabilities distributed over nine FFmpeg packages; the affected installed FFmpeg version did not change between these builds. This is not a declaration of exploitability or safety: media-processing code may handle untrusted input, so the vulnerabilities require exposure-aware review.

**Eight CRITICAL advisories remain unresolved:** `CVE-2023-45853`, `CVE-2023-6879`, `CVE-2025-47917`, `CVE-2025-7458`, `CVE-2026-34873`, `CVE-2026-34875`, `CVE-2026-58016` and `CVE-2026-6653`. No fixed package version was explicitly listed in the Trivy output. Do not assume these vulnerabilities cannot be exploited just because an automated gate passed.

- [AMD64 Trivy evidence](https://github.com/OxygenGS/kima-hub/actions/runs/43942681293/artifacts/14265201415)
- [ARM64 Trivy evidence](https://github.com/OxygenGS/kima-hub/actions/runs/43942681293/artifacts/14263234002)
- [Recorded residual-risk review](https://github.com/OxygenGS/kima-hub/pull/261#issuecomment-6927678235)
- [Published GitHub Release v1.25.0](https://github.com/OxygenGS/kima-hub/releases/tag/v1.25.0)

These figures are from the *build-only preflight images* and that scanner database snapshot, not independent post-publication registry or live-host scans. Apply host/proxy updates, restrict public exposure, protect secrets and maintain a separately restorable cold backup of `/data`.

## Historical: v1.24.1 — published 14 November 2026

The [v1.24.1 native preflight](https://github.com/OxygenGS/kima-hub/actions/runs/43631175191) validated exact `main` source SHA `94999192731eda338c6eb9c154982a6f1a9c8b68`. Native AMD64 and ARM64 builds passed the configured architecture, revision-label, secrets and fixable-vulnerability gates **without publishing an image**. [Explicit stable approval](https://github.com/OxygenGS/kima-hub/actions/runs/43634518503) preceded the [successful native multi-architecture publication](https://github.com/OxygenGS/kima-hub/actions/runs/43634534788). The current published image is `ghcr.io/oxygengs/kima-hub:v1.24.1`.

| Native v1.24.1 preflight image | Trivy HIGH | Trivy CRITICAL | HIGH/CRITICAL with scanner-listed patched versions |
| :--- | ---: | ---: | ---: |
| linux/amd64 | 331 | 8 | 0 |
| linux/arm64 | 330 | 8 | 0 |

**Remaining security risk:** The same eight CRITICAL advisories listed below for v1.24.0 remain present, and no fixed versions were listed by this scanner database. No assertion about code-path reachability, image safety or exploitability follows from a green workflow. In comparison with v1.24.0, the four extra HIGH findings per architecture are four packages of the **same additional advisory `CVE-2025-6020`** in the PAM family (`libpam-modules`, `libpam-modules-bin`, `libpam-runtime`, `libpam0g`), all reported at `1.5.2-6+deb12u2` with no scanner-listed fix. Package versions were unchanged across the compared preflight images. The advisory concerns potential local privilege escalation through `pam_namespace`; actual applicability to Kima's runtime has not been demonstrated and must not be assumed safe.

- [AMD64 preflight evidence](https://github.com/OxygenGS/kima-hub/actions/runs/43631175191/artifacts/14129125573)
- [ARM64 preflight evidence](https://github.com/OxygenGS/kima-hub/actions/runs/43631175191/artifacts/14128816349)
- [Documented residual-risk review](https://github.com/OxygenGS/kima-hub/pull/254#issuecomment-6883258321)
- [Published GitHub Release v1.24.1](https://github.com/OxygenGS/kima-hub/releases/tag/v1.24.1)

Preflight values are snapshots of **build-only images**, not post-publication registry scans or proof of safety on a particular user's Docker host. Keep network access restricted, patch the host and proxy, protect credentials and verify independently restorable `/data` backups. Reassess base image and potentially unused PAM/legacy dependencies in future releases.

## Historical: v1.24.0 — published 13 November 2026

The [v1.24.0 native preflight](https://github.com/OxygenGS/kima-hub/actions/runs/43513883835) verified exact `main` source SHA `8f4402d0c1c25adbbc6edfe4afb8d97f9d75aa67`. Native AMD64 and ARM64 AIO images built successfully and passed configured architecture, source revision, secret and fixable-vulnerability gates. The [explicit release approval](https://github.com/OxygenGS/kima-hub/actions/runs/43517341212) preceded the [successful native multi-architecture Docker publication](https://github.com/OxygenGS/kima-hub/actions/runs/43517365837). The published stable tag is `ghcr.io/oxygengs/kima-hub:v1.24.0`.

| Native v1.24.0 preflight image | Trivy HIGH | Trivy CRITICAL | HIGH/CRITICAL with scanner-listed patched versions |
| :--- | ---: | ---: | ---: |
| linux/amd64 | 327 | 8 | 0 |
| linux/arm64 | 326 | 8 | 0 |

**Unresolved security risk:** These results do **not** mean the published image is free of vulnerabilities or that the affected code is unreachable. The Trivy reports list no patched versions for the HIGH/CRITICAL issues; scanner availability is not proof that no remediation or upstream fix exists. The following eight CRITICAL advisory identifiers remain present on both architectures (same as the v1.23.0 preflight):

| Advisory | Reported package | Trivy status |
| :--- | :--- | :--- |
| CVE-2023-45853 | `zlib1g` | will_not_fix |
| CVE-2023-6879 | `libaom3` | affected |
| CVE-2025-47917 | `libmbedcrypto7` | end_of_life |
| CVE-2025-7458 | `libsqlite3-0` | affected |
| CVE-2026-34873 | `libmbedcrypto7` | affected |
| CVE-2026-34875 | `libmbedcrypto7` | affected |
| CVE-2026-58016 | `libglib2.0-0` | fix_deferred |
| CVE-2026-6653 | `libxml2` | fix_deferred |

- [AMD64 vulnerability evidence](https://github.com/OxygenGS/kima-hub/actions/runs/43513883835/artifacts/14080463333)
- [ARM64 vulnerability evidence](https://github.com/OxygenGS/kima-hub/actions/runs/43513883835/artifacts/14079963241)
- [Recorded advisory and exposure review](https://github.com/OxygenGS/kima-hub/pull/250#issuecomment-6866100706)
- [Published GitHub Release v1.24.0](https://github.com/OxygenGS/kima-hub/releases/tag/v1.24.0)

These counts describe the preflight images and that scanner database snapshot, not an independent re-scan of every deployed registry digest. Restrict network access, protect application secrets, patch the host and reverse proxy, and maintain a verified separately restorable `/data` backup.

## Historical: v1.23.0 — published 13 November 2026

The [v1.23.0 native preflight](https://github.com/OxygenGS/kima-hub/actions/runs/43441027590) verified the exact `main` source commit `7357993d70bfe4c51eca4e5f54cb813a31c17f8a`, native AMD64/ARM64 image architecture and revision labels, the configured secret scan and the vulnerability gate. [Explicit release approval](https://github.com/OxygenGS/kima-hub/actions/runs/43444147613) preceded the [successful multi-architecture Docker publication](https://github.com/OxygenGS/kima-hub/actions/runs/43444182159). The stable image is `ghcr.io/oxygengs/kima-hub:v1.23.0`.

| Native v1.23.0 preflight image | Trivy HIGH | Trivy CRITICAL | HIGH/CRITICAL with scanner-listed patched versions |
| :--- | ---: | ---: | ---: |
| linux/amd64 | 327 | 8 | 0 |
| linux/arm64 | 326 | 8 | 0 |

**Known residual risk:** These are unresolved scanner findings, not a declaration of safety. The preflight found no explicitly listed patched versions for the HIGH/CRITICAL advisories. That does not establish that a vulnerable package cannot be exploited or that a fix is unavailable elsewhere. The same eight CRITICAL advisories observed in v1.22.0 remain:

| Advisory | Package | Trivy status |
| :--- | :--- | :--- |
| CVE-2023-45853 | `zlib1g` | will_not_fix |
| CVE-2023-6879 | `libaom3` | affected |
| CVE-2025-47917 | `libmbedcrypto7` | end_of_life |
| CVE-2025-7458 | `libsqlite3-0` | affected |
| CVE-2026-34873 | `libmbedcrypto7` | affected |
| CVE-2026-34875 | `libmbedcrypto7` | affected |
| CVE-2026-58016 | `libglib2.0-0` | fix_deferred |
| CVE-2026-6653 | `libxml2` | fix_deferred |

- [AMD64 exact-source scan artifact](https://github.com/OxygenGS/kima-hub/actions/runs/43441027590/artifacts/14047546020)
- [ARM64 exact-source scan artifact](https://github.com/OxygenGS/kima-hub/actions/runs/43441027590/artifacts/14046810977)
- [Published v1.23.0 release](https://github.com/OxygenGS/kima-hub/releases/tag/v1.23.0)

The counts above describe the native *preflight images*, not an independent post-publication registry digest scan or an operator's runtime exposure. Kima includes media processing and network-facing components; restrict remote exposure, patch the host and proxy, protect credentials, and maintain a separately restorable `/data` backup. Future releases should revisit the vendor advisories.

## Historical: v1.22.0 — published 13 November 2026

The [v1.22.0 native preflight](https://github.com/OxygenGS/kima-hub/actions/runs/43379684353)
verified source commit `64b7fbfa4839bcec89f160dc43103fe2887bc979`.
The exact-source native AMD64/ARM64 builds, architecture labels, image
vulnerability scans and configured secret scans all passed. The
[explicit security approval](https://github.com/OxygenGS/kima-hub/actions/runs/43391025604)
and [stable Docker publication](https://github.com/OxygenGS/kima-hub/actions/runs/43391050043)
also succeeded, with both architectures verified in the final OCI index.

| Native v1.22.0 preflight image | Trivy HIGH | Trivy CRITICAL | HIGH/CRITICAL with scanner-listed patched versions |
| :--- | ---: | ---: | ---: |
| linux/amd64 | 327 | 8 | 0 |
| linux/arm64 | 326 | 8 | 0 |

**These are unresolved findings, not a declaration of safety.** Trivy reported
no explicit patched versions for these HIGH/CRITICAL findings. This is not
proof that mitigations are impossible, that the issues are unexploitable,
or that affected libraries are unreachable. Both images passed the configured
secret scan and the automatic fixable-vulnerability gate. Media decoders,
system libraries and services processing untrusted input require exposure-aware
review.

The eight CRITICAL advisories on both architectures are:

| Advisory | Package | Scanner status |
| :--- | :--- | :--- |
| CVE-2023-45853 | `zlib1g` | will_not_fix |
| CVE-2023-6879 | `libaom3` | affected |
| CVE-2025-47917 | `libmbedcrypto7` | end_of_life |
| CVE-2025-7458 | `libsqlite3-0` | affected |
| CVE-2026-34873 | `libmbedcrypto7` | affected |
| CVE-2026-34875 | `libmbedcrypto7` | affected |
| CVE-2026-58016 | `libglib2.0-0` | fix_deferred |
| CVE-2026-6653 | `libxml2` | fix_deferred |

- [AMD64 preflight scan artifact](https://github.com/OxygenGS/kima-hub/actions/runs/43379684353/artifacts/14016721925)
- [ARM64 preflight scan artifact](https://github.com/OxygenGS/kima-hub/actions/runs/43379684353/artifacts/14016114315)
- [Published v1.22.0 release](https://github.com/OxygenGS/kima-hub/releases/tag/v1.22.0): `ghcr.io/oxygengs/kima-hub:v1.22.0`.

These counts describe preflight images and one scanner database snapshot,
not a separate, refreshed post-publication registry scan or a guarantee for
a deployed host. The retired external importer code remains absent in v1.22.0;
existing music and historical database records are preserved. Operators must
verify a complete `/data` backup, preserve the correct `/music` mount and
review network exposure before updating.

## Historical: v1.21.0 — published 12 November 2026

The prior [v1.21.0 native preflight](https://github.com/OxygenGS/kima-hub/actions/runs/43303576669)
and [stable publisher](https://github.com/OxygenGS/kima-hub/actions/runs/43306092748)
passed. It reported the same 327/326 HIGH and 8 CRITICAL advisory counts
with no scanner-listed patched versions. See [v1.21.0](https://github.com/OxygenGS/kima-hub/releases/tag/v1.21.0)
and the retained GitHub Action evidence for the historical snapshot.

## Historical: v1.20.0 — published 12 November 2026

This release introduced experimental Downtify importing and optional Lidarr
handoff; those application features were retired in v1.21.0. Historical
database migrations and already imported music are preserved.
[Release archive](https://github.com/OxygenGS/kima-hub/releases/tag/v1.20.0).

## Historical: v1.19.0 — published 7 November 2026

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
