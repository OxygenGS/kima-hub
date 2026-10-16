# Draft release notes — OxygenGS Kima Hub, combined v1.11 + EN/NL

**Unpublished draft, not a release or production installation guide.** Content describes development in the stacked Draft PRs [#5](https://github.com/OxygenGS/kima-hub/pull/5), [#6](https://github.com/OxygenGS/kima-hub/pull/6) and [#7](https://github.com/OxygenGS/kima-hub/pull/7). The actual fork tag and GHCR image digest must be confirmed **after explicit approval and publication**. Do not use an unverified `v1.11.0` image as though it already exists.

## What's new

- Integration of [official Kima Hub v1.11.0](https://github.com/Chevron7Locked/kima-hub/releases/tag/v1.11.0), including upstream Stats, Discover Weekly, Vibe Map and related audio/library improvements.
- English and Dutch interface choices from login and initial setup through signed-in Settings. The browser keeps the preference after reload and shares it with same-origin tabs; this is **not an account-wide or multi-device preference**.
- Translations for the new v1.11 experience, settings, home/radio cards, music playback controls, error recovery and assistive-technology labels. Numeric counts, decimal values and available percentages follow the selected language.
- Media titles, artist and author names, user-entered library data, file paths, API parameters, playback state and source identifiers are preserved when switching language.
- Original fork's server-enforced music-acquisition permissions and publisher safety controls retained. Merely switching language must never trigger playback, download, or server-side writes.

## Upgrade impact

- This is a database-aware upgrade. Make a **cold backup of the complete original /data volume** and the Compose configuration before any approved upgrade. Never reuse an upgraded volume with an older image; restore the unmodified pre-upgrade backup into a different volume if rollback is required.
- Non-administrator users with no explicit migration grants may have album-request/download permissions disabled by default. Administrators should review and deliberately re-enable the needed access.
- The currently published OxygenGS stable image is **`ghcr.io/oxygengs/kima-hub:v1.10.0`**. The v1.11 combined fork image has **not** been published. Keep production Compose tags pinned to published releases and preserve /music and /data mounts.
- The original upstream Kima image is an input only to isolated migration tests. Fork installations should use the published OxygenGS namespace after the chosen release is approved.

## Automated evidence, not release approval

[GitHub Actions #38891763823](https://github.com/OxygenGS/kima-hub/actions/runs/38891763823), commit `680a8e0`: 523/523 frontend tests (47 suites), 1,921/1,921 backend tests (236 suites), 16/16 EN/NL public browser tests, 161/161 targeted HTTP permission tests, native AMD64/ARM64 AIO image tests, disposable live-user smoke, original v1.10 and v1.11 upgrades plus independent rollback. This is a historical passing checkpoint: repeat the complete checks on the final candidate source/image.

## Release blockers remaining

- Human desktop/mobile/tablet/TV and keyboard/screen-reader acceptance in both languages, plus genuine playback and permission-denial verification.
- Security, dependency and container image findings; review of root execution and internal service credentials; licenses and upstream attribution.
- Representative independently restored backup/migration rehearsal using **nonproduction copies**, without disclosing anyone's host or container ID in this repository.
- Final version and lockfile consistency, exact image tag/digest, approved pre-release artifact test and explicit sign-off prior to stable publication. Production installation is a separate approval.

References: [release acceptance matrix](v111-release-acceptance.md), [safe all-in-one update procedure](safe-aio-updates.md), [language rules](internationalization.md).
