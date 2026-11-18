# Using Kima

A tour of the web app once it is running. Setup is in [install.md](install.md).

## First start

The first account you create becomes the administrator. When setup finishes, Kima scans your music folder and starts enrichment in the background: five steps that work out each song's sound, feel and genres and then build the map. The vibe map and the match data appear when enrichment has finished, which takes roughly 1 minute per 100 songs on a 16-core machine (see [library enrichment](administration.md#library-enrichment)). Progress is shown in **Settings > Library Enrichment**; see [administration.md](administration.md).

## Home

The home page shows the sections that have something to show:

- **Library Radio:** one-click stations. Shuffle All, Workout (high energy), Discovery (lesser-played) and Favorites (most played), plus stations for your common genres and decades.
- **Continue Listening** and **Recently Added.**
- **Made For You:** generated mixes. The **Mood Mixer** button beside it makes a playlist from one of the five moods: Upbeat, Melancholic, Calm, Intense or Energetic.
- **Recommended:** artists picked from your listening.
- **Popular Artists** (from ListenBrainz) and **Featured Playlists** (from Deezer).
- **Popular Podcasts** and **Audiobooks.**

## Kima Flow (v1.26.0)

The **Flow** navigation item offers a simple way to listen
without learning the 3D Vibe controls. It reuses Vibe audio matching but presents
three straightforward listening choices (**My favorites**, **A bit of both**,
**Surprise me**) and **Energy / Discovery** sliders. A preview shows the
proposed library tracks and why they were selected.

**Start Flow** plays the proposed songs using the existing Kima player, only
after a user click. If the first proposed song is already playing, Flow keeps
the song going and changes only the upcoming queue. The preview does not
download, relocate or change any music. Click **Explore the Vibe map** to use
the full 3D view.

**Continuous Flow (v1.26.0):** while a Flow session is playing, Kima prepares
more eligible library songs as the current queue nears its end. A rolling
queue retains the most recent previously heard songs. Editing the queue
manually or selecting a different mode automatically stops continuation
without pausing music. Choose **Stop automatic Flow** on the Flow or Queue
screen to stop adding new songs while keeping what is already queued.

**Music DNA (v1.26.0):** click **More like this** or
**Less like this** next to a proposed Flow song. These personal preferences
influence future Flow suggestions and are independent from global Favorites.
Tap a selected preference again to undo it. Each signed-in Kima account
has its own saved signals, and no external service receives these choices.
The current audio session and manually edited queue are never interrupted.

**Discovery Radar (v1.26.0):** while on Flow, click
**Find new artists** under **Beyond your library**. This on-demand search
compares the current playable song's artist with public similar-artist
sources. Suggestions exclude artists with playable tracks already in your
local library. Open **Explore albums** to reach the regular artist
discography, where album requests are optional and governed by the
existing user's music permissions. Radar never starts a Lidarr or Soulseek
download on its own. It never changes the current playback or queue.

**Album Spotlight (v1.26.0):** for a MusicBrainz-identified
new artist, choose **Preview albums** within its Discovery Radar card to see
up to three album/EP entries. These are unranked MusicBrainz source results,
not locally playable songs or guaranteed missing releases. Choose **Album
details** to open the existing page; any album request is still optional
and subject to that page's existing permission checks. No provider lookup
runs when merely opening Flow or the artist list.

Flow never starts audio automatically in response to the server. It only
extends playback that you explicitly started. The browser must remain open,
and the library must contain suitable songs; a small, fully used library
ends naturally.

**Upgrade safety:** Music DNA introduces a new database table. Before moving
from an earlier version to v1.26.0, stop all `/data` writers,
make a complete cold backup of the AIO volume, and verify that it restores
into a separate volume. Reverting only the image does not undo a migration.
See [safe AIO updates](safe-aio-updates.md).

[Flow technical documentation](project-nova.md).

## Library Guardian (v1.26.0)

Administrators can open **Settings → Library Doctor → Inspect possible
duplicates**. The new on-demand report groups files sharing the same
MusicBrainz recording ID and shows the scanned album, duration and any
matching acoustic-fingerprint evidence. Click **Review album** to compare
existing library editions. This is not a disk scan or a confirmed identical
file check. It never removes or edits music automatically.

