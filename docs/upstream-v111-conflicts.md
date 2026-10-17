# Upstream v1.11.0 merge: first real conflict inventory

Recorded from GitHub Actions upstream merge audit (commit `1ee91f3`, 2026-10-15). The upstream tag was the immutable published `v1.11.0`; the fork baseline was our in-development language/permissions branch. The merge was **dry-run only** and was aborted without committing any upstream code.

## Results

- **141 unresolved paths** from a real `git merge --no-commit --no-ff` (not an estimate)
- 125 frontend, 9 backend, 4 CI, 3 Docker/documentation/other
- Conflicts can include content, rename/delete and modify/delete cases.
- **A merge conflict count is not a bug count or a completion estimate.** Every path still needs appropriate manual semantic review.

## Priorities

1. Database schema `backend/prisma/schema.prisma`, backend APIs and data migrations: protect fork permissions/branding, reconcile removed upstream routes and ensure both original v1.10/v1.11 data can upgrade safely.
2. Frontend API and authentication including upstream's storage, analysis and error changes.
3. New and modified user-facing screens and translation dictionaries. Do not translate code or metadata.
4. Dockerfile, package/lockfile changes, fork GHCR publishing and CI safety.
5. Full browser, role/permission, audio and old-image restore regression tests.

## Conflicting paths by area

### Workflows / release (4)

- `.github/ISSUE_TEMPLATE/config.yml`
- `.github/workflows/docker-publish.yml`
- `.github/workflows/pr-checks.yml`
- `.github/workflows/prerelease.yml`

### Backend / schema (9)

- `backend/package-lock.json`
- `backend/package.json`
- `backend/prisma/schema.prisma`
- `backend/src/index.ts`
- `backend/src/routes/__tests__/auth.route.test.ts`
- `backend/src/routes/discover.ts`
- `backend/src/routes/downloads.ts`
- `backend/src/routes/releases.ts`
- `backend/src/routes/soulseek.ts`

### Frontend app routes (36)

- `frontend/app/album/[id]/page.tsx`
- `frontend/app/artist/[id]/page.tsx`
- `frontend/app/audiobooks/[id]/page.tsx`
- `frontend/app/audiobooks/page.tsx`
- `frontend/app/audiobooks/series/[name]/page.tsx`
- `frontend/app/browse/playlists/[id]/page.tsx`
- `frontend/app/browse/playlists/page.tsx`
- `frontend/app/collection/page.tsx`
- `frontend/app/device/page.tsx`
- `frontend/app/discover/page.tsx`
- `frontend/app/error.tsx`
- `frontend/app/global-error.tsx`
- `frontend/app/globals.css`
- `frontend/app/import/playlist/page.tsx`
- `frontend/app/layout.tsx`
- `frontend/app/login/page.tsx`
- `frontend/app/manifest.webmanifest/route.ts`
- `frontend/app/mix/[id]/page.tsx`
- `frontend/app/onboarding/page.tsx`
- `frontend/app/page.tsx`
- `frontend/app/playlist/[id]/page.tsx`
- `frontend/app/playlists/page.tsx`
- `frontend/app/podcasts/[id]/page.tsx`
- `frontend/app/podcasts/genre/[genreId]/page.tsx`
- `frontend/app/podcasts/page.tsx`
- `frontend/app/queue/page.tsx`
- `frontend/app/radio/page.tsx`
- `frontend/app/register/page.tsx`
- `frontend/app/releases/page.tsx`
- `frontend/app/search/page.tsx`
- `frontend/app/settings/page.tsx`
- `frontend/app/setup/page.tsx`
- `frontend/app/share/[token]/SharePageClient.tsx`
- `frontend/app/share/[token]/layout.tsx`
- `frontend/app/sync/page.tsx`
- `frontend/app/vibe/page.tsx`

### Frontend components (22)

- `frontend/components/MoodMixer.tsx`
- `frontend/components/activity/HistoryTab.tsx`
- `frontend/components/layout/ActivityPanel.tsx`
- `frontend/components/layout/BottomNavigation.tsx`
- `frontend/components/layout/MobileSidebar.tsx`
- `frontend/components/layout/Sidebar.tsx`
- `frontend/components/layout/TVLayout.tsx`
- `frontend/components/layout/TopBar.tsx`
- `frontend/components/player/FullPlayer.tsx`
- `frontend/components/player/KeyboardShortcutsTooltip.tsx`
- `frontend/components/player/MiniPlayer.tsx`
- `frontend/components/player/OverlayPlayer.tsx`
- `frontend/components/player/SleepTimer.tsx`
- `frontend/components/providers/GlobalErrorBoundary.tsx`
- `frontend/components/ui/Button.tsx`
- `frontend/components/ui/ConfirmDialog.tsx`
- `frontend/components/ui/FormElements.tsx`
- `frontend/components/ui/InlineStatus.tsx`
- `frontend/components/ui/OperationConfirmToast.tsx`
- `frontend/components/ui/Pagination.tsx`
- `frontend/components/ui/PlayableCard.tsx`
- `frontend/components/ui/PlaylistSelector.tsx`

