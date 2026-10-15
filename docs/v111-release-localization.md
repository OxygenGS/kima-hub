# v1.11 release information — versioned UI translations

**Status:** Draft Dutch editorial copy, implemented on the experimental PR #7
branch. Not a final human language or release sign-off.

## Scope and behavior

The authoritative **English** release catalog remains
`backend/src/services/releases/catalog.ts`. It determines the available
versions and stable item keys, which releases a user sees, and which
`requires`/`defaultValue`/`run` permissions, actions and API decisions are
valid. The API responses and persistence schema are unchanged.

`frontend/lib/i18n/release-copy.ts` provides a Dutch presentation-only copy
for `1.10.1` and `1.11.0`. The existing `WhatsNewWindow` uses that copy to
show the maintainer note, release lists, item pages and link labels. The
`WhatsNewGate` uses the same copy for its destructive wipe confirmation,
without changing the command the user approves.

The release **version**, stable item `key`, `kind`, `run` command, consent
`defaultValue`, `requires` authorization, state, and link **href** never
change with language. English is returned unmodified. Unknown versions,
unknown item keys, data from the music library and arbitrary server strings
are not translated: they fall back to the original source text.

## Consent and upgrade safety

The 1.11 GPU choice is **off until explicitly enabled**. Dutch disclosure
copy still says the optional acceleration downloads twelve pinned PyPI
packages (about 2 GB; approximately 3.4 GB installed), verifies files and
does not upload users' music-library data. Never shorten this to a claim
that GPU use requires no download.

The enrichment-wipe explanation specifies **analysis-derived metadata
only**. Original music files, playlists, listening counts, likes and user
edits remain. Wiping/rebuilding is an optional administrative action, not
a side effect of selecting Dutch or opening the release window.

The exact English texts of the GPU disclosure and wipe confirmation are
source-pinned in the localized-copy helper. If either changes upstream,
that individual warning falls back to the changed English text instead
of silently showing a stale Dutch translation. **This does not replace
manual security and editorial review of newly introduced choices.**

## Updating release notes

1. Update the English release catalog first; maintain stable item keys
   and versions according to upstream's own release model.
2. Add Dutch display copy for the specific new version and item keys.
   Do not translate identifiers or restructure API payloads.
3. Cross-check the maintenance, download and disclosure paragraphs
   against the updated English original. Refresh source-pinned safety
   text deliberately if its semantics changed.
4. Run `frontend/lib/__tests__/release-copy.test.ts`, the language
   dictionary tests, and the public EN/NL Playwright workflow. Test both
   existing and future/unknown versions and switching back to English.
5. Obtain human Dutch editorial review of the maintainer's personal
   note, technical claims and potentially destructive confirmations.
   Do not use a green machine test as a substitute for that sign-off.

## CI and operational boundaries

- The same experimental CI also tests backend roles, public share
  capability scoping, canonical music paths, official image migrations
  and independent rollback on **disposable** resources.
- Latest-head CI must be fully green before any PR is considered
  releasable. Mobile, TV, accessibility and editorial reviews remain
  separate gates.
- This documentation does not authorize merging, publishing images,
  tagging releases or updating production CT 101.
