# User music permissions

OxygenGS Kima Hub lets administrators control music acquisition **separately** from ordinary streaming. Controls are enforced in the **backend**, not just by hiding buttons. They are included in the v1.11.0 fork.

## Default access

| Account | Request albums | Download tracks |
| --- | --- | --- |
| Administrator | Allowed | Allowed |
| Standard user (default) | Denied | Denied |
| Standard user (customized) | Per `canRequestAlbums` | Per `canDownloadTracks` |

New permission fields default to `false` for regular accounts. Administrators can edit permissions in **Settings → User Management**. The restricted endpoint is `PATCH /api/auth/users/:id/permissions`, and accepts Boolean `canRequestAlbums` and `canDownloadTracks`.

## Enforced server operations

Album/request authorization is checked on album or artist download requests, Release Radar acquisition, Discover generation/retry and scheduled Discover Weekly jobs. Track-download authorization protects manual Soulseek downloads and pending-playlist retries. The Spotify import routes require both permissions where import actions can acquire albums and tracks.

The main protected routes include:

- `POST /api/downloads`, `POST /api/releases/download/:albumMbid`
- `POST /api/soulseek/download`
- `POST /api/playlists/:id/pending/retry-all`, `POST /api/playlists/:id/pending/:trackId/retry`
- `POST /api/discover/generate`, `POST /api/discover/retry-unavailable`
- `POST /api/spotify/import`, `POST /api/spotify/import/quick`

These backend endpoints fetch current database permissions for the authenticated user. Denied calls must not enqueue a download; button visibility alone never determines access.

## Verification and maintenance

The v1.11.0 combined PR passed role/middleware and HTTP authorization tests, database migration tests and native Docker smoke checks. Administrators should still verify configured permissions after upgrading. Keep an untouched backup of the old data before any database migration. See [installation and upgrading](install.md#updating), [administration](administration.md) and [security](security.md).