### Frontend feature modules (63)

- `frontend/features/album/components/AlbumActionBar.tsx`
- `frontend/features/album/components/AlbumHero.tsx`
- `frontend/features/album/components/SimilarAlbums.tsx`
- `frontend/features/album/components/TrackList.tsx`
- `frontend/features/artist/components/ArtistActionBar.tsx`
- `frontend/features/artist/components/ArtistBio.tsx`
- `frontend/features/artist/components/ArtistHero.tsx`
- `frontend/features/artist/components/AvailableAlbums.tsx`
- `frontend/features/artist/components/Discography.tsx`
- `frontend/features/artist/components/PopularTracks.tsx`
- `frontend/features/artist/components/SimilarArtists.tsx`
- `frontend/features/audiobook/components/AudiobookActionBar.tsx`
- `frontend/features/audiobook/components/AudiobookHero.tsx`
- `frontend/features/audiobook/components/SectionList.tsx`
- `frontend/features/discover/components/DiscoverActionBar.tsx`
- `frontend/features/discover/components/DiscoverHero.tsx`
- `frontend/features/discover/components/HowItWorks.tsx`
- `frontend/features/discover/components/TrackList.tsx`
- `frontend/features/discover/components/UnavailableAlbums.tsx`
- `frontend/features/discover/hooks/useDiscoverData.ts`
- `frontend/features/home/components/HomeHero.tsx`
- `frontend/features/home/components/LibraryRadioStations.tsx`
- `frontend/features/home/components/SectionHeader.tsx`
- `frontend/features/home/radioData.ts`
- `frontend/features/library/components/AlbumsGrid.tsx`
- `frontend/features/library/components/ArtistsGrid.tsx`
- `frontend/features/library/components/LibraryHeader.tsx`
- `frontend/features/library/components/LibraryTabs.tsx`
- `frontend/features/library/components/RefinePanel.tsx`
- `frontend/features/library/components/TracksList.tsx`
- `frontend/features/podcast/components/ContinueListening.tsx`
- `frontend/features/podcast/components/EpisodeList.tsx`
- `frontend/features/podcast/components/PodcastActionBar.tsx`
- `frontend/features/podcast/components/PodcastHero.tsx`
- `frontend/features/podcast/components/PreviewEpisodes.tsx`
- `frontend/features/podcast/components/SimilarPodcasts.tsx`
- `frontend/features/search/components/EmptyState.tsx`
- `frontend/features/search/components/SoulseekBrowser.tsx`
- `frontend/features/search/components/TVSearchInput.tsx`
- `frontend/features/search/components/TopResult.tsx`
- `frontend/features/search/hooks/useSoulseekSearch.ts`
- `frontend/features/settings/components/sections/AIServicesSection.tsx`
- `frontend/features/settings/components/sections/AccountSection.tsx`
- `frontend/features/settings/components/sections/AudiobookshelfSection.tsx`
- `frontend/features/settings/components/sections/CacheSection.tsx`
- `frontend/features/settings/components/sections/CorruptTracksSection.tsx`
- `frontend/features/settings/components/sections/DownloadPreferencesSection.tsx`
- `frontend/features/settings/components/sections/LidarrSection.tsx`
- `frontend/features/settings/components/sections/SoulseekSection.tsx`
- `frontend/features/settings/components/sections/SubsonicSection.tsx`
- `frontend/features/settings/components/sections/UserManagementSection.tsx`
- `frontend/features/settings/components/ui/SettingsLayout.tsx`
- `frontend/features/settings/components/ui/SettingsSection.tsx`
- `frontend/features/settings/hooks/useSystemSettings.ts`
- `frontend/features/vibe/ActivityIconBar.tsx`
- `frontend/features/vibe/VibeAlchemy.tsx`
- `frontend/features/vibe/VibePanelSheet.tsx`
- `frontend/features/vibe/VibeSongPath.tsx`
- `frontend/features/vibe/VibeToolbar.tsx`
- `frontend/features/vibe/scenes/GravityGridScene.tsx`
- `frontend/features/vibe/tabs/LyricsTab.tsx`
- `frontend/features/vibe/tabs/NowPlayingTab.tsx`
- `frontend/features/vibe/tabs/QueueTab.tsx`

### Frontend config / API (4)

- `frontend/lib/api.ts`
- `frontend/next.config.ts`
- `frontend/package-lock.json`
- `frontend/package.json`

### Other (Docker / docs) (3)

- `Dockerfile`
- `README.md`
- `docker-compose.server.yml`

## Release status

This is a **historical conflict inventory**, not a list of unresolved files in the newer experimental implementation. The combined upstream v1.11 application is being validated in Draft PR #7 on top of Draft #6 and #5. A source merge, public release or production deployment has not been approved.

See [upstream integration plan](upstream-v111-integration-plan.md).
 