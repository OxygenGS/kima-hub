# v1.11.0: disposable non-root backend and analyzer experiment

Reviewed 19 October 2026. This is evidence for a possible future candidate, **not a production entrypoint or authorization to merge, publish, or deploy**.

## Locked identities and evidence

- Experiment branch: `feature/v111-nonroot-services-experiment`.
- Initial CPU experiment: `96e5ccf6cdc3f59cd077aa51545e5d37b5fc7a19`; [native AMD64 and ARM64 run #39213286962](https://github.com/OxygenGS/kima-hub/actions/runs/39213286962), **2/2 passed**.
- GPU IPC correction and expanded guards: `84fbfb55d662bdaecbff36faf124bee732a4a81e`; [run #39214012851](https://github.com/OxygenGS/kima-hub/actions/runs/39214012851), **2/2 native AMD64/ARM64 PASSED**. ARM64 completed at 07:12:47 UTC and AMD64 at 07:14:26 UTC on 19 October 2026. Both platforms passed all 19 unit tests, real two-UID GPU state exchange, both offline model-parity steps, and the full AIO audio/auth/EN-NL/recreation test with actual-process privilege and backend-projection assertions. This result was read independently from both completed jobs, not inferred from the initial CPU run.
- Overlay base: `ghcr.io/oxygengs/kima-hub@sha256:7ff9b5a0f5d53466ddea71c028e8283ae9753c560ba6cde233445918085a8843`, with exact source label `41a2d0db6488ce2ebb67978c3ec7512f8918673e`.

The dedicated workflow builds only `.github/ci/nonroot-experiment/Dockerfile`, **not the repository-root Dockerfile**. It reuses the published candidate's application and ONNX model bytes and makes a disposable local image. It has read-only contents/package permissions and no push or publication step. The experiment branch inherits earlier audio-only prototype changes; those are not the implementation tested by this overlay. Do not bulk-merge this branch as a production mitigation.

## What changed

A root bootstrap hook configures private cache directories and replaces only the supervised backend and analyzer launch commands. The Node backend drops to `kimabackend`; Essentia and CLAP drop to `kimaaudio`. The expanded implementation checks a nonzero primary UID/GID, only the `kimaruntime` supplementary group, zero effective/permitted Linux capabilities, and `NoNewPrivs=1`. The actual Supervisor child PIDs passed those assertions after initial boot and after deleting/recreating the container with the same disposable volumes on both native platforms.

The root-created backend `.env` is parsed as data before dropping privileges; it is never shell-sourced. The backend necessarily retains its own application credentials in memory. The analyzers retain the database connection they need, but do not inherit session/encryption/admin-reset secrets or the separate database-password variable. These are not claims that every process is credential-free.

The public offline tokenizer cache is copied out of `/root` into a root-owned, read-only shared location. Each service identity receives its own writable home/Numba cache. No broad chmod/chown of `/root`, secret files, model files or the music library is used.

## GPU control-plane regression found and corrected

The first CPU pass did not prove optional GPU control-plane compatibility. Source review showed that the backend writes `gpu-onnx/enabled.json` while the analyzer writes state and owns the installed runtime. Giving that entire directory to the audio UID with mode 0750 prevents the backend projection from working; CPU smoke can still pass because startup logs and catches the projection error.

The correction gives only this shared directory a root owner, a dedicated group, and sticky/setgid mode 03770. Backend control files remain backend-owned; analyzer state/runtime files remain audio-owned. Both services can read the appropriate shared state, but cannot overwrite or unlink the other's existing files. Owner executable permission is preserved on existing runtime files instead of stripping it on every startup. Private backend caches and secrets are not shared with this group.

The dedicated real-UID test uses the actual Python GPU state writer and exercises repeat atomic writes, reciprocal reads, denied cross-file writes/unlinks, ownership preparation on existing data, and executable retention. The AIO audit separately requires a real Node-backend-created `enabled.json` after both boots. All of these checks passed on AMD64 and ARM64 in the expanded run.

**This tests GPU state exchange, not CUDA device access, runtime wheel installation or real GPU inference.** It is not a complete hostile-service IPC protocol: shared temporary-name precreation/denial-of-service races still require design review for production.

## Test coverage and limits

The expanded workflow passed 19 Python unit tests; a real inaccessible-music negative test without changing that directory's ownership/mode; two-UID GPU state exchange; offline MusiCNN parity against the saved rc3 answers; offline CLAP audio/text verification; and the full existing AIO synthetic-WAV/MP3, streaming/range/auth/waveform/queue, EN/NL authenticated browser and persisted-volume-recreation smoke on both platforms. Service credentials, effective/permitted capabilities, secret-file denial, and Supervisor control denial were checked before and after recreation.

The inaccessible-music case is intentionally rejected; the helper never makes somebody else's library globally readable. The new path checks reject symlinks, hardlinks and special files, but the check-then-change sequence is **not an atomic defense against a concurrent hostile volume writer**. Use only fresh or explicitly prepared, exclusively mounted disposable CI volumes. The production root bootstrap still manages its existing PostgreSQL/Redis storage; this helper does not replace that bootstrap.

## Not closed by these tests

- Root bootstrap, migrations and Supervisor remain privileged. This is service-level privilege dropping, not a rootless container. Package vulnerabilities and their human dispositions are unchanged.
- Production ownership migration, custom UID/GID/group/ACL policy, read-only libraries, downloads/imports/library writes, representative existing data, real GPU operation, and independent old-image rollback with original ownership have not been accepted for this prototype.
- The official UPF-model substitution is a different experiment. It has not been combined with this overlay, distributed, or legally approved. Model redistribution rights and the prepared, unsent rights-holder inquiry remain open.
- Human device/accessibility acceptance, representative recovery and public release authorization remain governed by the [rc3 GO / NO-GO packet](v111-rc3-stable-go-no-go.md).

## Integration decision

Do not relabel rc3 or imply that it contains this change. A production implementation requires a reviewed ownership/IPC/migration policy and selective source integration, followed by complete native source CI, a new candidate, independent digest verification and compatibility/upgrade/rollback checks. Preserve the already proven rc3 and original backup ownership for rollback. No public stable tag or independently operated installation is modified by this experiment.
