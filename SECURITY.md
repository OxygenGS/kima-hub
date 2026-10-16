# Security — OxygenGS Kima Hub fork

This repository is an independently maintained fork of [Kima Hub](https://github.com/Chevron7Locked/kima-hub), under GPLv3. Security claims apply to the **exact code version** tested, not automatically to other branches or third-party installations.

## Authorization and privacy

The fork adds granular music-acquisition permissions such as `canRequestAlbums` and `canDownloadTracks`. Enforcement must occur server-side using the current authenticated user's permissions, not only through translated or hidden buttons. The combined v1.11 development PR includes additional regression checks for acquisition routes, file-path containment, streaming and account changes. These checks must be rerun on the eventual release commit.

A selected interface language must never alter account roles, backend/API codes, download authorization, path validation or original music metadata.

**Repository versus deployment:** this source tree and its public release artifacts are general-purpose. Specific users' container IDs, host configurations, credentials, backups, network addresses, music mounts and installation details are private deployment information and should not be stored here.

## Current release boundaries

The latest already published OxygenGS stable release is listed at [OxygenGS Releases](https://github.com/OxygenGS/kima-hub/releases). Kima v1.11 combined with the EN/NL language selector is being developed in stacked Draft PRs [#5](https://github.com/OxygenGS/kima-hub/pull/5), [#6](https://github.com/OxygenGS/kima-hub/pull/6), and [#7](https://github.com/OxygenGS/kima-hub/pull/7). Passing CI on a draft is not approval to publish a container image or deploy it.

Container image builds, migrations and independent backups/rollback must be tested on synthetic or isolated data. A database migrated by a newer version must **not** be opened directly by an older image: restore an untouched pre-upgrade backup to an independent volume before starting the old version.

## Residual risks and verification

- Dependency and container vulnerability findings must be reviewed on the **actual proposed release artifact**. Historical audit counts can become stale and are not ongoing security guarantees.
- Automated checks, including user permission tests, cannot replace a manual authorization review or independent penetration test.
- Docker image layers can preserve historical artifacts; multi-stage build and image-content review remain release considerations.
- Secrets, tokens and personal runtime logs must not be committed. Sanitized, synthetic reproduction cases should be used instead.
- Publisher workflows and GitHub-hosted image builds are separate from anyone's actual installation and require explicit release approval.

## Reporting

Do not disclose sensitive exploit details in a public pull request. Use the repository maintainer's available **private** vulnerability reporting channel. The fork's public Issues and Discussions are currently disabled; a guaranteed response time or security advisory channel is not claimed.

## Attribution

Original project: https://github.com/Chevron7Locked/kima-hub

Fork: https://github.com/OxygenGS/kima-hub

This fork is not an official upstream security release.
