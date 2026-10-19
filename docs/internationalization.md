# Interface languages — English and Dutch

OxygenGS Kima Hub v1.11.0 includes an in-app language selector on login, registration, first-run onboarding and signed-in **Settings**. English is the default; Dutch (`nl`) is optional.

## How it works

- Changing language updates supported **user-facing UI** immediately; select English or Dutch in the app.
- The preference is saved locally in your browser (`kima-hub-language`) and shared with other tabs for the same origin when browser storage is available.
- Language choice is **not** stored in the user account, does **not** sync between different devices, and does **not** translate song titles, artist names, filenames or music-library metadata.
- API identifiers, permissions, database values and stored playlists remain unchanged. The selector never changes a user's download privileges.

New v1.11 screens—including Stats, Discover Weekly, the player, Vibe Map and Mood Mixer—have EN/NL support. Some deeply nested dialogs, third-party messages and device-specific labels can still display their source language. Report untranslated controls to the [OxygenGS issue tracker](https://github.com/OxygenGS/kima-hub/issues).

## Translation development

Translations live in `frontend/lib/i18n/translations.ts`. Add the English source and Dutch translation together, then render client-side labels with `useLanguage().t("English source key")`. Keep dictionary keys aligned and **never translate** route names, API enums, option values, credentials, file paths or user music metadata.

Both languages must preserve visible labels, `aria-label` names, keyboard instructions and meaningful errors. Unknown provider-generated text should be displayed unmodified rather than guessed at.

## Verification

```bash
cd frontend
npm ci
npm run typecheck
npm run lint
npm run test:unit
npx playwright test --config playwright.public-locale.config.ts
```

Automated Chromium tests exercise public language switching, persistence, onboarding and Settings behavior, including narrow layouts. The [combined v1.11 E2E run](https://github.com/OxygenGS/kima-hub/actions/runs/39301901157) also passed predeploy and functional browser tests. These are not a substitute for accessibility and real-device feedback.

For general use, see [using Kima](using-kima.md). For access control, see [user permissions](user-permissions.md).
