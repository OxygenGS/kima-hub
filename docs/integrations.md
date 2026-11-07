# Integrations

Kima works on its own. Each service below is optional and set up in **Settings**; most are for admins only. What Kima sends to each is listed in [PRIVACY.md](../PRIVACY.md).

## Downtify (from v1.19.0)

Downtify is an **optional** integration for manually preparing and submitting individual Spotify tracks. It does not replace the existing Kima library importer or copy music to storage.

1. Sign in as a Kima administrator and open **Settings → Integrations → Downtify**.
2. Enter the Downtify server address reachable from the Kima backend and a **paired-device token** (not the account password).
3. Test the connection, then pair the device. The token is encrypted at rest and never displayed back to the browser.
4. Enable the required controls individually. Saving Spotify track requests does not start downloads; manual track submission requires an explicit acknowledgement.
5. Use the **Downloads** screen to inspect your permitted saved requests and owner-verified remote queue.

If Docker already manages a Downtify integration or device token, the browser refuses to replace it until the operator explicitly migrates configuration. Audio/source inspection stays disabled in database-pairing mode without a separately reviewed read-only staging mount. No unattended album/playlist import, file deletion, DAS transfer or Importer v5 cutover is provided.

[Detailed Downtify setup](downtify-settings.md) · [Unified Download Manager](unified-download-manager.md) · [User permissions](user-permissions.md)

## Lidarr

[Lidarr](https://lidarr.audio/) finds and downloads music. With Lidarr connected, Kima can request an album you do not own, and it adds the album to your library when the download finishes.

### Set up

1. Open **Settings > Download Services**.
2. Turn on **Enable Lidarr**.
3. Enter the Lidarr URL, such as `http://localhost:8686`, and the API key from Lidarr's own settings.
4. Choose **Test Connection**, then save.

Saving also creates a webhook connection named "Kima" in Lidarr, so Lidarr can tell Kima when an import finishes. Optionally pick a quality profile and a metadata profile; the default is Lidarr's own.

### When Lidarr cannot reach Kima

The webhook only works if Lidarr can open an address that leads to Kima. By default Kima gives Lidarr `http://host.docker.internal:3030`. Lidarr looks that name up from inside its own container:

- Docker Desktop provides the name.
- On Linux, add this to the Lidarr container: `extra_hosts: ["host.docker.internal:host-gateway"]`.
- Or set `KIMA_CALLBACK_URL` on Kima to an address Lidarr can reach, such as `http://YOUR_KIMA_SERVER_IP:3030`, restart Kima and save the Lidarr settings again.

When you save, Lidarr sends a test event. If it cannot reach Kima, admins get a notification called "Lidarr cannot reach Kima" that names the address and the error. Until it is fixed, Kima still notices finished downloads, but only on a check every two minutes.

### How Kima treats a request

- Kima counts a request as done when Lidarr holds the whole album you asked for.
- If Lidarr parks a download because some tracks are missing, Kima leaves it for you to handle in Lidarr.
- **Remove junk downloads** (on by default) lets Kima remove a download with no usable music, or the wrong album, so Lidarr tries the next release. Turn it off if your own Lidarr setup already handles this.

### Companion containers

`docker-compose.server.yml` starts Kima with Lidarr, Prowlarr, FlareSolverr, qBittorrent and NZBGet. `docker-compose.services.yml` starts only those tools. Both are starting points; you still configure the indexers and download clients inside them.

## Soulseek

[Soulseek](https://www.slsknet.org/) is a peer-to-peer network where people share music. Kima can search it and download from it, which helps with rare tracks that Lidarr cannot find.

Open **Settings > P2P Networks** and choose a connection mode:

- **Built-in (P2P):** Kima connects to the network itself. Enter your Soulseek username and password; you can create an account at slsknet.org.
- **slskd (external):** Kima uses your own [slskd](https://github.com/slskd/slskd) server. Enter its URL, such as `http://slskd:5030`, and its API key if you set one. Your Soulseek credentials stay in slskd.

Soulseek results appear next to your library results when you search. Downloaded tracks are saved in your music folder under `Singles/<artist>/<album>/`, so the normal library scan picks them up.

Under **Settings > Download Preferences** you choose the primary download source for playlist imports and weekly discovery (Soulseek for single tracks, or Lidarr for whole albums) and how many Soulseek downloads run at once (1 to 10).

Download speed and availability depend on the people sharing. Not every track will be found.

## Audiobookshelf

[Audiobookshelf](https://www.audiobookshelf.org/) manages audiobooks and podcasts. Kima reads its library and plays the audio.

1. Open **Settings > Media Servers**.
2. Turn on **Enable Audiobookshelf**.
3. Enter the server URL, such as `http://localhost:13378`, and an API key from your Audiobookshelf account.
4. Test the connection and save.

Your listening position is saved back to Audiobookshelf as you listen.

## ListenBrainz

[ListenBrainz](https://listenbrainz.org/) is an open listening history.

- **Similar artists:** Kima asks ListenBrainz for artists similar to the ones you play, and uses Deezer when ListenBrainz has too few. This needs no account.
- **Scrobbling (optional):** under **Settings > Scrobbling**, enter your ListenBrainz user token and Kima records your plays to your own account. You can remove the token at any time.

## Importing playlists

On the Playlists page, choose **Import URL** and paste a link, or **Import File** to load an M3U file. Kima matches each track to your library and can send the missing ones to your download source.

Links it accepts:

- Spotify and Deezer playlists
- YouTube and YouTube Music playlists
- SoundCloud sets, Bandcamp albums and Mixcloud playlists

Spotify playlists are read from their public pages, so you do not need to connect a Spotify account. The YouTube, SoundCloud, Bandcamp and Mixcloud links are read with `yt-dlp`, which the Docker image includes.

## Artwork and identification keys

Under **Settings → Artwork**:

- **Fanart.tv** supplies extra artist artwork. Turn it on and add a key from fanart.tv.
- **AcoustID** identifies files that have missing tags, by audio fingerprint. Kima has a shared key built in. You can add your own to avoid the shared key's rate limit.

## Podcasts

Search and subscribe to podcasts from the Podcasts page. Search uses Apple's iTunes Search service, and episodes are streamed from the feeds the shows publish.
