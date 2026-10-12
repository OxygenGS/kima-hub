# Per-installation branding

The fork has a **Branding** section in **Settings** for administrators. It is
intentionally not tied to the Chillverse name or any other organization.

## Editable properties

- **Application name** (1–60 characters): used on the sign-in screen, desktop,
  mobile and TV navigation, browser title, PWA manifest and social metadata.
- **Tagline** (up to 120 characters): shown on sign-in and in metadata.
- **Accent color**: one hexadecimal color for primary UI actions and highlights.
- **Main background color**: a hexadecimal color; use a dark shade because the
  current interface uses light text and does not have a light-mode contrast system.
- **Logo**: PNG/JPEG/WebP, up to 400 KiB input, normalized to a WebP image with
  maximum dimensions 512×512. The logo appears on desktop, mobile, TV and login.
- **Favicon/PWA icon**: PNG/JPEG/WebP, up to 128 KiB input, normalized to a
  transparent 192×192 PNG. Used by browser favicon and web-app manifest.

The original Kima branding remains the default until an admin customizes
this installation. Reset is available from the same section.

## Persistence and upgrades

Branding is stored in the `BrandingSettings` PostgreSQL table via the migration
`20261012210000_add_instance_branding`. This includes the normalized image bytes,
so **no persistent filesystem image mount or branding script is necessary**.

As with any application configuration, preserve/back up the database volume.
Deleting the database volume erases branding settings and other application data.

The application serves public `GET /api/branding`,
`GET /api/branding/logo` and `GET /api/branding/favicon` endpoints. This is
necessary so even signed-out users see the correct branding. Only authenticated
admins can `POST /api/branding` or `DELETE /api/branding`.

Image inputs are constrained to raster formats and are re-encoded server-side.
SVG and arbitrary remote-image URLs are not accepted.

Changes are applied at runtime. Existing browsers may need a reload for
the installed-app icon to refresh, depending on their PWA cache policy.

## DEV deployment

On CT 105, **after GitHub checks turn green**, run:

```bash
cd /opt/chillverse-dev/kima-hub
git pull --ff-only
docker compose --env-file .env.chillverse-dev -f docker-compose.chillverse-dev.yml build backend
docker compose --env-file .env.chillverse-dev -f docker-compose.chillverse-dev.yml build frontend
docker compose --env-file .env.chillverse-dev -f docker-compose.chillverse-dev.yml up -d --no-build backend frontend
docker compose --env-file .env.chillverse-dev -f docker-compose.chillverse-dev.yml ps
```

The backend applies the new migration automatically on startup. This does not
touch the separate production CT 101.
