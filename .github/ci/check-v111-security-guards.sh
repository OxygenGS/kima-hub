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
require_text backend/src/routes/library/streaming.ts 'await resolveExistingMusicFile(track.filePath)' "Browser stream and prewarm require canonical music paths"
require_text backend/src/routes/subsonic/playback.ts 'await resolveExistingMusicFile(track.filePath)' "Subsonic stream and download require canonical music paths"
require_text backend/src/routes/library/trackPath.ts 'fs.promises.realpath(candidate)' "Stored track file paths must resolve actual filesystem targets"
require_text backend/src/routes/share.ts 'streamFileWithRangeSupport(req, res, fullPath, mimeType, "private, no-store")' "Public share streams disable reuse after token revocation"
require_text backend/src/routes/share.ts 'fs.promises.realpath(candidatePath)' "Public share stream resolves actual filesystem target"
require_text backend/src/routes/share.ts 'fullPath.startsWith(realMusicRoot + path.sep)' "Public audio realpath stays within actual music root"
require_text backend/src/routes/share.ts 'select: sharedTrackSelect' "Anonymous share track response uses a safe projection"
require_text backend/src/routes/share.ts 'getCanonicalCoverFilePath(resizedPath)' "Tokened resized cover uses physical covers-root containment"
require_text backend/src/services/imageStorage.ts 'fs.realpathSync(filePath)' "Native image access checks canonical filesystem targets"
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
require_text backend/src/index.ts 'app.listen(config.port, config.host, async () => {' "Backend must honor configured listen HOST"
require_text Dockerfile 'HOST=127.0.0.1' "AIO backend must default to container loopback"
require_text Dockerfile 'DB_PASSWORD="$(cat /data/secrets/database_password)"' "AIO database uses persisted unique secret"
require_text Dockerfile "ALTER ROLE kima WITH PASSWORD" "Legacy AIO role credential is rotated"
require_text Dockerfile 'host all all 127.0.0.1/32 scram-sha-256' "Postgres loopback TCP uses SCRAM"
require_text Dockerfile 'host all all 0.0.0.0/0 reject' "Non-loopback PostgreSQL access denied"
require_text .github/workflows/upstream-v111-implementation-checks.yml 'dependency-security:' "Combined PR must run dependency and secret scan"
if grep -Fq -- 'postgresql://kima:kima@' Dockerfile; then
  echo "SECURITY CHECK FAILED: old hardcoded PostgreSQL credential in AIO Dockerfile" >&2
  exit 1
fi
require_text Dockerfile 'PGPASSWORD="$(cat /data/secrets/database_password)" psql -h localhost' "AIO worker healthchecks use persisted database password"
if grep -Fq -- 'PGPASSWORD=kima' Dockerfile; then
  echo "SECURITY CHECK FAILED: legacy fixed password in AIO worker readiness checks" >&2
  exit 1
fi
echo "Structural guard PASS; runtime authorization and all additional endpoints still require review."
