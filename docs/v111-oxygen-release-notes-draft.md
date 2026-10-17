# Draft release notes — OxygenGS Kima Hub, combined v1.11 + EN/NL

**Unpublished draft, not a release or production installation guide.** Content describes development in the stacked Draft PRs [#5](https://github.com/OxygenGS/kima-hub/pull/5), [#6](https://github.com/OxygenGS/kima-hub/pull/6) and [#7](https://github.com/OxygenGS/kima-hub/pull/7). The actual fork tag and GHCR image digest must be confirmed **after explicit approval and publication**. Do not use an unverified `v1.11.0` image as though it already exists.

## What's new

- Integration of [official Kima Hub v1.11.0](https://github.com/Chevron7Locked/kima-hub/releases/tag/v1.11.0), including upstream Stats, Discover Weekly, Vibe Map and related audio/library improvements.
- English and Dutch interface choices from login and initial setup through signed-in Settings. The browser keeps the preference after reload and shares it with same-origin tabs; this is **not an account-wide or multi-device preference**.
- Translations for the new v1.11 experience, settings, home/radio cards, music playback controls, error recovery and assistive-technology labels. Numeric counts, decimal values and available percentages follow the selected language.
- Media titles, artist and author names, user-entered library data, file paths, API parameters, playback state and source identifiers are preserved when switching language.
- Original fork's server-enforced music-acquisition permissions and publisher safety controls retained. Merely switching language must never trigger playback, download, or server-side writes.

## Security hardening under review

- The OxygenGS AIO backend now binds its internal API to container localhost by default, instead of advertising port 3006 to the Docker network.
- AIO PostgreSQL uses a persistent, unique per-installation credential with SCRAM localhost authentication. On a first fork upgrade, the database role is re-keyed while preserving the original music library and user data. **Back up the entire original `/data` volume, including `/data/secrets`.**
- The shipped CLAP ONNX runtime no longer installs the vulnerable `transformers==4.57.6` package. It uses pinned RoBERTa tokenizers and separately licensed NumPy audio helpers; offline audio/text validation and native AMD64/ARM64 smoke checks passed in disposable CI.
- Actual assembled-image security scans revealed outstanding Debian-system-library vulnerabilities, including eight CRITICAL records on each architecture. See [image risk review](v111-image-security-review.md). These remain under manual release review; do **not** interpret green CI as security sign-off.

## Upgrade impact

- This is a database-aware upgrade. Make a **cold backup of the complete original /data volume** and the Compose configuration before any approved upgrade. Never reuse an upgraded volume with an older image; restore the unmodified pre-upgrade backup into a different volume if rollback is required.
- Non-administrator users with no explicit migration grants may have album-request/download permissions disabled by default. Administrators should review and deliberately re-enable the needed access.
- The currently published OxygenGS stable image is **`ghcr.io/oxygengs/kima-hub:v1.10.0`**. The v1.11 combined fork image has **not** been published. Keep production Compose tags pinned to published releases and preserve /music and /data mounts.
- The original upstream Kima image is an input only to isolated migration tests. Fork installations should use the published OxygenGS namespace after the chosen release is approved.

## Automated evidence, not release approval

[GitHub Actions #38946015055](https://github.com/OxygenGS/kima-hub/actions/runs/38946015055), commit `d42a966`: 9/9 jobs passed including full frontend/backend suites, EN/NL browser switching, HTTP rights, Trivy dependency/secret scan, and native AMD64/ARM64 AIO build/smoke. Disposable original-image v1.10/v1.11 copy-upgrades and independent rollbacks succeeded. Trivy assembled-image reports were also generated and reviewed; **eight CRITICAL Debian-package findings per architecture remain open**. This is a historical passing implementation checkpoint, not a release decision; the new fail-on-fixable-image gate and eventual release commit must be revalidated.

## Release blockers remaining

- Human desktop/mobile/tablet/TV and keyboard/screen-reader acceptance in both languages, plus genuine playback and permission-denial verification.
- Security, dependency and container image findings; review of root execution and internal service credentials; licenses and upstream attribution.
- Representative independently restored backup/migration rehearsal using **nonproduction copies**, without disclosing anyone's host or container ID in this repository.
- Final version and lockfile consistency, exact image tag/digest, approved pre-release artifact test and explicit sign-off prior to stable publication. Production installation is a separate approval.

References: [release acceptance matrix](v111-release-acceptance.md), [safe all-in-one update procedure](safe-aio-updates.md), [language rules](internationalization.md).
