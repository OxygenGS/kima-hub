# v1.11 + English/Dutch release acceptance matrix

**Status: experimental, not approved for deployment.** Last reviewed: 16 October 2026. Use this with [the first fork release checklist](first-fork-release-checklist.md), [safe AIO update and rollback guide](safe-aio-updates.md), and [internationalization rules](internationalization.md).

The intended release combines Draft PR #5 (EN/NL language selector), Draft PR #6 (v1.11 integration), and Draft PR #7 (new upstream runtime and screen translations). PR #7 targets #6 and #6 targets #5, not main. A green isolated branch run is *not* approval to merge or publish; it also does not substitute for acceptance on the eventual merged release commit.

## Gate A — reproducible code and permission boundaries

| Check | Acceptance evidence | Status |
| --- | --- | --- |
| Final combined PR head | All relevant frontend and backend tests, typing, lint, EN/NL Chromium and fork guards pass on the **exact commit** proposed for release | Last fully validated Draft #7 implementation commit `d42a966` passed 9/9 jobs in [Actions #38946015055](https://github.com/OxygenGS/kima-hub/actions/runs/38946015055): frontend, full backend, EN/NL browser, HTTP authorization, fork guards, dependency/secret security, native AMD64/ARM64 AIO. Later security documentation and vulnerability-gate commits still require exact-head CI |
| Real acquisition permissions | Actual HTTP admin/user/anonymous routes: Discover, album requests, manual Soulseek, track downloads and relevant new v1.11 paths deny unpermitted operations | Automated coverage exists; manual endpoint review outstanding |
| Upgrade migrations | Fresh database and two real upstream AIO sources (official v1.10.0 **and** official v1.11.0), both into new candidate using **isolated copies** | Both real-upstream source upgrades and independent rollbacks passed again on `d42a966` in Actions #38946015055; rerun on final candidate/merged release commit |
| Independent rollback | Restore an untouched *pre-upgrade full /data* snapshot to a **new volume**, then boot the original image and check original data, credentials and secrets | Disposable original-image restores passed on `d42a966`; representative copied-data human rehearsal outstanding |
| Containers and dependencies | Native AMD64/ARM64 image build and smoke, non-root/secret exposure, Docker/Compose mounts, dependency findings, third-party license/attribution | Both AIO architectures built, smoked and full-image Trivy scanned on `d42a966`. Reports: AMD64 297 HIGH / 8 CRITICAL and ARM64 296 HIGH / 8 CRITICAL, with no Trivy-listed fixed versions. [Image security triage](v111-image-security-review.md) **OPEN**; non-root, exploitability, distro alternatives and licensing still require review |
| Release trigger safety | Final tags unique and higher than existing fork v1.10.0; GHCR image origin, no accidental \`:latest\` prerelease, stable publishing only after approval | Not published or trigger-tested |

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
- [ ] Set a unique fork version above existing published v1.10.0 and update frontend/backend root package versions, lockfiles, changelog, release notes, Compose tags, README, supported migration notes and upstream attribution together.
- [ ] Inspect dependency and image-vulnerability reports, including [both fully built AIO image scans](v111-image-security-review.md). Eight CRITICAL OS-package findings per architecture remain unaccepted. The new CI image evaluator blocks findings with Trivy-listed fixes; unresolved findings require documented human security acceptance and possible package/base-image mitigation before publication.
- [ ] Obtain explicit permission to publish an isolated pre-release tag/image; **do not** update \`:latest\`. Pull the published digest into an isolated test stack and repeat smoke plus copied-volume migration and independent rollback.
- [ ] Obtain separate permission to merge/release a stable tag, and reverify the exact resulting combined commit. No production use follows automatically.

## Gate D — separately managed production installations (separate explicit approval)

- [ ] Inventory current Compose/Dockge project name, mounted \`/data\` type/volume, \`/music\` path, upstream/fork source image, secrets, host architecture, storage capacity and rollback prerequisites. **No production inspection or action is authorized by this document.**
- [ ] Cold backup of complete original \`/data\` and Compose configuration, write a checksum, and successfully restore the backup to a distinct nonproduction volume. Do not use \`docker compose down -v\`.
- [ ] Define maintenance window, downtime, owner, monitor and go/no-go criteria.
- [ ] Pin an explicitly accepted tested image **tag/digest**; never rely on \`:latest\`. Keep the original project name, volume and music paths.
- [ ] After approved rollout verify authentication, music library, playlists/history, user permissions, audio/seek, file scanning, EN/NL menu, device clients and integrations.
- [ ] If rollback is needed, restore the **pre-upgrade** backup to a **new separate volume** before starting the original image; NEVER start the old image on a newly migrated database.

## Release decision

**No-go until all four gates have evidence and the appropriate approvals.** Manual device accessibility and security acceptance, final-head CI, candidate-image inspection, representative independent restore and user-approved publication/production installation are still outstanding. PRs remain Draft; no registry push, merge or production installation change is implied.
