# Interface languages

Kima Hub — Oxygen's Fork uses typed, incremental interface translations.

## Status — development (2026-10-14)

- English (`en`) is the default interface language; Dutch (`nl`) is available on the login, registration, **first-run onboarding**, and Settings screens.
- Language changes immediately, applies to all components wired to the translation context, and persists in **this browser** using the `kima-hub-language` local storage key. Tabs of the same origin share the choice when browser storage is available. When storage is blocked, users can still switch between English and Dutch in the current tab, but the preference cannot survive a reload.
- Preferences are **not stored in user accounts** and are **not synchronized between devices**. This does not require database changes or migrations.
- The current dictionary contains **1,077 matching English/Dutch UI keys** on the language-development branch. This is the number of keys, **not** proof of complete screen coverage.
- Route-level translations cover onboarding, sync, mix details, album/artist pages, and Vibe map/Galaxy/path/blend controls. Navigation, login, many Settings controls, and selected activity panels are also translated. The Soulseek results browser, filtering labels, grouped results and Vibe operation confirmation prompt also support Dutch. Route errors and critical recovery screens now provide Dutch labels, including a storage-backed fallback when the regular language provider is unavailable.
- Incomplete areas include nested dialogs, some authenticated-only flows, server-provided errors, third-party metadata, and device-specific interfaces. Do **not** describe the entire application as translated until a real authenticated walkthrough is complete.

## Implementation rules

1. Add a stable English source key and its Dutch translation to `frontend/lib/i18n/translations.ts`. English and Dutch dictionaries must remain exactly in sync.
2. In a client component call `const { t } = useLanguage()` and render `t("English source key")`. For dynamic or server-provided messages, use a narrow known-message mapping; an unknown message should remain unchanged rather than receive an invented translation.
3. Translate only user-visible labels, explanations, and accessible names. Do **not** translate option `value` fields, discriminated-union values (e.g. `badge="owned"`), API enums, route IDs, database keys, or build identifiers.
4. Do not translate user-entered titles, playlist names, filenames, filesystem paths, API keys, credentials, provider identifiers, or song/artist/album metadata.
5. Keep mobile buttons, `aria-label` values, placeholders, error feedback, and keyboard instructions aligned with visible translations. Localize dates, numbers, durations and plurals where applicable without modifying underlying values.
6. Add targeted regression tests whenever UI text, locale persistence, or language-sensitive accessibility labels change. Inspect both English and Dutch with keyboard and mobile viewport coverage.

Translation keys currently use English UI phrases rather than numeric identifiers. Rename a key in **both** dictionaries and at every usage site in the same change.

## Automated checks

```bash
cd frontend
npm ci
npm run typecheck
npm run test:unit
npm run lint
npx playwright test --config playwright.public-locale.config.ts
```

The isolated Chromium suite (`frontend/tests/e2e/language-selection.spec.ts`) covers:

- public login language selection and reload persistence;
- changing language without resetting the login form;
- first-run onboarding language selection and persistence before an account exists;
- a **mocked** signed-in Settings screen, including persistence on reload and return to English;
- language synchronization between existing tabs and fallback to English for an unsupported stored locale.
- Dutch selection on a narrow mobile login/onboarding viewport (375px), with visibility and horizontal reachability checks.

The simulated signed-in test uses a fake local token and intercepted API responses. It verifies UI behavior only: **it does not verify real login, permission enforcement, real Settings API calls, or production authentication**.

Repository CI separately runs frontend/backend tests, TypeScript, database upgrade checks, an AIO fresh-install/upgrade smoke, security scans, and a legacy project-name audit. Green automated checks do not replace real-device or manual end-to-end validation. Existing lint warnings remain tracked independently; do not disable the lint gate.

## Authenticated release checklist — still required

- [ ] Use an isolated development or test instance with **dedicated nonproduction** admin and regular-user accounts. Never point browser E2E tests at real or privately managed installations.
- [ ] Check language switching in Settings as admin and nonadmin, across navigation and a full reload, including multiple tabs.
- [ ] Check album, artist, playback queue, search, playlist dialogs, downloads, Vibe map/Galaxy, and settings forms in both languages.
- [ ] Check first-run onboarding, service-connection failures, error screens, 2FA feedback, mobile layout, screen-reader labels and keyboard interaction.
- [ ] Check pluralization and locale formatting for counts, dates and times, and confirm externally sourced content remains unchanged.
- [ ] Confirm no new database migrations, API contract changes, permission changes, image publication or production deployment occurred as a side effect of localization.

For real authenticated E2E suites, the existing `frontend/playwright.config.ts` requires `KIMA_TEST_USERNAME`, `KIMA_TEST_PASSWORD`, and the isolated test server URL; do not commit secrets or use real production data.

A **separate opt-in real-account language walkthrough** now lives in `frontend/tests/e2e/predeploy/authenticated-locale.spec.ts`. It tests Dutch on authenticated Settings and Search, route navigation, reload persistence, restoring English, and the mobile Settings selector. On the disposable AIO runner only, `KIMA_E2E_EXPECT_SYNTHETIC_MUSIC=1` also enables a fixture-backed Collection test that checks translated headings/tab labels while preserving the original song title. To run it on a disposable **nonproduction** instance:

```bash
cd frontend
export KIMA_UI_BASE_URL="http://127.0.0.1:3030"  # Replace with your isolated test instance URL
export KIMA_TEST_USERNAME="<dedicated-test-user>"
export KIMA_TEST_PASSWORD="<dedicated-test-password>"
export KIMA_E2E_LOCALE_WALKTHROUGH=1
npx playwright test tests/e2e/predeploy/authenticated-locale.spec.ts
```

Without the opt-in flag the tests are skipped; without credentials, the regular real-account Playwright setup rejects the run. The PR's AIO smoke workflow runs this suite for a real synthetic administrator and a regular user inside its disposable localhost-only Docker installation, after creating its audio/auth fixture. All three authenticated scenarios **passed for both roles on commit `7129428`** (six real-login browser tests), including the fixture-backed library check. AIO startup, Docker build, database upgrade and independent old-data snapshot restore also passed. A green automated walkthrough still does **not** replace full manual review. Manual desktop/mobile/TV, admin permissions, downloads, playback and accessibility acceptance remain release requirements.


## Remaining decisions

- Complete residual dialogs and authenticated-only interface translations.
- Improve date/duration/plural formatting with dedicated locale-aware utilities where needed.
- Decide separately whether to support per-user server-side language preference and cross-device synchronization.
- Require human approval before removing PR draft status, merging, publishing images, or updating production.
