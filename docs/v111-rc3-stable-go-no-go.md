# OxygenGS Kima Hub v1.11.0 — current source / rc3 GO / NO-GO

**Stable decision: NO-GO while the outstanding release decisions below remain open.** Reviewed 19 October 2026. This record distinguishes current source, immutable published-image evidence and isolated experiments. It does not authorize merging, tagging stable, promoting `:latest` or changing an independently operated installation.

## Locked identities

| Item | Exact identity |
| --- | --- |
| Single combined Draft PR | [#7](https://github.com/OxygenGS/kima-hub/pull/7) to main; includes preparatory #5 EN/NL and #6 upstream integration |
| Current PR source | `bc7aeb1f471fcc9c072935d41f2d4500e4ed97a3` |
| Current source delta | One notice/provenance/packaging-test commit after `41a2d0d`; no model weights or application runtime changed |
| Published rc3 source | `41a2d0db6488ce2ebb67978c3ec7512f8918673e` — not the current source |
| Published rc3 tag | `ghcr.io/oxygengs/kima-hub:prerelease-v111-rc3` |
| Published rc3 immutable index | `ghcr.io/oxygengs/kima-hub@sha256:7ff9b5a0f5d53466ddea71c028e8283ae9753c560ba6cde233445918085a8843` |
| Stable baseline | `ghcr.io/oxygengs/kima-hub:v1.10.0` |
| Proposed stable | `v1.11.0`, not approved/tagged/published by this work |

Do not substitute a mutable alias, an older rc2 digest or the current source SHA for the immutable rc3 identity. No new full candidate was published by the notice fix.

## New source packaging correction

- [x] The source now includes the original `services/audio-analyzer/pb/LICENSE-upf-models` **byte-for-byte** alongside `models/*.onnx`, plus `NOTICE.upf-models.txt` identifying all eleven converted files and their provenance. The original license blob remains `3d4d1d7a661028694a96ce550b7e9e02921acc42`; its inconsistent license name/link is not rewritten. The existing Dockerfile's model-directory COPY includes the new files.
- [x] [Model notice preservation #39230293898](https://github.com/OxygenGS/kima-hub/actions/runs/39230293898) passed: source/shipped notice equality, exact original blob, eleven-file provenance/inventory, five negative cases, and an actual scratch Docker COPY using the repository `.dockerignore`.
- [ ] Normal source CI was retriggered for `bc7aeb1`; its complete final result is not yet recorded in this checkpoint. Historical green source runs at `41a2d0d` are not a claim that this new source has completed full native CI.
- [ ] A future complete image must independently verify the notice in that new digest. **Published rc3 still lacks this model notice alongside `/app/models`; source fixes do not alter a published image retroactively.** Packaging attribution is not proof that every distribution obligation has been met.

## Completed immutable rc3 gates (historical exact-image evidence)

- [x] Exact `41a2d0d` source passed [PR checks 7/7](https://github.com/OxygenGS/kima-hub/actions/runs/39160008303), [native AIO 9/9](https://github.com/OxygenGS/kima-hub/actions/runs/39160008342), [EN/NL browser](https://github.com/OxygenGS/kima-hub/actions/runs/39160008368), and [security checks](https://github.com/OxygenGS/kima-hub/actions/runs/39160008292).
- [x] [rc3 publisher #39162085989, attempt 2](https://github.com/OxygenGS/kima-hub/actions/runs/39162085989) used native AMD64/ARM64 builds, fixable-HIGH/CRITICAL and embedded-secret checks and a verified two-architecture index. A transient ARM64 GHCR push failure was recovered. No stable image was produced.
- [x] Independent, no-build/no-publish [runtime verifier #39164715280, 3/3](https://github.com/OxygenGS/kima-hub/actions/runs/39164715280) tested both actual native images: source labels, authentication/permissions, WAV/MP3 streaming, range/seek, private-cached waveform, EN/NL browser flows, default CLAP and persisted recreation. It also upgraded independent copies of original upstream v1.10/v1.11 data on AMD64 and separately restored each original image from unmigrated volumes.
- [x] [Exact published-image security inventory #39164715193, 2/2](https://github.com/OxygenGS/kima-hub/actions/runs/39164715193) recorded AMD64 **295 HIGH/8 CRITICAL**, ARM64 **294 HIGH/8 CRITICAL**, no scanner-listed fixed versions. These are findings in that audit, not a fresh scan or security acceptance.
- [x] [MiniZip binary applicability #39167206438, 2/2](https://github.com/OxygenGS/kima-hub/actions/runs/39167206438) found no MiniZip paths/vulnerable zip entrypoint in the inspected zlib package/library, supporting Debian's [CVE-2023-45853 non-built-code explanation](https://security-tracker.debian.org/tracker/CVE-2023-45853). This is evidence for a reviewer, not blanket dismissal of scanner findings or Mbed TLS paths.
- [x] [Secret/Supervisor isolation #39205826071, 2/2](https://github.com/OxygenGS/kima-hub/actions/runs/39205826071) proved root-owned persisted secrets and the Supervisor socket denied access to frontend/PostgreSQL/Redis identities. Backend and analyzers still run as root in published rc3.

Older rc2 results remain in [the security disposition](v111-rc2-security-disposition.md) and the PR discussion; they apply only to their own image.

## Non-root mitigation: runtime and recovery evidence, NOT integrated

- [x] Initial local-only overlay [#39213286962, 2/2](https://github.com/OxygenGS/kima-hub/actions/runs/39213286962), then corrected implementation `84fbfb55d662bdaecbff36faf124bee732a4a81e` [#39214012851, 2/2](https://github.com/OxygenGS/kima-hub/actions/runs/39214012851): actual backend and both analyzers under non-root backend/audio identities, zero effective/permitted capabilities, no-new-privileges, denied persisted-secret/Supervisor access, offline MusiCNN/CLAP parity, actual audio/auth/EN-NL and recreation. GPU control-plane sharing was corrected and checked using real identities. [Implementation report](v111-nonroot-services-experiment.md).
- [x] New **cold-copy recovery #39229053590, 4/4 PASSED**, verification source `59dfcced2946b0be40c1c928a488036e7b1712ce`: upstream v1.10 AMD64, upstream v1.11 AMD64, rc3 AMD64 and rc3 ARM64. Each verifies offline full-data bytes/basic owner/mode/link equality, upgrade, actual non-root processes and audio from read-only music, recreation, untouched original/rollback copies and an independently restored original image with original ownership. The 35 unit tests and all four jobs completed. [Recovery evidence and exact scope](v111-nonroot-recovery-verification.md); [run](https://github.com/OxygenGS/kima-hub/actions/runs/39229053590).
- [ ] Selective production integration and ownership/IPC policy remain open. The dedicated overlay, not the repository-root Dockerfile, was tested. Do not bulk-merge the branch, which inherits older prototype code. Custom UID/GID/ACL/xattrs, hostile concurrent volume writers, application library writes and actual CUDA are not certified by these tests. Root bootstrap/migrations/Supervisor remain: this is not a rootless container.

The four successful recoveries close the **synthetic CI recovery coverage gap for this overlay**, not a review of an unseen private dataset or a claim that the released application now contains the mitigation.

## Model rights: existing grant or clarification, not correspondence for its own sake

**Correction to earlier versions of this packet:** a separate private UPF permission letter is not categorically required for every model distribution. An applicable existing public license can grant rights when its conditions are met. The actual gate is a recorded determination of the license for these exact files, intended distribution/use and full compliance. [Detailed clarification and primary sources](v111-model-license-scope-clarification.md).

UPF's licensing page names CC BY-NC-ND while the model overview and preserved notice link point to CC BY-NC-SA. Technical format conversion is not automatically proof of prohibited adaptation; the complete process and applicable grant still require assessment. Application GPL terms must not be presented as overriding model restrictions or allowing unrestricted commercial model use.

- [x] [Original/converted model inventory #39207081678](https://github.com/OxygenGS/kima-hub/actions/runs/39207081678): eleven PB originals and eleven converted ONNX files, documented license-text mismatch and the then-missing model notice. [Rights review](v111-third-party-model-rights-review.md).
- [x] First-party alternative: [eleven official files/SHA comparison #39208036446](https://github.com/OxygenGS/kima-hub/actions/runs/39208036446), [numerical output comparison #39208570035](https://github.com/OxygenGS/kima-hub/actions/runs/39208570035), [pinned eleven-file loader/parity #39211009167](https://github.com/OxygenGS/kima-hub/actions/runs/39211009167), and [native actual rc3 AIO with temporary official models #39211515100, 2/2](https://github.com/OxygenGS/kima-hub/actions/runs/39211515100). Named 200-dimensional embeddings and ten heads were compatible in the tested cases.
- [ ] Document applicable distribution rights and notices for the selected files. Use a sufficiently clear existing grant, or obtain rightsholder clarification/additional permission where unresolved. The [prepared inquiry](v111-upf-model-license-inquiry.md) has not been sent by this task; its unsent status alone does not negate public-license rights.
- [ ] The official-model substitution is neither integrated nor shipped, and has not been combined with the non-root overlay. Any selected replacement requires a fresh candidate with its own model/runtime/source/image verification. Neither green CI nor copied notices approve distribution automatically.

## Remaining release decisions

| Decision | Status and required outcome |
| --- | --- |
| Exact current source and final image | Complete new source CI; independently verify the selected new candidate's actual digest, notices, runtime and inventory |
| Model/dependency licensing | Identify applicable grants, intended use scope and required attribution/source obligations; clarify unresolved rights |
| OS findings | Reviewer records disposition for each residual critical finding; absent fixed versions is not safety evidence |
| Elevated services | Integrate a reviewed non-root mitigation and retest, or record an appropriate explicit time-bounded maintainer risk decision; published rc3 is still root for backend/analyzers |
| Real user acceptance | EN/NL onboarding/login/settings/navigation, unchanged metadata, genuine playback/seek/queue and permission-denied flows; keyboard/screen-reader and supported real devices |
| Representative recovery acceptance | Appropriately authorized nonproduction backup/restore approval; synthetic CI is supporting evidence, not a sign-off for private data |
| Public release maintainer | Explicit approval to merge and publish stable after the above; no human sign-off has been invented |
| Independently operated installation | Separate owner approval, maintenance/backup/rollback and pinned digest; not implied by public release and not a prerequisite that secretly authorizes private access |

The stable publisher uses trusted stable-tag validation, native AMD64/ARM64 builds, scan-before-staging, stable-tag uniqueness and post-manifest release creation. It does not automatically promote `:latest`. None of these publisher gates was bypassed or dispatched by this work.

**Current outcome:** four non-root recovery paths are verified and the source model-notice packaging omission is fixed. Stable publication remains pending actual integration/image and owner decisions; main, stable tags, `:latest` and independently operated installations are unchanged by these changes.
