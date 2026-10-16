# Kima Hub — user music permissions

This document describes the change under development on `feature/user-permissions`. It is **not ready for production deployment**.

## Intended behavior

| Account | Request albums | Download tracks |
| --- | --- | --- |
| Admin | Allowed | Allowed |
| User (default) | Denied | Denied |
| User (customized) | According to `canRequestAlbums` | According to `canDownloadTracks` |

Both fields are Boolean with a PostgreSQL default of `false`. Administrators always have both permissions, regardless of field values.

Admins manage user permissions in **Settings > User Management**, backed by `PATCH /api/auth/users/:id/permissions`. The endpoint accepts only Boolean `canRequestAlbums` and `canDownloadTracks`; it requires admin authentication.

## Protected download entry points

- `POST /api/downloads`: album / artist download requests.
- `POST /api/soulseek/download`: manual track downloads.
- `POST /api/releases/download/:albumMbid`: Release Radar requests.
- `POST /api/playlists/:id/pending/retry-all` and `POST /api/playlists/:id/pending/:trackId/retry`: Soulseek retry.
- `POST /api/discover/generate` and `POST /api/discover/retry-unavailable`: Discover generation and download retry.
- `POST /api/spotify/import` and `POST /api/spotify/import/quick`: requests both permissions because the import flow can acquire albums and tracks.
- Scheduled Discover Weekly: skip accounts without `canRequestAlbums` at enqueue time and check again before processing.

The server-side middleware retrieves the current database permissions for each request; the interface alone is not a security boundary.

## Verification before deployment

1. Run PostgreSQL migrations against a disposable test database only.
2. Run backend type checking and Jest, including the permissions middleware and route tests.
3. Run frontend lint, type checking, and unit tests.
4. Confirm normal users are denied (HTTP 403), admins retain access, and granting/revoking permissions takes effect without logging out.
5. Audit any further background import or download routes and confirm that the visible UI reflects permission failures clearly.
6. Leave existing production music services and external integrations unchanged until a separately approved upgrade has been tested.

## Release safety

Do **not** merge this branch or run migrations against production until CI and a separate test instance are verified. Back up the production database before a future approved rollout.
