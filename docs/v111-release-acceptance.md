# v1.11 + English/Dutch release acceptance matrix

**Status: rc2 candidate published and independently verified; stable release and deployment NOT approved.** Last reviewed: 18 October 2026. See [first fork release checklist](first-fork-release-checklist.md), [safe AIO update and rollback guide](safe-aio-updates.md), and [internationalization rules](internationalization.md).

The intended release combines EN/NL language work (#5), upstream v1.11 integration (#6) and the final fork application (#7). **Draft #7 now directly targets `main` and already contains the commits from #5 and #6 through shared ancestry.** It is the *single* combined release PR; do not separately merge the preparatory PRs. Green isolated CI and published testimage evidence are not authorization to publish stable or upgrade any private installation.

## Gate A — reproducible code and permission boundaries

| Check | Acceptance evidence | Status |
| --- | --- | --- |
| Final combined PR head | Frontend/backend tests, TypeScript, lint, EN/NL browser and publisher guards pass on the exact commit proposed for merge | Runtime source `ec44b98` passed [PR checks 7/7](https://github.com/OxygenGS/kima-hub/actions/runs/39067956900), [native 9/9](https://github.com/OxygenGS/kima-hub/actions/runs/39067956892), EN/NL and security, with earlier same-runtime full E2E. Later release-workflow and documentation commits require **fresh final-head check** before merge. |
| Real acquisition permissions | Actual HTTP admin/user/anonymous routes: Discover, album requests, manual Soulseek, track downloads and relevant new v1.11 paths deny unpermitted operations | Automated coverage exists; manual endpoint review outstanding |
| Upgrade migrations | Actual upstream v1.10.0 and v1.11.0 AIO full-volume copies independently migrated and restored | Verified on the **published immutable rc2 image**, [AMD64/ARM64 verification run #39070979565](https://github.com/OxygenGS/kima-hub/actions/runs/39070979565); a representative nonproduction real-install restore still remains. |
| Independent rollback | Original v1.10/v1.11 starts on untouched pre-upgrade **independent volume** after candidate migrated only another copy | Both old-image independent synthetic restores passed on the published rc2 image. Manual representative restore still open. |
| Containers and dependencies | Native AMD64/ARM64, actual image scanning, non-root/secret boundaries, mount safety, license attribution | rc2 image successfully verified and [rescanned by immutable digest](https://github.com/OxygenGS/kima-hub/actions/runs/39101135942): AMD64 295 HIGH / 8 CRITICAL, ARM64 294 HIGH / 8 CRITICAL, zero fixed versions supplied. Backend and two analyzers still inherit root; explicit mitigation/acceptance required. |
| Release trigger safety | Unique stable tag, metadata and main ancestry guards, separate native pre-push scans, no unapproved `:latest` | rc2 was published manually from validated runtime `ec44b98`, manifest digest `sha256:c566c59b2aabb150d63cb623c61c5335a41122b224bb08b1df4c55b3a8a2fe56`, and independently verified [3/3](https://github.com/OxygenGS/kima-hub/actions/runs/39070979565). Revised stable publisher uses native builds and **does not update `:latest`**. Stable v1.11.0 remains untagged. |

## Gate B — genuine interface acceptance (disposable isolated install)

Use nonproduction administrator and restricted regular listener accounts, with synthetic fixture music and service data. Record build SHA, architecture, browser/device and pass/fail evidence without storing real passwords or session tokens. Explicitly check each item in **both English and Dutch**.

- [ ] Fresh onboarding/login/registration, invalid browser storage, Settings language selection and persistence after reload and across tabs. Verify per-browser preference **does not** imply cross-device synchronization.
- [ ] Desktop at typical and reduced widths; mobile phone portrait and landscape; tablet; TV/remote or supported large-screen view. Ensure every language menu and action is reachable.
- [ ] Keyboard-only navigation: visible focus, no traps; Play/Pause, volume, repeat, shuffle, accessible SeekSlider (arrows ±5 s, Page ±10 s, Home/End), tab order and Escape/close behaviors.
- [ ] Screen-reader labels/status/alerts for player, Vibe Map with and without WebGL, Mood Mixer, Discover weekly album preview, loading/error screens, sliders and destructive confirmation dialogues.
- [ ] Search, artist/album detail, playlists, weekly discovery, imports, Subsonic/API clients, stats, ListenBrainz, TV/remote controls, setup integrations, failed remote services and offline errors.
- [ ] Ordinary user cannot request albums/download when permission is absent, even when UI is translated; admin can review permissions and re-enable intended access. Validate network responses, not just hidden buttons.
- [ ] Original song/album/artist/playlist/genre metadata, route identifiers, API enums, artist names, file paths and original media links are **identical** before/after language switching.
- [ ] Counts, duration, dates, number formatting, plurals and placeholders correctly handle 0, 1, many and unavailable values, in both languages.
- [ ] Playback queue, actual audio stream, seeking, downloads, likes, generation, notifications and save/clear confirmations still work; language switching alone triggers **no writes** or playback actions.

Record explicit sign-off by a reviewer after these checks. Automated synthetic-browser tests do not replace this list.

## Gate C — verified candidate, unresolved stable-publication blockers

- [ ] Review open issues and translate/resolve known release-blocking errors.
- [ ] Proposed fork tag is **v1.11.0** (not created; verified absent during preparation). Both package.json versions and lockfile roots are already 1.11.0; the root has no npm package. Recheck tag uniqueness, run `.github/ci/check-release-metadata.py --candidate`, complete metadata/release notes and the [release handoff](v111-release-handoff.md). Keep Compose defaults at published v1.10.0 until v1.11.0 actually exists.
- [ ] Inspect dependency and image-vulnerability reports, including [both fully built AIO image scans](v111-image-security-review.md). Eight CRITICAL OS-package findings per architecture remain unaccepted. The new CI image evaluator blocks findings with Trivy-listed fixes; unresolved findings require documented human security acceptance and possible package/base-image mitigation before publication.
- [x] **Published rc2 containing the PostgreSQL `en_US.utf8` fix** has been independently verified from the real GHCR digest on native AMD64+ARM64, including auth, EN/NL, audio, role permissions, upstream v1.10/v1.11 full-volume copy-upgrades and independent rollback. [Publication](https://github.com/OxygenGS/kima-hub/actions/runs/39069358767) · [runtime verification](https://github.com/OxygenGS/kima-hub/actions/runs/39070979565) · [digest security audit](https://github.com/OxygenGS/kima-hub/actions/runs/39101135942). No stable or `:latest` action occurred.
- [ ] Obtain separate permission to merge/release a stable tag, and reverify the exact resulting combined commit. No production use follows automatically.

## Gate D — separately managed production installations (separate explicit approval)

- [ ] Inventory current Compose/Dockge project name, mounted \`/data\` type/volume, \`/music\` path, upstream/fork source image, secrets, host architecture, storage capacity and rollback prerequisites. **No production inspection or action is authorized by this document.**
- [ ] Cold backup of complete original \`/data\` and Compose configuration, write a checksum, and successfully restore the backup to a distinct nonproduction volume. Do not use \`docker compose down -v\`.
- [ ] Define maintenance window, downtime, owner, monitor and go/no-go criteria.
- [ ] Pin an explicitly accepted tested image **tag/digest**; never rely on \`:latest\`. Keep the original project name, volume and music paths.
- [ ] After approved rollout verify authentication, music library, playlists/history, user permissions, audio/seek, file scanning, EN/NL menu, device clients and integrations.
- [ ] If rollback is needed, restore the **pre-upgrade** backup to a **new separate volume** before starting the original image; NEVER start the old image on a newly migrated database.

## Release decision

**No-go for stable until all four gates have evidence and approvals.** Published rc2 passed synthetic/runtime verification, but manual device/accessibility, unresolved OS findings/root process privileges/license security acceptance, final-head CI on release-workflow changes, representative real-data independent restore, and explicit user-approved release/merge remain. Draft #7 is unmerged, stable v1.11.0 absent and `:latest` unchanged. Any private-installation upgrade is a separate authorization.
