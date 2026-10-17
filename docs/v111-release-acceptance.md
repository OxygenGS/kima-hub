# v1.11 + English/Dutch release acceptance matrix

**Status: combined release candidate preparation; stable deployment NOT approved.** Last reviewed: 17 October 2026. Use this with [the first fork release checklist](first-fork-release-checklist.md), [safe AIO update and rollback guide](safe-aio-updates.md), and [internationalization rules](internationalization.md).

The intended release combines EN/NL language work (#5), upstream v1.11 integration (#6) and the final fork application (#7). **Draft #7 now directly targets `main` and already contains the commits from #5 and #6 through shared ancestry.** It is the *single* combined release PR; do not separately merge the preparatory PRs. Green isolated CI and published testimage evidence are not authorization to publish stable or upgrade any private installation.

## Gate A — reproducible code and permission boundaries

| Check | Acceptance evidence | Status |
| --- | --- | --- |
| Final combined PR head | All relevant frontend and backend tests, typing, lint, EN/NL Chromium and fork guards pass on the **exact commit** proposed for release | Last fully validated runtime `2300ed9` passed 9/9 full [native v1.11 CI #39031976355](https://github.com/OxygenGS/kima-hub/actions/runs/39031976355), [full E2E #39032005018](https://github.com/OxygenGS/kima-hub/actions/runs/39032005018), security and EN/NL UI. The standard PR workflow had one pooled pgvector GUC issue; test-fix HEAD requires fresh exact-commit checks before merge. |
| Real acquisition permissions | Actual HTTP admin/user/anonymous routes: Discover, album requests, manual Soulseek, track downloads and relevant new v1.11 paths deny unpermitted operations | Automated coverage exists; manual endpoint review outstanding |
| Upgrade migrations | Fresh database and two real upstream AIO sources (official v1.10.0 **and** official v1.11.0), both into new candidate using **isolated copies** | Both real-upstream source upgrades and independent rollbacks passed on `2300ed9` in Actions #39031976355; new candidate and final main SHA still need verification |
| Independent rollback | Restore an untouched *pre-upgrade full /data* snapshot to a **new volume**, then boot the original image and check original data, credentials and secrets | Disposable independent old-image whole-volume restores passed on `2300ed9`; representative copied-data human rehearsal remains outstanding |
| Containers and dependencies | Native AMD64/ARM64 image build and smoke, non-root/secret exposure, Docker/Compose mounts, dependency findings, third-party license/attribution | Native AMD64/ARM64 AIO builds, smoke and full-image Trivy scan passed on `2300ed9`. Prior reports: AMD64 297 HIGH / 8 CRITICAL and ARM64 296 HIGH / 8 CRITICAL, with no Trivy-listed fixed versions; [image security review](v111-image-security-review.md) and human risk acceptance remain OPEN |
| Release trigger safety | Final tags unique and newer than published fork v1.10.0; metadata check on stable and pre-release workflows, blocking fixable-image vulnerability scan before push, no accidental `:latest` pre-release | Stable v1.11.0 remains untagged. An older `f31e589` GHCR prerelease WAS published and validated by immutable digest, but predates the subsequent PostgreSQL locale fix; it cannot serve as final-image acceptance |

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

## Gate C — candidate publication (requires a new explicit approval)

- [ ] Review open issues and translate/resolve known release-blocking errors.
- [ ] Proposed fork tag is **v1.11.0** (not created; verified absent during preparation). Both package.json versions and lockfile roots are already 1.11.0; the root has no npm package. Recheck tag uniqueness, run `.github/ci/check-release-metadata.py --candidate`, complete metadata/release notes and the [release handoff](v111-release-handoff.md). Keep Compose defaults at published v1.10.0 until v1.11.0 actually exists.
- [ ] Inspect dependency and image-vulnerability reports, including [both fully built AIO image scans](v111-image-security-review.md). Eight CRITICAL OS-package findings per architecture remain unaccepted. The new CI image evaluator blocks findings with Trivy-listed fixes; unresolved findings require documented human security acceptance and possible package/base-image mitigation before publication.
- [ ] For the **new runtime containing the PostgreSQL `en_US.utf8` fix**, obtain separate approval to publish a fresh isolated prerelease tag/image. The already published `f31e589` rc1 image is obsolete as a final runtime candidate. Do **not** update `:latest`. Pull the NEW immutable digest on both architectures and repeat smoke, permissions, media and independent original-image migration/rollback.
- [ ] Obtain separate permission to merge/release a stable tag, and reverify the exact resulting combined commit. No production use follows automatically.

## Gate D — separately managed production installations (separate explicit approval)

- [ ] Inventory current Compose/Dockge project name, mounted \`/data\` type/volume, \`/music\` path, upstream/fork source image, secrets, host architecture, storage capacity and rollback prerequisites. **No production inspection or action is authorized by this document.**
- [ ] Cold backup of complete original \`/data\` and Compose configuration, write a checksum, and successfully restore the backup to a distinct nonproduction volume. Do not use \`docker compose down -v\`.
- [ ] Define maintenance window, downtime, owner, monitor and go/no-go criteria.
- [ ] Pin an explicitly accepted tested image **tag/digest**; never rely on \`:latest\`. Keep the original project name, volume and music paths.
- [ ] After approved rollout verify authentication, music library, playlists/history, user permissions, audio/seek, file scanning, EN/NL menu, device clients and integrations.
- [ ] If rollback is needed, restore the **pre-upgrade** backup to a **new separate volume** before starting the original image; NEVER start the old image on a newly migrated database.

## Release decision

**No-go until all four gates have evidence and the appropriate approvals.** Manual device accessibility and security acceptance, final-head CI, candidate-image inspection, representative independent restore and user-approved publication/production installation are still outstanding. Draft #7 remains unmerged; **an earlier rc1 prerelease image was published**, but no current-runtime candidate, stable tag, `:latest` update or production installation change is implied.
