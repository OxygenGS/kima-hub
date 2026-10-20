# Interface languages — English and Dutch

OxygenGS Kima Hub offers English (default) and Dutch (`nl`) interface text. Signed-in users switch languages under **Settings → Language**; the login screen follows the saved browser choice but has no language dropdown.

## How it works

- Changing language updates supported **user-facing UI** immediately; select English or Dutch in the app.
- The preference is saved locally in your browser (`kima-hub-language`) and shared with other tabs for the same origin when browser storage is available.
- Language choice is **not** stored in the user account, does **not** sync between different devices, and does **not** translate song titles, artist names, filenames or music-library metadata.
- API identifiers, permissions, database values and stored playlists remain unchanged. The selector never changes a user's download privileges.

Numerous existing views already have EN/NL support (including player controls, home, Stats, Discover, Vibe Map and Mood Mixer). However a translation **catalog entry does not mean the screen uses it**: some routes and nested dialogs still have literal English copy. Work is continuing in reviewable frontend-only PRs. Provide the screen path, label and expected Dutch wording when reporting remaining untranslated controls.

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

Automated Chromium tests exercise public language switching and preference persistence. Additional component tests cover authenticated screens and permission-sensitive actions; test actual NL/EN switching on each newly translated view. The [combined v1.11 E2E run](https://github.com/OxygenGS/kima-hub/actions/runs/39301901157) also passed predeploy and functional browser tests. These are not a substitute for accessibility and real-device feedback.

For general use, see [using Kima](using-kima.md). For access control, see [user permissions](user-permissions.md).

## Coverage audit and remaining work

The catalog currently has over 1,400 aligned EN/NL keys, but full coverage also requires wiring every rendered frontend component to those keys. Translation passes cover:

- Browse playlists and Deezer playlist details: search, dialogs, action labels, errors and counts.
- Queue and Release Radar: headings, dates, controls, confirmations and status badges.
- Settings user management: roles, album/track permission toggles, labels and deletion confirmation.
- Playlist library: create/import actions, public/private options, M3U feedback and visibility controls.

**Still to audit and finish**, including dynamic messages and accessible names:

- [ ] Import preview, download progress and completion
- [ ] Individual playlist detail and share/link dialogs
- [ ] Search/Soulseek nested results and bulk actions
- [ ] Artist/album details and full library filtering
- [ ] Podcast and audiobook screens
- [ ] Discover, Vibe, radio and Stats subviews
- [ ] Every Settings panel, validation message and help tooltip
- [ ] Onboarding, sharing, offline/device/sync flows and mobile/TV affordances

These checkboxes are deliberately not marked complete without inspecting the nested components. **Full app-wide Dutch translation is not yet declared finished.** Maintain both locales in sync and add EN/NL switching tests when closing each area.
