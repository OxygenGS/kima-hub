#!/usr/bin/env bash
# Lightweight structural regression guard; real role-based HTTP tests
# remain mandatory before public release.
set -euo pipefail
require_text() {
  local file="$1" text="$2" description="$3"
  if ! grep -Fq -- "$text" "$file"; then
    echo "SECURITY CHECK FAILED: $description ($file)" >&2
    exit 1
  fi
  echo "PASS: $description"
}
require_text backend/prisma/schema.prisma 'canRequestAlbums' "Album-request permission preserved"
require_text backend/prisma/schema.prisma 'canDownloadTracks' "Track-download permission preserved"
require_text backend/prisma/schema.prisma 'model BrandingSettings' "Separate branding model preserved"
require_text backend/src/middleware/auth.ts 'export function requireMusicPermission' "Music permission guard exists"
require_text backend/src/routes/auth.ts '"/users/:id/permissions"' "Admin-only permission editing route exists"
require_text backend/src/routes/downloads.ts 'router.post("/", requireMusicPermission("canRequestAlbums")' "Album acquisition guard"
require_text backend/src/routes/discover.ts 'router.post("/generate", requireMusicPermission("canRequestAlbums")' "Discover generate guard"
require_text backend/src/routes/discover.ts 'router.post("/retry-unavailable", requireMusicPermission("canRequestAlbums")' "Discover retry guard"
require_text backend/src/routes/share.ts 'select: sharedTrackSelect' "Anonymous share track response uses a safe projection"
require_text backend/src/routes/share.ts 'await shareContainsCover(shareLink, coverArtId)' "Public share cover access bound to actual shared content"
require_text backend/src/routes/share.ts 'res.setHeader("Cache-Control", "private, no-store")' "Tokened share covers must not cache past revocation"
require_text backend/src/routes/subsonic/mappers.ts 'subsonicError(req, res, SubsonicError.GENERIC, "Internal server error")' "Subsonic internal errors do not expose diagnostics"
require_text backend/src/routes/subsonic/playback.ts 'if (!(await requireSubsonicDownloadRight(req, res))) return;' "Subsonic explicit downloads check current DB rights"
require_text backend/src/routes/subsonic/userHelpers.ts 'select: { role: true, canDownloadTracks: true }' "Subsonic current-role and permission lookup"
require_text backend/src/routes/subsonic/userHelpers.ts '"@_downloadRole": user.role === "admin" || user.canDownloadTracks' "Subsonic reports correct user download role"
require_text backend/src/routes/offline.ts 'router.post("/albums/:id/download", requireMusicPermission("canDownloadTracks")' "Offline album download guard"
require_text backend/src/routes/offline.ts 'router.post("/tracks/:id/complete", requireMusicPermission("canDownloadTracks")' "Offline completion permission recheck"
require_text backend/src/routes/soulseek.ts 'requireMusicPermission("canDownloadTracks")' "Soulseek file download guard"
require_text backend/src/routes/releases.ts 'router.post("/download/:albumMbid", requireMusicPermission("canRequestAlbums")' "Release Radar album download guard"
require_text backend/src/index.ts 'app.use("/api/branding"' "Instance branding API mounted"
require_text frontend/app/layout.tsx '<LanguageProvider>' "EN/NL browser language provider mounted"
require_text frontend/app/layout.tsx '<BrandingProvider>' "Instance branding provider mounted"
echo "Structural guard PASS; runtime authorization and all additional endpoints still require review."
