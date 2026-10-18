# OxygenGS Kima Hub v1.11.0 rc2 — published-image security evidence

**Recorded:** 18 October 2026. **Disposition: OPEN; stable release NOT approved.**
This document belongs to the independent **verification branch**, not the source/release commit. It must not be mistaken for a fix, risk acceptance, production test, or a change to the published rc2 image.

## Exact subject and evidence

- Reviewed application source: `ec44b98d9f69175b08bd2c6c88b0fb6552d6581c` (combined Draft [PR #7](https://github.com/OxygenGS/kima-hub/pull/7), not merged).
- Published tag: `ghcr.io/oxygengs/kima-hub:prerelease-v111-rc2`.
- **Immutable multiarch OCI index**: `ghcr.io/oxygengs/kima-hub@sha256:c566c59b2aabb150d63cb623c61c5335a41122b224bb08b1df4c55b3a8a2fe56`.
- Native AMD64/ARM64 publisher [run #39069358767](https://github.com/OxygenGS/kima-hub/actions/runs/39069358767) succeeded. It blocks image HIGH/CRITICAL entries **with Trivy-listed fixes**, and detects embedded secrets before staging; it does NOT categorically clear unfixed findings.
- **Independent real published-image** [verification run #39070979565](https://github.com/OxygenGS/kima-hub/actions/runs/39070979565) passed 3/3: digest and revision label, native AMD64/ARM64 image pulls, loopback network boundaries, frontend non-root, real HTTP admin/listener, EN/NL browser, audio, original upstream v1.10/v1.11 copied-data upgrade and separately restored old-image rollback.
- **Published rc2 image audit PASSED 2/2:** [run #39101135942](https://github.com/OxygenGS/kima-hub/actions/runs/39101135942) downloaded the **exact immutable index** separately on native AMD64 and ARM64, checked each image's architecture/source label and shipped Apache-2.0 license, saved installed Debian packages and the supervisor process-user inventory, and rescanned both actual images with Trivy v0.74.0 (no unfixed suppression). **AMD64: 295 HIGH / 8 CRITICAL; ARM64: 294 HIGH / 8 CRITICAL; zero records listed a FixedVersion.** Downloadable `rc2-published-security-amd64` and `rc2-published-security-arm64` artifacts include full JSON, critical-issue TSV, package list and process configuration. 8 CRITICAL records per architecture are scanner findings, **not** eight verified exploitable attack paths. Passing the no-fix-listed gate is not security acceptance.
- This is **not** a representative independent installation backup rehearsal; all automated restore tests used synthetic test data.

## Eight original CRITICAL scanner records and Debian advisories

These observations use the official [Debian Security Tracker](https://security-tracker.debian.org/tracker/), checked on 18 October 2026. Severity is the **scanner's** rating; Debian's distribution/security response can differ.

| Debian binary package | Advisory | Debian bookworm status / question | Disposition |
| --- | --- | --- | --- |
| `libaom3` | [CVE-2023-6879](https://security-tracker.debian.org/tracker/CVE-2023-6879) | Bookworm vulnerable/no DSA; vulnerable operation described as multi-threaded AV1 **encoding** on changing frame resolution. Is that encoding path reachable from music operations? | OPEN: confirm actual FFmpeg invocation and decoder/encoder exposure |
| `libglib2.0-0` | [CVE-2026-58016](https://security-tracker.debian.org/tracker/CVE-2026-58016) | Bookworm vulnerable/postponed; crafted D-Bus introspection XML parser out-of-bounds read. | OPEN: confirm linked processes and whether untrusted XML reaches this parser |
| `libmbedcrypto7` | [CVE-2025-47917](https://security-tracker.debian.org/tracker/CVE-2025-47917) | Bookworm Mbed TLS 2.28.3-1 vulnerable/EOL; x509 names function use-after-free conditions. | OPEN: verify whether librist/FFmpeg ever calls the affected functionality |
| `libmbedcrypto7` | [CVE-2026-34873](https://security-tracker.debian.org/tracker/CVE-2026-34873) | Bookworm tracker says vulnerable/no DSA; description specifies TLS 1.3 session resumption, while the installed package is 2.28.3. | OPEN: version-range/applicability mismatch merits specialist verification, NOT silent dismissal |
| `libmbedcrypto7` | [CVE-2026-34875](https://security-tracker.debian.org/tracker/CVE-2026-34875) | Bookworm tracker says vulnerable/no DSA; public-key export for FFDH keys. | OPEN: establish reachable function paths and upstream fixed versions |
| `libsqlite3-0` | [CVE-2025-7458](https://security-tracker.debian.org/tracker/CVE-2025-7458) | Bookworm vulnerable/no DSA; needs attacker-controlled SQLite statements with crafted ORDER BY. App database is PostgreSQL; other libraries still link SQLite. | OPEN: find actual SQLite clients and SQL control surface |
| `libxml2` | [CVE-2026-6653](https://security-tracker.debian.org/tracker/CVE-2026-6653) | Bookworm vulnerable/postponed; crafted XML triggering parser use-after-free. `libavformat59` and PostgreSQL depend on libxml2. | OPEN: verify untrusted XML input parsing |
| `zlib1g` | [CVE-2023-45853](https://security-tracker.debian.org/tracker/CVE-2023-45853) | Bookworm's zlib source is marked **ignored**: affected MiniZip component is not built in the relevant zlib binaries; separate `minizip` source fixed. | REQUIRES DOCUMENTED SCANNER DISPOSITION: strong distro evidence for non-applicability to `zlib1g`, without claiming every MiniZip copy in image is safe |

For the three Mbed TLS findings, Debian [`librist4`](https://packages.debian.org/bookworm/librist4) depends on `libmbedcrypto7`, and [`libavformat59`](https://packages.debian.org/bookworm/libs/libavformat59) depends on `librist4`. Purging a suspect library in isolation will break legitimate FFmpeg package dependencies. No cross-release `apt` mixing or package removal without a full runtime compatibility test.

## Privilege and secret boundaries — confirmed source, incomplete runtime mitigation

- Dockerfile supervisor runs as **root**; its `postgres` and `redis` programs explicitly drop privileges, and frontend explicitly uses `kimaweb`. Real published-image smoke logged a non-root `kimaweb` frontend process.
- The **backend**, `audio-analyzer` and `audio-analyzer-clap` program entries contain **no `user=` directive**, therefore inherit supervisor's root identity. Non-root backend/analyzer hardening remains **open**. Do not suggest the successful frontend check covers all processes. The actual *published rc2* audit independently confirmed this same user mapping on **both** architectures (PostgreSQL=`postgres`, Redis=`redis`, frontend=`kimaweb`; backend and both analyzers=root).
- Fresh AIO PostgreSQL and backend bind to loopback; PostgreSQL HBA rejects remote addresses, including on restored old datasets. Published-image disposable smoke verifies loopback boundaries and denies unauthenticated writes. Those findings do not mean an attacker already running inside the same container is unprivileged.
- The persistent PostgreSQL credential is randomly generated under `/data/secrets/database_password` with mode 0600, and `/app/backend/.env` is also mode 0600. Backend is root today; before dropping to a dedicated UID, refactor local database readiness checks and carefully establish **minimum** read/write permissions to app state and needed secret material without exposing secrets to the frontend or music-directory peers.
- Privilege changes should be developed and validated separately; they change the running artifact and would invalidate rc2 as an exact-source candidate. Rebuild/publish a **new** candidate only after the security change passes native AMD64/ARM64, real auth/audio, old-image upgrades and independent rollback.
- No evidence here demonstrates an actual successful exploit, and no release-owner acceptance has been recorded.

## Licensing, device acceptance and release gates

- Source root includes GPL-3.0 license; runtime copies a separate Apache-2.0 notice for vendored Hugging Face audio helper functions. The verification script checks that this notice is shipped. **Complete** downstream dependency/model attribution, source distribution obligations and embedded assets licensing are not signed off.
- Still require actual human EN/NL accessibility tests (keyboard/screen reader/mobile/tablet/TV), representative music/devices, permissions, and an **independently restored nonproduction copy** of a real pre-upgrade full-volume backup. Never run the old image directly against newly migrated data.
- **NO GO** for stable `v1.11.0` or `:latest` until residual findings receive written ownership/mitigation decisions, representative acceptance passes, and the maintainer gives explicit publishing authorization. Do not merge PR #7 or touch independent deployments as part of this audit.
