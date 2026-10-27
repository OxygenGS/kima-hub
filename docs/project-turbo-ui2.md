# Project Turbo + UI 2.0 (v1.12.0 development)

This is a **development plan**, not a claim that v1.12.0 has been released.
The production baseline is OxygenGS Kima Hub v1.11.10, including upstream
Kima Hub's existing functionality and the fork's interoperability fixes.

## Goals and validation

- Make artist, album and library navigation feel immediate on desktop, phone
  and TV without weakening permissions or triggering requests for every tile.
- Replace blank collection loading spinners with stable placeholders. Retain
  keyboard focus, language support and reduced-motion behaviour.
- Keep existing React Query cache keys and mutation invalidation paths.
- Measure cold and warm artist/album navigation: navigation-to-content,
  request count and layout shift. Do not claim speedup percentages until
  real-browser and device measurements are collected.

## First batch

1. Share 10-minute detail prefetch across home, library, discography, artist
   recommendations and related owned albums. Prefetch only on hover, focus
   or touch; do not eagerly fetch remote discovery suggestions.
2. Avoid rereading the image palette cache on unchanged-cover renders.
3. Show accessible, layout-stable artist/album/track skeletons instead of
   collection-wide loading spinners.
4. Add clear keyboard focus and touch intent support to shared media cards.
5. Cover cache reuse, request deduplication and skeleton structure with
   frontend regression tests.

## Follow-up batches

- Profile backend artist and album API timings and real library query counts;
  optimize verified server-side bottlenecks.
- Consider large-list virtualization and image decoding changes only when
  browser traces demonstrate a clear gain, retaining mobile and TV support.
- Iterate on mobile hero layout, player interactions and visual consistency
  with actual EN/NL screenshots and accessibility checks.

No database migrations, new credentials, production deployment or private
installation settings belong to this initial frontend batch.
