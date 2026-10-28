# v1.13.0 release validation

Status: **published 2026-10-28** at commit `03bed37`. Final PR validation: run `40768222515`; exact-source native preflight: `40773886516`; successful stable publication: `40776257407`, attempt 2. The checks below record the publication requirements. The public product remains Kima Hub — Oxygen's Fork.

## Scope

The candidate combines the home/navigation/media-card refresh, artist and album detail headers, desktop player/queue, and mobile/full-screen player. Existing audio providers, authentication, library data, music permissions and native-client integration are retained. No new database migration or dependency upgrade is part of the interface refresh.

## Required evidence

1. Normal PR checks, including frontend and backend typechecks, unit tests, lint, privacy and release metadata checks, must pass on the final candidate.
2. The isolated Chromium player matrix must pass. It uses the installed project React/CSS/icons, but mocks service boundaries; it is not proof of complete application playback.
3. The disposable AIO acceptance suite must use the built Next.js/API container, real synthetic accounts, generated audio and the actual audio element. Verify refreshed home and music pages, desktop/mobile/overlay navigation, playback clock advancement, pause/resume and queue edits without restarting the active source. Run in English and Dutch. Keep production data and credentials out of all evidence.
4. Existing AIO upgrade/independent rollback and native AMD64/ARM64 build checks must pass. Confirm the v1.13.0 in-app catalog and both language copies match the package versions.
5. After merge, run **Native Release Preflight** on `main` with `v1.13.0`. Both native architectures must test the same recorded commit. Review the retained vulnerability reports; a green fixable-vulnerability gate is not a zero-risk certificate.
6. Only then run **Publish approved stable release**, with `v1.13.0`, the successful native preflight run ID, and explicit acknowledgement of residual image risks. The approval workflow rejects a preflight from a different commit. Any new source change requires a new preflight.
7. Confirm both native publication jobs, the verified multi-architecture index and GitHub Release creation succeeded. Do not infer image availability from the Git tag alone. Do not overwrite existing stable tags or promote `:latest` as part of this process.

## Documentation at publication

The published release includes matching package versions, changelog and English/Dutch in-app notes. README and installation guidance now select verified v1.13.0. Current screenshots come from the successful application validation run using synthetic data; their source tree matches the published tag. A documentation-only update does not rebuild the immutable release image.

## Installation boundary

Publishing a release does not update any running installation. Before an installation upgrade, preserve a complete independent backup of the persistent `/data` volume and configuration, verify restore, and follow [safe AIO updates](safe-aio-updates.md). Keep all installation-specific information private.
