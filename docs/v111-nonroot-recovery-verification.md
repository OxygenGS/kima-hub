# v1.11 non-root cold-copy recovery verification

Reviewed 19 October 2026. **Four of four native recovery jobs passed** in [GitHub Actions #39229053590](https://github.com/OxygenGS/kima-hub/actions/runs/39229053590), verification source `59dfcced2946b0be40c1c928a488036e7b1712ce` on `feature/v111-nonroot-services-experiment`. The run completed successfully at 09:27:07 UTC. This is synthetic CI evidence, not production recovery acceptance or release authorization.

## Matrix actually executed

| Source data created by | Platform | Upgrade target | Independent rollback | Result |
| --- | --- | --- | --- | --- |
| Original upstream v1.10.0 image | AMD64 | CI-only non-root overlay | Same original image digest, separate original-data restore | PASS |
| Original upstream v1.11.0 image | AMD64 | CI-only non-root overlay | Same original image digest, separate original-data restore | PASS |
| Published OxygenGS rc3 | AMD64 | CI-only non-root overlay | Immutable rc3, separate original-data restore | PASS |
| Published OxygenGS rc3 | ARM64 | CI-only non-root overlay | Immutable rc3, separate original-data restore | PASS |

Historical upstream tags were resolved once to their pulled digest and that same digest was used for rollback. rc3 was pinned from the outset to `ghcr.io/oxygengs/kima-hub@sha256:7ff9b5a0f5d53466ddea71c028e8283ae9753c560ba6cde233445918085a8843`, source `41a2d0db6488ce2ebb67978c3ec7512f8918673e`.

The tested service implementation remains the overlay from `84fbfb55d662bdaecbff36faf124bee732a4a81e`. This recovery commit adds four verification files only; it does not integrate the prototype into the real application Dockerfile. See [the non-root implementation report](v111-nonroot-services-experiment.md).

## Verification sequence

Each job first passed 19 existing service-guard tests and 16 new recovery tests. The new tests reject corrupted content, changed owner/mode, extra or missing files, unexpected special files, ambiguous patch anchors, unsupported sources/platforms and altered source rehearsals. A source Git-blob check prevents applying hooks to an unreviewed version of the existing upgrade script. Cleanup is installed only after collision preflight, so the generated rehearsal refuses existing resources without deleting them.

The original real image created synthetic admin/listener accounts, a track, a playlist and persistent application secrets. The test added a private root-owned cache marker and an executable GPU-state fixture. It then stopped and removed the original container and archived its **entire `/data` volume**.

Before any candidate boot, independently extracted candidate and rollback copies were compared against an offline source manifest: all paths, regular-file SHA256 bytes/sizes/link counts, symlink targets, numeric UID/GID and basic POSIX permissions had to match. The archive also received a SHA256 integrity check. This comparison is not a live-database backup check.

The candidate started its real backend and both analyzers as non-root, with CLAP enabled. The tests checked actual process identities/groups, zero effective/permitted capabilities, no-new-privileges, secret-file denial and restricted Supervisor access. They checked the actual backend-created GPU projection as well.

Original accounts, playlists, tracks and session/encryption secrets were preserved. The original listener played the original WAV and sought a byte range with byte-for-byte comparisons. MP3 transcoding was independently recognized by ffprobe, and waveform decoding produced 400 valid non-silent peaks. `/music` was genuinely mounted read-only; even a root test write was rejected and original music modes/owners were unchanged. The legacy cache became backend-owned/private/writable, unrelated audio/web users could not read it, and the GPU executable fixture retained executable permission and appropriate audio ownership.

The candidate container was removed and recreated with the same upgraded copy. The service, data, audio and permission assertions were repeated, including persistence of its generated database password. Afterward the untouched source and separate rollback copy were compared against the original manifest again, and the original archive checksum was rechecked.

Finally the original image booted the **independently restored original-data volume**, not the migrated copy. Original records, login, secrets and WAV/range playback worked. The cache and executable fixture retained their original root ownership and modes; a file written only by the candidate was absent. This distinguishes real rollback from merely restarting the upgraded image.

## Boundaries

The workflows have read-only contents/package permissions and no publication step. No model, image, backup, manifest or secret artifact was uploaded. No production host, user library, private installation, stable tag or main branch was touched by this experiment.

The manifests intentionally do not certify extended ACLs, xattrs, timestamps, arbitrary custom UID/GID layouts, NFS behavior or a concurrent hostile volume writer. Tests use stopped synthetic data and exclusive CI volumes. Read-only playback is covered, not application import/download/library-write workflows. GPU state and an executable fixture are covered, not CUDA hardware or runtime-wheel installation. Root bootstrap and Supervisor remain privileged.

The separate official-UPF ONNX substitution was not combined with this overlay. Model licensing, production non-root integration, a fresh full candidate/image verification and remaining human acceptance decisions stay open. The notice-only source change in PR #7 (`bc7aeb1`) is also separate from this rc3-based recovery experiment.
