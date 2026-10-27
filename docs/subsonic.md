# Subsonic and OpenSubsonic clients

Kima speaks the [OpenSubsonic](https://opensubsonic.netlify.app/) API at `/rest`, so music apps that support Subsonic can play from your library. The Kima web app does not use this API; it is there for other apps.

## Connect a client

1. In Kima, open **Settings > Native Apps**.
2. Type a name for the client, such as "Phone", and choose **Generate Token**.
3. Copy the token. It is shown once.
4. In the client, enter:
   - **Server address:** where you open Kima, such as `http://192.168.1.10:3030`
   - **Username:** your Kima username
   - **Password:** the token

Give each client its own token. The same page lists your tokens, and revoking one disconnects only that client.

Clients that have a separate "API key" field can use the token there. Modern clients may omit `u=`. Older clients that include a username are still supported as long as it belongs to the API-key owner. Do not combine `apiKey=` with a Subsonic `p=`, `t=` or `s=` credential. For clients without separate API-key support, enter the app token as the password and keep the username.

## How sign-in works

Kima accepts, in this order:

1. An API key, sent as `apiKey=` without needing a `u=` username parameter (modern OpenSubsonic authentication); a matching `u=` is accepted for compatibility.
2. The password field (`p=`). Kima first checks whether the value is one of your tokens, then checks it against your account password.

For **newly generated Native Apps keys**, Kima also supports Subsonic's standard salted-token authentication (`t=md5(appKey + salt)`, `s=salt`). This lets Symfonium and Feishin connect with **Legacy Authentication disabled** while keeping your account password out of those apps. New keys retain their SHA-256 digest for regular API-key lookup and an authenticated-encrypted copy for salted-token verification, protected by the existing settings encryption key. No raw key is returned again after creation.

**Important upgrade note:** Keys created before this release remain SHA-256-only. They continue to work in the password field with Legacy Authentication enabled, or with OpenSubsonic `apiKey=`, but cannot use salted-token authentication. Generate a new Native Apps key after upgrading and replace the saved key in each client to disable Legacy Authentication. Revoke the old key when you confirm the new one works.

If you turn on two-factor authentication for your account, your account password stops working in Subsonic clients, because the protocol has no way to ask for a code. Use a token instead.

## Confirmed native-client interoperability

- **Symfonium:** With a new Native Apps key, salted-token sign-in works with **Legacy Authentication off**. As of v1.11.10, native fast synchronization also works with **Compatibility Mode off**, including the quoted-empty `search3` request form.
- **Feishin:** With a new Native Apps key, sign-in and library browsing work with **Legacy Authentication off**.
- For troubleshooting, confirm the client points to your Kima `/rest` server and that you are using a newly generated key. Older keys cannot be used for salted-token login.

## What is supported

- **Browsing:** artists, albums, songs, genres, folders, album lists and random songs.
- **Search:** `search`, `search2` and `search3`.
- **Playing:** streaming, downloads, cover art, lyrics, scrobbling and now playing, and the transcoding endpoints (`hls`, `getTranscodeStream`).
- **Playlists:** list, read, create, update and delete.
- **Queue and bookmarks:** saving and restoring the play queue, by id or by position, and bookmarks.
- **Starring and ratings:** star, unstar, starred lists and `setRating`.
- **Similar songs and artist info:** `getSimilarSongs`, `getSimilarSongs2`, `getTopSongs`, `getArtistInfo` and `getArtistInfo2`.
- **Podcasts:** list, newest episodes, episode details and refresh.
- **Shares:** create, list, update and delete share links.
- **Users:** an administrator can list, create, update and delete users.
- **Library scan:** `startScan` and `getScanStatus`.

OpenSubsonic extensions announced to clients: `apiKeyAuthentication`, `songLyrics`, `indexBasedQueue` and `getPodcastEpisode`.

Not supported: chat, video, captions, the jukebox and internet radio. Listing calls for these answer empty, and calls that would change something answer with an error rather than pretending to succeed.

Artist descriptions and genres that clients see come from Kima's metadata enrichment, not only from file tags.

## Notes

- Album search results leave out albums that were downloaded as discovery suggestions.
- The route code lives in `backend/src/routes/subsonic/`, one file per area. `index.ts` there holds the shared sign-in, rate limit and system endpoints.