## The vibe map

Open **Vibe** in the sidebar. Your library appears as a 3D space where songs that match sit close together. How matching works is described in the [Vibe and music analysis](administration.md#library-enrichment).

- Click a star to select it. A panel shows the song with four actions. Double-click a star to play it.
- Right-click a star for a menu with the same actions.
- **Play** plays the song.
- **Match Vibe** replaces the queue with the song and its 50 closest matches.
- **Similar** lights up the 50 closest matches on the map without changing the queue.
- **Song Path** starts a path from this song. Then click the song the path should end on.
- The search box at the top finds songs and artists by name. Song Path and Blend can also pick songs from a description of the sound; a description matches on sound only, because a sentence has no feel or genre.
- The mood buttons list the moods in your library, largest first. Pick one to light up its songs.

### Song Path

Pick a start and an end, either a song, an artist or a sound, and choose **Generate Path**. Kima queues a run of songs that moves from one to the other.

### Blend

Add songs to **More Like** and, if you want, songs to **Less Like.** Kima finds the songs that match the first group and not the second, and builds a playlist from them.

## Searching

The search page has the tabs **All Results**, **Library** and **Discover**. Library results are your artists, albums, tracks, podcasts and audiobooks. Discover finds music and podcasts you do not own. When Soulseek is connected, a **P2P Network** tab appears; see [integrations](integrations.md#soulseek).

## Playlists

The Playlists page makes new playlists, public or private. A public playlist is visible to the other accounts on your server. Add a song from the menu on any track and drag to reorder.

A playlist page has a share button. It makes a link that anyone can open without an account, and the page plays the songs. You can import playlists from other services; see [integrations](integrations.md#importing-playlists).

## Podcasts and audiobooks

Search for a show on the Podcasts page and subscribe. Episodes stream from the show's own feed, and Kima saves your place so you can carry on from another device.

Audiobooks come from [Audiobookshelf](integrations.md#audiobookshelf). Your place is saved back to it.

## Stats

The Stats page shows what you replay most, which artists make up most of your listening, and how much of your library you have never played, over the last 30 days, the last 12 months or all time. The full player shows how many times you have played the current song.

## Playback

Streaming quality is set in **Settings > Playback**: Original, 320, 192 or 128 kbps. See [configuration.md](configuration.md).

Keyboard shortcuts in the web app:

| Key | Action |
| --- | --- |
| Space | Play or pause |
| N | Next track |
| P | Previous track |
| S | Shuffle on or off |
| M | Mute or unmute |
| Up, Down | Volume up or down by 10% |
| Right, Left | Seek forward or back 10 seconds |

N, P and S work on music; the other keys also work on podcasts and audiobooks.

## On a phone or a TV

On compatible phones and browsers Kima can be installed to the home screen as a web app. Open your running Kima URL and use the browser's **Install app** or **Add to Home Screen** option. On a television browser Kima switches to a separate television layout.

## Downloads

The **Downloads** screen shows the current account's Kima download jobs from supported Lidarr and Soulseek workflows. Import status is separate from the download result. Configure services under **Settings** and see [integrations](integrations.md).

## Other apps

Apps that speak the Subsonic API can play from Kima. See [subsonic.md](subsonic.md).


## Appearance preferences (v1.27.0 development, not yet released)

In **Settings → Appearance** you can keep the original capitalization of artist,
album and song names instead of the default lowercase display, and show or hide
the Browse shortcut in the desktop navigation. Both choices are stored locally
per browser and update immediately without changing metadata, permissions or
media files. Hidden links remain accessible through their URL. Published stable
remains v1.26.0 until a separate approved release.


## Audiobook listening speed (v1.27.0 development — not yet released)

Choose 0.75×, 1×, 1.25×, 1.5×, 1.75× or 2× on an audiobook page, in
the full player, or in the mobile player options. Kima remembers your speed
in the current browser. The same speed applies when an audiobook changes
chapter or its playback engine recovers. Ordinary music and podcasts remain
at 1×, and progress is still saved in the original audiobook timeline.
This feature is part of an unreleased v1.27.0 development PR, not the
published v1.26.0 image.
