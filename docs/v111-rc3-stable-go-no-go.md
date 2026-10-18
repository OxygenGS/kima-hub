# OxygenGS Kima Hub v1.11.0 — rc3 to stable GO / NO-GO

**Decision status: NO-GO for stable until outstanding human/security gates are explicitly closed.**
Reviewed 18 October 2026. This packet records the exact, independently tested public release candidate, **not permission to merge, publish a stable tag, promote `:latest` or touch an independently operated installation**. The scope is public OxygenGS application source and disposable GitHub CI.

## Locked candidate identity

| Field | Exact value |
| --- | --- |
| Single combined Draft PR | [#7](https://github.com/OxygenGS/kima-hub/pull/7), includes preparatory #5 (EN/NL) and #6 (upstream 1.11) through ancestry |
| Application source | `41a2d0db6488ce2ebb67978c3ec7512f8918673e` |
| Prerelease tag | `ghcr.io/oxygengs/kima-hub:prerelease-v111-rc3` |
| Immutable multiarch index | `ghcr.io/oxygengs/kima-hub@sha256:7ff9b5a0f5d53466ddea71c028e8283ae9753c560ba6cde233445918085a8843` |
| Public stable currently | `ghcr.io/oxygengs/kima-hub:v1.10.0` |
| Proposed future stable | `v1.11.0` — not tagged/published; `:latest` must not change automatically |

Do not substitute the earlier `rc2` digest or a mutable `:prerelease` alias for this exact image when evaluating the release.

## Completed automated and published-image gates

- [x] Combined source PR CI: [7/7 PR checks](https://github.com/OxygenGS/kima-hub/actions/runs/39160008303), [9/9 native AMD64/ARM64 AIO](https://github.com/OxygenGS/kima-hub/actions/runs/39160008342), [EN/NL browser](https://github.com/OxygenGS/kima-hub/actions/runs/39160008368), [security checks](https://github.com/OxygenGS/kima-hub/actions/runs/39160008292), on the exact source SHA.
- [x] [rc3 publisher #39162085989, attempt 2](https://github.com/OxygenGS/kima-hub/actions/runs/39162085989): native AMD64 and ARM64 build, fixable-HIGH/CRITICAL and embedded-secret gates, inspected OCI two-architecture index; a transient `unknown blob` ARM64 GHCR push was recovered by rerunning only failed jobs. No stable image was produced.
- [x] **Independent, no-build, no-publish** [published-image functional verifier #39164715280: 3/3](https://github.com/OxygenGS/kima-hub/actions/runs/39164715280), pinned to the immutable rc3 digest. Both native platforms verified image source labels, admin/listener authorization, protected and private-cached FFmpeg waveform, actual WAV/MP3 streaming, HTTP range/seek, EN/NL authenticated browser flows, CLAP running at default settings and persisted restart.
- [x] The same independent published-image verifier upgraded **copies** of official upstream v1.10.0 and v1.11.0 saved data to rc3 on AMD64, verified schema/role defaults, and independently restarted both old upstream images from **separately restored, unmigrated** volumes; both rollback rehearsals passed.
- [x] Independent [published-image full security inventory #39164715193: 2/2](https://github.com/OxygenGS/kima-hub/actions/runs/39164715193): architecture/source labels and shipped vendored license found; Trivy reports **AMD64 295 HIGH/8 CRITICAL; ARM64 294 HIGH/8 CRITICAL; 0 scanner-listed FixedVersion**. This is an accurate *inventory*, **not** security acceptance.
- [x] Dockerfile/package release versions, two npm lockfile roots and changelog agree on 1.11.0. Stable tag `v1.11.0` absent as checked in this session.

### New immutable-image binary applicability evidence

- [x] [Additional native published-rc3 binary inspection 2/2 passed](https://github.com/OxygenGS/kima-hub/actions/runs/39167206438): `zlib1g` contains no MiniZip installed paths and the shipped `libz.so.1` does not export the known vulnerable MiniZip zip entrypoint on either architecture. This corroborates [Debian's Bookworm CVE-2023-45853 non-built code explanation](https://security-tracker.debian.org/tracker/CVE-2023-45853). Package-specific evidence **requires a human recorded disposition**; scanner findings stay visible.
- [x] Recorded `libmbedcrypto7` and `libmbedtls14` inventory facts on both rc3 native platforms; **not** a finding waiver or proof that other Mbed TLS call paths are safe.

## Blocking decisions before public stable publication

- [ ] **OS risk disposition, security reviewer and owner:** decide each of the eight Debian CRITICAL scanner findings, including documented potential non-applicability vs actual linked/reachable code and compensating controls. Do not suppress findings or interpret `FixedVersion` absent as safe. See [detailed Debian advisory analysis](v111-rc2-security-disposition.md) and the exact rc3 audit evidence. Assign reviewer/date and record explicit accept/remediate/escalate disposition.
- [ ] **Elevated service processes:** backend, Essentia analyzer and CLAP analyzer still inherit root, confirmed on both published rc3 architectures; frontend/PostgreSQL/Redis are unprivileged. Choose a tested least-privilege mitigation (which would require another image candidate and retests) **or explicit documented maintainer risk acceptance** for a time-bounded release. Environment-variable minimization alone is not non-root conversion.
- [ ] **Distribution, dependencies and licensing:** GPLv3 application obligations, complete transitive component/model license attribution and the vendored Apache-2.0 helper's notice must be reviewed by an appropriate owner. Automated audit proved that a specific license file is present, not that all licensing obligations are fulfilled.
- [ ] **Manual EN/NL acceptance:** fresh onboarding/login, Settings persistence, disabled-permission admin/listener flows, streaming/seek/queue, error handling, navigation, accessibility keyboard-only and screen-reader; real desktop, mobile/tablet and large-screen/TV where supported. Include a test of unchanged metadata/API identifiers across language toggles. Record browser/device, tester, failures and signoff. Automated Playwright tests do not replace these tests.
- [ ] **Representative independent recovery:** with separately authorized **nonproduction** backup material, cold-backup full `/data`, Compose settings and secrets; test hash/integrity, upgrade a *copy* to rc3, and separately restore pre-upgrade original data to another volume for old-image rollback. No private host or real production volume has been inspected, modified or migrated.
- [ ] **Public stable authorization:** after resolving/reviewing the above, reconfirm the exact PR head, `main` ancestry, stable-tag uniqueness, signing/permissions and stable publisher; obtain explicit approval to merge #7 and publish `v1.11.0`. The stable workflow is designed not to move `:latest`. Verify the resulting **stable immutable digest** anew; never infer it from an rc3 tag without checking.
- [ ] **Independently operated installation rollout:** entirely separate owner approval, maintenance window, complete verified cold backup, rollback plan and pinned stable digest. No steps in this packet authorize live deployment.

## Decision record — requires people, not CI

| Role | Decision | Reviewer, evidence, date |
| --- | --- | --- |
| Security/OS package owner | PENDING: accept/remediate each residual package CVE | — |
| Service privilege owner | PENDING: non-root mitigation or temporary exception | — |
| License/compliance reviewer | PENDING | — |
| EN/NL accessibility/device tester | PENDING | — |
| Representative restore owner | PENDING | — |
| Public release maintainer | PENDING: stable merge/publish authorization | — |
| Independent installation owner | SEPARATE PENDING authorization; not prerequisite for publishing a public release if public release gates are accepted | — |

**Next safe action:** complete these specific reviews without changing the proven rc3 application source. If a blocker requires a code fix, use an isolated feature branch, rerun native CI, publish a *new* candidate and independently verify it; do not retag rc3 as if it included that fix.
