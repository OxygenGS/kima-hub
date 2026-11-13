# Privacy

Kima is software that runs on your machine. This page explains what the current OxygenGS fork stores locally, when optional integrations communicate externally, and what is not collected by the fork maintainer.

## Nothing is collected, by design

The fork does not include maintainer-operated telemetry, crash reporting, a sign-in service or a license checker. Your app installation does not send listening histories to the OxygenGS maintainer. Optional third-party integrations and public sharing are separate and must be evaluated by the operator.

Accounts in Kima are local to your instance. User records, password hashes, sessions and two-factor secrets are stored in your instance's persistent data, not in a maintainer-operated account service. There is no external OxygenGS sign-in, license activation or user registration endpoint.

The exceptions are the boring infrastructure kind: pulling the Docker image counts as a download from GitHub Container Registry (GHCR), and this repository counts GitHub traffic the way any project's does. That is all I get from your installation, and it's the same for every download of any open-source software.

## What your server talks to, and why

Kima reaches out to third-party services for features you use, the same way your current streaming apps do. These calls go out from your machine, so your IP address travels with them like it does with any website visit:

| Service | Why Kima calls it | What goes out |
|---|---|---|
| MusicBrainz, Wikidata, Wikipedia | Album/artist metadata, genres, biographies | Artist and album names, MBIDs, ISRCs |
| Cover Art Archive, Deezer image CDN | Album artwork | Album names, MBIDs |
| AcoustID | Identifying files with missing tags | An audio fingerprint of the file plus its claimed name |
| LRCLIB | Lyrics | Track, artist, album, duration |
| ListenBrainz | Similar artists and scrobbling | Only if you connect your account; then your plays, to your own account |
| iTunes | Podcast search | Your search text |
| Deezer, Spotify, YouTube | Playlist import and previews | Only the playlist links you paste, using credentials you supply |
| Lidarr, Soulseek, Audiobookshelf | Downloads and audiobooks | Your own servers, your own network |

Every one of these calls is a lookup: a name, a fingerprint, a playlist link. Your listening data can leave the installation through a service you deliberately connect, scrobbling you enable, or the optional bearer-protected public vibe feed. Play history and your library listing stay in your database everywhere else. Metadata enrichment can be paused per source in settings, and features you never touch (podcasts, imports, scrobbling) never make a call.

Your browser also fetches some album art directly from remote CDNs when the artwork shown came from Deezer or the Cover Art Archive. Same story: an image request from your browser to a public CDN, carrying the album it's for.

## What is stored, and where

Everything Kima knows lives in your database, on your machine: your library, play counts, playlists, sessions, and the service credentials you choose to store (encrypted at rest with a key that lives in your config, nowhere near me). The `/api/metrics` endpoint exists for monitoring tools you run yourself; it serves your machine and talks to nobody. Backups, retention, and who else sees any of it are entirely yours.

One consequence of Kima being software you run: if you host it for family, friends, or the public, you are the data controller for that instance. Access, retention, and deletion are yours to administer, and this policy binds them to nobody else.

## Optional public sharing

An administrator can explicitly enable the **public vibe feed** (`KIMA_PUBLIC_VIBE`) with a bearer token and a selected account. If enabled, requests bearing that token can access the configured user's library-map and live-listening data. This feature is off by default. Only enable it for a recipient and network you trust, and keep its token private.

## Scope

This policy describes the current OxygenGS fork, not speculative future features. The fork has no maintainer-operated music-account service or built-in telemetry collection. Users of a self-hosted instance control its backups, integrations, account access, network exposure and optional data sharing. For security concerns use [SECURITY.md](SECURITY.md); GitHub Issues may be disabled.
