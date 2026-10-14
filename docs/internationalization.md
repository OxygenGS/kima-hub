# Interface languages

Kima Hub — Oxygen's Fork is introducing typed, incremental interface translations.

## Current status (development)

- English (`en`) is the default.
- Dutch (`nl`) can be selected on the login, registration, or Settings screen.
- The choice is saved in the current **browser** and shared with other Kima Hub tabs on that browser.
- No new database tables or migrations are required. A user's choice is **not yet synchronized between devices**.
- Common navigation and selected account/settings flows are localized. Many application pages, backend-originated errors, metadata and device-specific interfaces still use English. Do not describe the entire application as translated until coverage is complete.

## Adding UI translations

1. Add a **stable English source key** and the corresponding Dutch text to `frontend/lib/i18n/translations.ts`.
2. In a client component, call `const { t } = useLanguage()` and render `t("English source key")`.
3. For a list of options, translate only the human-readable `label`; preserve the `value` sent to APIs.
4. Do not translate user-entered text, filenames, filesystem paths, database field names, API keys, log messages used programmatically, or external-provider identifiers.
5. Keep keyboard labels, `aria-label` values, modal descriptions and mobile navigation consistent with visible text.
6. Add or update tests when adding translation keys or modifying UI flows. Check both English and Dutch in a browser before releasing.

For now, translation keys are English phrases rather than numeric IDs. If a source phrase is changed, rename that key in both dictionaries and all usage sites in the same commit.

## Validation

```bash
cd frontend
npm ci
npm run typecheck
npm run test:unit
npm run lint
```

The project currently has pre-existing frontend lint findings. Those need to be addressed separately; do not silently disable the lint gate.

## Future work

- Complete all page-level translation coverage, including onboarding and playback UI.
- Localize dates, durations and plural forms with `Intl` and dedicated formatters.
- Decide whether authenticated language preferences should be persisted per user on the server.
- Add explicit browser-based locale persistence and language-switching tests.
