/**
 * What each release tells and asks the user; edit this when cutting a release. The window opens on the release's
 * `note` (the maintainer's own words), then lists every item by its one-line `summary`; each item opens on its own page.
 * A `note` item informs, an `action` offers something to run, a `choice` asks and defaults to false. Dismissing
 * records untouched choices at their default (`decidedBy: DISMISSED`), so silence is never consent.
 */

/** An in-app page an item points to. */
interface ReleaseLink {
    label: string;
    href: string;
}

interface ItemBase {
    /** Stable id, so copy can change without losing anything. */
    key: string;
    title: string;
    /** One line in the window's list. */
    summary: string;
    /** The item's own page. Blank lines separate paragraphs. */
    body: string;
    links?: ReleaseLink[];
}

export type ReleaseItem =
    | (ItemBase & { kind: "note" })
    | (ItemBase & {
          kind: "action";
          /** The label on the button that runs it. */
          cta: string;
          /** Something the window runs itself, behind a confirm. */
          run?: "wipeEnrichment";
          confirmTitle?: string;
          confirmMessage?: string;
          confirmLabel?: string;
          /**
           * What closing the window without acting means for this item, said in the footer. Set it when the item
           * asks for a decision.
           */
          ifClosed?: string;
          /**
           * Show only to users it applies to (the server filters in `forUser`): "savedMoodMix" is a mix
           * under a current mood, "retiredMoodMix" one under a mood that no longer exists, "admin" an admin.
           */
          requires?: "savedMoodMix" | "retiredMoodMix" | "admin";
          /** Show only when the library holds enrichment from before this release's date (an upgrade, not a fresh install). */
          olderLibraryOnly?: boolean;
      })
    | (ItemBase & {
          kind: "choice";
          /**
           * Always false. Present as a field rather than a constant so the shape survives a future
           * opt-out-by-default choice, and so a reader can see what dismissing the window will record.
           */
          defaultValue: false;
          /** What actually leaves the machine. Say it exactly. */
          discloses?: string;
          /** Only shown to admins when "admin": the setting it writes is system-wide. */
          requires?: "admin";
      });

export interface Release {
    version: string;
    /** The window's heading. A name, not a summary. */
    title: string;
    /** One sentence, for clients that show no note. */
    summary: string;
    date: string;
    /** A note from the person who made the release, shown first. */
    note?: { from: string; body: string };
    items: ReleaseItem[];
}

/**
 * The GPU choice's key. The release window only records the decision;
 * the route applies it through the same service the Settings toggle uses.
 */
export const GPU_CHOICE_KEY = "gpu.accelerate";

const WIPE_MESSAGE =
    "Clears what Kima worked out about your music: which recording each track is, audio analysis, vibe data, the " +
    "vibe map, artist bios and similar artists. Then it works it all out again with the new engine. Your music, playlists, plays, likes and edits stay. " +
    "Takes a few hours on a large library; the vibe map is back when it finishes.";

const KEVIN_1_11 = [
    "Hey y'all.",
    "I know updates have been slow. If you've stuck around, thank you. If this is your first install, great timing.",
    "I've had a series of unfortunate events since Kima launched, oddly. Painful family passings in short order, " +
        "animal emergencies keeping us at the vet overnight, and of course the atrocity that is the American corporate " +
        "grind. I also have ADHD, so I hyperfocus on shit and realize later I've been neglecting the big boy. " +
        "That's done now. My focus is Kima: the mobile application and, most importantly, the vibe engine.",
    "Through all of that I've been building Kima v2, and this enrichment engine rebuild is phase 1. This update " +
        "needs a complete wipe and rerun of the engine. Only the engine's data gets wiped; your music, playlists, " +
        "plays and likes stay exactly as they are. I think you'll be happy you did.",
    "The plan is to modularize Kima with a store. The base app stays pure music + vibes. Everything else " +
        "\u2014 audiobooks, podcasts, future additions \u2014 comes from the store, and you configure what your Kima " +
        "includes. People have asked me to let them strip audiobooks out; they'll be able to. And I want room for " +
        "you to publish your own modules for anyone to pull from.",
    "If you've stuck around, if you yell at the app in frustration (I do) but still hang in \u2014 I " +
        "love you. Thanks again, and I hope this update makes y'all feel good. We need it in this world.",
].join("\n\n");

export const RELEASES: Release[] = [
    // release-candidate:1.16.1
    {
        "version": "1.16.1",
        "title": "Kima Hub 1.16.1 \u2014 Soulseek Download Fix",
        "summary": "Fix Soulseek permission-denied downloads in the all-in-one Docker installation while preserving music-library permissions.",
        "date": "2026-10-30",
        "items": [
            {
                "kind": "note",
                "key": "fork.1161.soulseek",
                "title": "Soulseek downloads work with the non-root backend",
                "summary": "Send P2P downloads to a dedicated, narrowly writable import folder.",
                "body": "The all-in-one backend runs as an unprivileged user. In earlier builds, a Soulseek download tried to create artist and album directories directly under the music mount, which could fail with EACCES: permission denied. Both manual P2P downloads and automatic Soulseek acquisition now write under Singles/Kima Downloads inside the configured music library. During startup the container prepares only that dedicated directory for the backend user, without changing other music files or directory permissions. Downloaded tracks are then eligible for the existing library scan.",
                "links": [
                    {
                        "label": "Open music library",
                        "href": "/collection?tab=tracks"
                    }
                ]
            },
            {
                "kind": "note",
                "key": "fork.1161.permissions",
                "title": "Keep the rest of the music library protected",
                "summary": "No broad write permissions, new root-running backend, or automatic changes to existing music folders.",
                "body": "An existing Soulseek import directory is never forcibly re-owned and no recursive chmod or chown is performed on the music collection. If the /music mount is read-only, root-squashed, or denies creation of the new import folder, downloads will still require limited host-side access to /music/Singles/Kima Downloads; the app continues to start and reports an actionable permission error. Input filenames and directory components are normalized to prevent path traversal. Existing audio files and previous downloads are not moved. Playback, modern Symfonium and Feishin authentication and the Artwork Recovery controls are unchanged. No database schema migration is added by this hotfix. Back up the full persistent /data volume before updating. Native image vulnerabilities still require explicit security review before publication.",
                "links": [
                    {
                        "label": "Open settings",
                        "href": "/settings"
                    }
                ]
            }
        ]
    },
    // release-candidate:1.16.0
    {
        "version": "1.16.0",
        "title": "Kima Hub 1.16.0 \u2014 Artwork Recovery",
        "summary": "Find more local covers and repair missing album and artist artwork from Settings without rescanning your music library.",
        "date": "2026-10-30",
        "items": [
            {
                "kind": "note",
                "key": "fork.1160.folder",
                "title": "More album artwork from your music folders",
                "summary": "Recognize embedded and nearby cover, folder, front and album pictures when scanning tracks.",
                "body": "When album artwork is missing from an audio file, Kima now checks nearby image files named cover, folder, front or album (JPG, JPEG, PNG or WebP) before using external artwork providers. Embedded pictures remain preferred; recovered folder pictures are decoded and stored as real JPEG files in the artwork cache.\n\nThis is a safe fallback when a track is processed. Previously indexed unchanged tracks are still skipped by the normal scanner; use the separate repair control for existing missing images.",
                "links": [
                    {
                        "label": "Browse albums",
                        "href": "/collection?tab=albums"
                    }
                ]
            },
            {
                "kind": "note",
                "key": "fork.1160.album",
                "title": "Repair covers on already-indexed albums",
                "summary": "Use Settings to repair missing covers in bounded rounds without a full music scan.",
                "body": "Admins can open Settings > Artwork and start an album-cover repair. The operation checks at most 200 albums per round and can continue with another round when more remain. It checks missing or empty covers and existing native cover references whose cached files may be missing, then tries embedded images and local album artwork before asking the existing external providers (Deezer, Cover Art Archive and Fanart.tv).\n\nValid cached images, existing external cover URLs and user-selected artwork are preserved. The music files, track metadata and playlists are not rewritten. Progress reports recovered local and online covers, skipped albums and failures. Not every album is guaranteed a cover; sources may have none.",
                "links": [
                    {
                        "label": "Open artwork settings",
                        "href": "/settings"
                    }
                ]
            },
            {
                "kind": "note",
                "key": "fork.1160.artist",
                "title": "Recover missing artist portraits",
                "summary": "Restore local artist photos or ask trusted artwork providers, while preserving manual choices.",
                "body": "A separate admin control in Settings > Artwork repairs up to 100 existing artists per round. Kima looks for artist.jpg, artist.jpeg, artist.png and artist.webp near their music, or a folder picture only in a directory matching the artist's name. This prevents an album's folder.jpg from being mistaken for an artist portrait.\n\nIf no local portrait is found, Kima uses its existing Fanart.tv and Deezer lookup. Good current images, manually selected artist photos and existing external URLs are not replaced. Results and progress are shown in Settings; additional batches are available when more artists remain.",
                "links": [
                    {
                        "label": "Browse artists",
                        "href": "/collection?tab=artists"
                    },
                    {
                        "label": "Open artwork settings",
                        "href": "/settings"
                    }
                ]
            },
            {
                "kind": "note",
                "key": "fork.1160.safety",
                "title": "Artwork recovery without a database migration",
                "summary": "Keep playback and connected clients unchanged; review backups and native-image security findings.",
                "body": "The artwork recovery paths verify music-root containment and reject unsafe local image candidates; nearby pictures have size limits and are normalized before being placed in local caches. Both repair controls are admin-only, bounded and use conditional database writes so an image chosen during a repair is not overwritten. Progress and batch position are held in the API process and reset when it restarts; it is safe to start a new manual pass.\n\nThere is no new database schema migration, audio-engine change, authentication change or change to modern Symfonium and Feishin connections. Back up the complete persistent data volume before upgrading and verify restore separately. If upgrading from a version before v1.14.0, consult the earlier database migration notes. Existing native-image security advisories require review; passing tests does not mean that images have zero vulnerabilities.",
                "links": [
                    {
                        "label": "Open settings",
                        "href": "/settings"
                    }
                ]
            }
        ]
    },
    // release-candidate:1.15.0
    {
        "version": "1.15.0",
        "title": "Kima Hub 1.15.0 \u2014 Faster Artist Navigation & Clearer Browsing",
        "summary": "Local-first artist navigation, more consistent search tabs and clearer music browsing without changing playback or native clients.",
        "date": "2026-10-29",
        "items": [
            {
                "kind": "note",
                "key": "fork.1150.loading",
                "title": "Smoother page transitions",
                "summary": "Album, collection and search routes keep their layout while content loads.",
                "body": "New page-shaped placeholders retain the album hero and track rows, collection masthead and music grid, and search box and results layout during navigation. Instead of replacing the entire view with one generic loader, Kima shows the structure of the destination while data arrives.\n\nThese changes target perceived responsiveness and layout stability; no specific speed improvement is claimed.",
                "links": [
                    {
                        "label": "Browse your collection",
                        "href": "/collection"
                    }
                ]
            },
            {
                "kind": "note",
                "key": "fork.1150.search",
                "title": "Search tabs that respect their source",
                "summary": "Library, Discover and P2P views no longer mix unrelated results or loading states.",
                "body": "The Library filter shows local music, while Discover shows its own artist results. Empty track headings and irrelevant top matches are hidden, and a background P2P lookup no longer forces a completed Library or Discover view to keep showing a spinner. Accessible selected-filter states and the Dutch artist label are included.\n\nThe existing search services and permissions remain in place; this update corrects frontend presentation, not search storage or authentication.",
                "links": [
                    {
                        "label": "Open search",
                        "href": "/search"
                    }
                ]
            },
            {
                "kind": "note",
                "key": "fork.1150.artist",
                "title": "Artist pages show local details first",
                "summary": "Artist-card intent preloads the database overview, with clear progress for optional enrichment.",
                "body": "Moving the pointer onto or focusing a local artist card now warms the smaller database-only artist overview, instead of starting full external metadata enrichment before the page is opened. The overview and complete result have separate cache keys, so already saved albums can appear while additional artist details are requested.\n\nA visible status explains that extra information is loading. If optional enrichment fails, a retry control is available without hiding the existing local information. Exact loading-time gains depend on cache, network and provider availability and have not been measured.",
                "links": [
                    {
                        "label": "Browse artists",
                        "href": "/collection?tab=artists"
                    }
                ]
            },
            {
                "kind": "note",
                "key": "fork.1150.sections",
                "title": "Jump straight to artist sections",
                "summary": "Profiles offer direct links to the populated biography, popular tracks and album sections.",
                "body": "A compact, horizontally scrollable navigation beneath the artist header links only to sections that exist on that profile: About, Popular, Discography, Available Albums and Fans Also Like. Links work with keyboard and TV focus and point to the correct section even when an artist only has singles or EPs.\n\nThe navigation is omitted when there is fewer than two populated sections, avoiding empty or misleading destinations.",
                "links": [
                    {
                        "label": "View artist collection",
                        "href": "/collection?tab=artists"
                    }
                ]
            },
            {
                "kind": "note",
                "key": "fork.1150.upgrade",
                "title": "Compatibility and safe updates",
                "summary": "Playback and client authentication stay unchanged; back up the persistent data volume before any upgrade.",
                "body": "This release's changes are frontend-only: no new database migration, playback engine replacement, permission model change or new native-client authentication requirement is introduced by the v1.15 update. Existing modern Symfonium and Feishin connections remain supported.\n\nBefore changing a running installation, back up the complete persistent /data volume and verify an independent restore. If updating from a release older than v1.14.0, earlier database migrations may still apply. A rollback must restore the pre-upgrade data backup; reverting only the container image is not a safe database rollback. Security advisories still require review before the stable image is approved.",
                "links": [
                    {
                        "label": "Open settings",
                        "href": "/settings"
                    }
                ]
            }
        ]
    },
    // release-candidate:1.14.0
    {
        "version": "1.14.0",
        "title": "Kima Hub 1.14.0 \u2014 Smoother Artwork & Smarter Search",
        "summary": "Less blocking image work and more forgiving local music search, with familiar playback and clients.",
        "date": "2026-10-29",
        "items": [
            {
                "kind": "note",
                "key": "fork.1140.artwork",
                "title": "Artwork without blocking browsing",
                "summary": "Local artwork requests share work and no longer perform synchronous file reads and writes.",
                "body": "Cached local cover images are checked using asynchronous file operations. When several screens request the same cold image size, Kima shares one resize instead of duplicating the work; different cold resizes have a small concurrency limit to reduce contention with interactive requests. Resized images are written atomically so incomplete cache files are not served.\n\nExisting path containment protections are maintained, and Kima falls back to the original image if a resize fails. This improves the code's ability to stay responsive under load; exact speed gains depend on storage and library size and have not been measured on your installation.",
                "links": [
                    {
                        "label": "Browse albums",
                        "href": "/collection?tab=albums"
                    }
                ]
            },
            {
                "kind": "note",
                "key": "fork.1140.search",
                "title": "More forgiving music search",
                "summary": "Accented names, exact matches and small typos receive more reliable local search results.",
                "body": "Local searches now preserve Unicode letters and combining marks instead of stripping them out of PostgreSQL search terms. Exact artist, album and song names rank ahead of broader full-text matches. If full-text and ordinary substring search return nothing, PostgreSQL trigram similarity can suggest likely matches for mistyped names.\n\nThe typo fallback is deliberately limited to queries of at least three characters and applies only to existing local library entities; it does not replace external discovery or return tracks marked as missing. Search history and existing caches remain in place.",
                "links": [
                    {
                        "label": "Open music library",
                        "href": "/collection"
                    }
                ]
            },
            {
                "kind": "note",
                "key": "fork.1140.upgrade",
                "title": "Safe, additive database upgrade",
                "summary": "Three searchable text indexes are added; audio playback and client authentication stay unchanged.",
                "body": "The upgrade enables the built-in PostgreSQL pg_trgm extension and creates additional GIN indexes on artist names, album titles and track titles. No music rows or existing search-vector triggers are rewritten. Building indexes can temporarily require extra disk space, CPU and database I/O, particularly with a large library.\n\nBack up the complete persistent /data volume before updating. Returning to a previous version requires restoring an independent backup made before this database migration. The audio engine, existing music analysis, permissions, and modern Symfonium/Feishin authentication are unchanged. Existing image security advisories still require review.",
                "links": [
                    {
                        "label": "Open settings",
                        "href": "/settings"
                    }
                ]
            }
        ]
    },
    // release-candidate:1.13.1
    {
        "version": "1.13.1",
        "title": "Kima Hub 1.13.1 \u2014 Faster Artist Pages",
        "summary": "Open saved artist information and local albums without waiting for external metadata providers.",
        "date": "2026-10-29",
        "items": [
            {
                "kind": "note",
                "key": "fork.1131.local-first",
                "title": "Your local albums first",
                "summary": "First-time artist visits no longer need to wait for external enrichment before showing local music.",
                "body": "Artist pages now request a database-only overview separately from the complete enriched details. Saved artist information, artwork and playable local albums can appear as soon as that local response arrives. External discography, popular tracks and recommendations fill in when their own request finishes.\n\nThis removes external-provider waiting from the initial local-library view. It does not make remote services faster or promise a fixed loading time. Artists found only through discovery still require external information.",
                "links": [
                    {
                        "label": "Browse artists",
                        "href": "/collection?tab=artists"
                    }
                ]
            },
            {
                "kind": "note",
                "key": "fork.1131.continuity",
                "title": "Keep browsing when providers are slow",
                "summary": "Local artist data remains available when the optional full-detail request fails.",
                "body": "The local overview has its own cache entry and cannot replace the complete artist cache. Already cached full details retain the existing fast path, and completed downloads refresh the artist data. Play All, Shuffle, album navigation and existing user permissions remain in place.\n\nThis maintenance update adds no database migration, changes no audio engine or native-client authentication, and does not reset music analysis.",
                "links": [
                    {
                        "label": "Open collection",
                        "href": "/collection"
                    }
                ]
            }
        ]
    },
    // release-candidate:1.13.0
    {
        "version": "1.13.0",
        "title": "Kima Hub 1.13.0 \u2014 A New Look for Your Music",
        "summary": "A redesigned home, music pages, players and queue, with the same music library and familiar controls.",
        "date": "2026-10-28",
        "items": [
            {
                "kind": "note",
                "key": "fork.1130.home",
                "title": "A new home for your collection",
                "summary": "A new welcome panel, grouped navigation and refreshed music cards.",
                "body": "The home screen puts artwork from your own collection up front and offers direct routes to albums, tracks, discovery and radio. Desktop navigation is grouped with icons and clear active-page markers. Music cards use a consistent rounded surface and your selected accent color. Empty libraries show an honest empty state, not invented listening statistics.",
                "links": [
                    {
                        "label": "Open Home",
                        "href": "/"
                    },
                    {
                        "label": "Open collection",
                        "href": "/collection"
                    }
                ]
            },
            {
                "kind": "note",
                "key": "fork.1130.details",
                "title": "Music detail pages, redesigned",
                "summary": "Larger artwork, complete titles and clearly labelled actions on artist and album pages.",
                "body": "Artist and album headers now give artwork and metadata more space, with contained backgrounds and a direct route back to the collection. Long titles wrap instead of disappearing after a few lines. Play, Shuffle, radio and playlist actions have visible labels. Layouts and loading placeholders adapt to the space available, including an open side panel.",
                "links": [
                    {
                        "label": "Browse albums",
                        "href": "/collection?tab=albums"
                    }
                ]
            },
            {
                "kind": "note",
                "key": "fork.1130.players",
                "title": "A consistent player on every screen",
                "summary": "A redesigned desktop dock, mobile mini player and full-screen listening view.",
                "body": "The desktop dock separates music information, playback and extra controls. The mobile player keeps minimize and dismiss gestures and adds explicit options. The full-screen player supports larger artwork, wrapping titles, inline lyrics and small landscape screens. Seek, volume, sleep timer, shuffle, repeat and Vibe continue to use the existing playback system. Clear horizontal gestures are required; vertical scrolling does not skip music."
            },
            {
                "kind": "note",
                "key": "fork.1130.queue",
                "title": "See what comes next",
                "summary": "A selected-track panel, clearer queue sections and visible editing controls.",
                "body": "The queue separates the selected track, upcoming music and listening history. Move, play and remove controls remain visible and stack below metadata on narrow screens. Reordering stays within upcoming positions, including repeated copies of the same track. Clearing the queue still requires confirmation.",
                "links": [
                    {
                        "label": "Open queue",
                        "href": "/queue"
                    }
                ]
            },
            {
                "kind": "note",
                "key": "fork.1130.continuity",
                "title": "Your library and settings stay yours",
                "summary": "English and Dutch copy, keyboard access and existing music-client support are preserved.",
                "body": "This is a presentation update, not a new audio engine or a new integration. Existing permissions, branding, playlists and modern Symfonium/Feishin authentication remain in place. The release notes introduce no new consent choices and do not request an enrichment reset. Back up the complete persistent data volume before any upgrade; a rollback needs an independent pre-upgrade backup."
            }
        ]
    },
    {
        version: "1.12.1",
        title: "Kima Hub 1.12.1 — Release Notes Update",
        summary: "The in-app release history now includes Project Turbo + UI 2.0 and the latest fork improvements.",
        date: "2026-10-28",
        items: [
            {
                kind: "note",
                key: "fork.1121.release-history",
                title: "Release history, brought up to date",
                summary: "The What's New window now includes the missing 1.12.0 release notes.",
                body: "The 1.12.0 Docker release shipped with the upstream 1.11 release catalog, so this window continued to show older notes. This patch adds the OxygenGS 1.12.0 notes to the in-app history. It does not change your music, settings, or permissions.\n\nOpen the version label beside the logo to read the latest notes again.",
            },
        ],
    },
    {
        version: "1.12.0",
        title: "Kima Hub 1.12.0 — Project Turbo + UI 2.0",
        summary: "Faster artist and album browsing, less waiting, and smoother controls on desktop and mobile.",
        date: "2026-10-28",
        items: [
            {
                kind: "note",
                key: "fork.1120.turbo",
                title: "Project Turbo: faster music browsing",
                summary: "Reuse cached artist and album information instead of requesting it again.",
                body: "Artist pages load independent detail requests concurrently and reuse already fetched information. Album navigation and playback share cached detail data, while Play All and Shuffle reuse available album tracks rather than loading entire discographies again.\n\nLibrary pages prefetch on browsing intent, and missing offscreen artwork waits until it is needed. No specific speed-up percentage is claimed.",
                links: [{ label: "Browse your collection", href: "/collection" }],
            },
            {
                kind: "note",
                key: "fork.1120.ui",
                title: "UI 2.0: a smoother experience",
                summary: "Stable loading skeletons, refined artist and album pages, and improved mobile controls.",
                body: "Collection loading indicators now use layout-stable skeletons. Artist and album headers adapt better to narrow screens. Track rows, player actions, artwork, keyboard focus and touch targets have received usability and accessibility refinements.",
                links: [{ label: "Open your collection", href: "/collection" }],
            },
            {
                kind: "note",
                key: "fork.1120.clients",
                title: "Your native music apps still work",
                summary: "Existing Symfonium and Feishin support is preserved without legacy sign-in.",
                body: "The OxygenGS fork retains the earlier Native Apps improvements introduced in 1.11.9 and 1.11.10: newly generated API keys work with Symfonium and Feishin without Legacy Authentication. Symfonium library sync works without Compatibility Mode.\n\nIf you still use a key issued before 1.11.9, generate a new one in Settings → Native Apps. This is not a newly introduced integration.",
                links: [{ label: "Open Native Apps settings", href: "/settings#subsonic" }],
            },
            {
                kind: "note",
                key: "fork.1120.security",
                title: "Reliability and security updates",
                summary: "Updated CLAP worker dependencies and stronger native Docker release verification.",
                body: "The CLAP Python worker now uses patched BullMQ and msgpack dependencies, with a Redis job-processing integration test. Native AMD64 and ARM64 builds are checked by vulnerability and secret scans before publication. Existing image dependency advisories remain documented; passing these checks does not mean zero security risk.",
            },
        ],
    },
    {
        version: "1.11.0",
        title: "Kima 1.11",
        summary:
            "Songs match on sound, feel and genre, there's a new vibe map, the enrichment engine is rebuilt, and Last.fm is gone.",
        date: "2026-10-12",
        note: { from: "Kevin", body: KEVIN_1_11 },
        items: [
            {
                kind: "action",
                key: "engine.wipe",
                title: "Wipe and re-run enrichment",
                summary: "The engine is new, so it needs one fresh run. Only its own data is wiped.",
                body:
                    "Everything Kima worked out about your music came from the old engine. Wiping clears it (audio " +
                    "analysis, vibe data, the vibe map, artist bios and similar artists) and runs your whole library " +
                    "through the new one.\n\n" +
                    "Your music, playlists, plays, likes and edits stay. It runs in the background and takes a few " +
                    "hours on a big library. The vibe map comes back when it's done.",
                cta: "Wipe and re-run",
                run: "wipeEnrichment",
                confirmTitle: "Wipe and re-run enrichment?",
                confirmMessage: WIPE_MESSAGE,
                confirmLabel: "Wipe and re-run",
                ifClosed: "If you close now, nothing is wiped. It's also in Settings, under Library Enrichment.",
                links: [{ label: "See progress in Settings", href: "/settings#cache" }],
                requires: "admin",
                olderLibraryOnly: true,
            },
            {
                kind: "note",
                key: "vibe.engine",
                title: "The new vibe engine",
                summary: "Songs now match on how they sound, how they feel, and their artist's genres.",
                body:
                    "Kima used to match songs on sound alone. Now every match weighs three things: how the song " +
                    "sounds, how it feels (calm or intense, bright or dark, compared with the rest of your library), " +
                    "and its artist's genres, which only count between different artists.\n\n" +
                    "Similar tracks, Song Path, Blend and recommendations all use it, and no list has more than 2 " +
                    "songs from one album or 4 from one artist. Searching by words still matches on sound, because a " +
                    "sentence has no feel or genre.\n\n" +
                    "Every weight was tested against how people judge music before it went in.",
                links: [{ label: "Open the vibe map", href: "/vibe" }],
            },
            {
                kind: "note",
                key: "vibe.map",
                title: "The new vibe map",
                summary: "Your library laid out by the vibe engine. It's yours, and it doesn't shuffle around.",
                body:
                    "Every song sits where the vibe engine puts it, so songs that match sit together. A very faint glow " +
                    "sits behind the whole map, and a few far-off stars give it depth.\n\n" +
                    "Your map is laid out once, after your library has been through enrichment. New songs are placed " +
                    "among the others and keep their place; a wipe and re-run lays the whole map out fresh.",
                links: [{ label: "Open the vibe map", href: "/vibe" }],
            },
            {
                kind: "note",
                key: "engine.rebuilt",
                title: "A rebuilt enrichment engine",
                summary: "Better identification, no made-up numbers, and a lighter analyzer.",
                body:
                    "Songs are identified by their tags and file names first, checked against the music you actually " +
                    "own. Audio fingerprinting only handles what that can't settle.\n\n" +
                    "The analyzers only report what they actually measured. Anything they couldn't work out stays " +
                    "empty instead of being guessed.\n\n" +
                    "Everything runs on ONNX Runtime now: the sound vectors and the audio analysis both. No PyTorch " +
                    "anywhere. It's lighter, and a switch in Settings moves the heavy work onto an NVIDIA card when " +
                    "Kima can see one. The whole engine builds and runs natively on x86 and ARM, so Apple-silicon " +
                    "Macs get the full analysis, not a reduced one.",
            },
            {
                kind: "note",
                key: "moods.fixed",
                title: "Moods, fixed",
                summary: "Some moods were read backwards. That's fixed, and there are five moods now.",
                body:
                    "Calm songs could end up in Intense and sad ones in Upbeat. That's fixed.\n\n" +
                    "There are five moods now: Upbeat, Melancholic, Calm, Intense and Energetic. Acoustic and " +
                    "electronic aren't moods any more; they measured the same thing twice and drowned out the rest. " +
                    "Energy no longer bunches up at the top, where about a third of a library used to read as " +
                    "maximum energy.",
            },
            {
                kind: "action",
                key: "moods.mixes",
                title: "Your mood mix",
                summary: "It was picked from the old moods. Rebuild it, keep it, or save it as a playlist.",
                body:
                    "Your saved mood mix was picked using the old, wrong moods. Rebuild clears it so you can make a " +
                    "fresh one in the Mood Mixer on the home page. Keep leaves it as it is.\n\n" +
                    "Want its songs either way? Save it as a playlist first.",
                cta: "Rebuild",
                ifClosed: "If you close now, your mood mix stays as it is.",
                requires: "savedMoodMix",
            },
            {
                kind: "action",
                key: "moods.mixes.retired",
                title: "Your old mood mix",
                summary: "Its mood no longer exists. Save it as a playlist or remove it.",
                body:
                    "Your saved mood mix was made under a mood that's gone, so Kima can't show it any more. Its songs " +
                    "are all still in your library.\n\n" +
                    "Save it as a playlist to keep them together, or remove it. Nothing is deleted until you pick.",
                cta: "Save as playlist",
                ifClosed: "If you close now, nothing is deleted, and you'll be asked again next time.",
                requires: "retiredMoodMix",
            },
            {
                kind: "note",
                key: "stats.page",
                title: "Stats",
                summary: "See what you actually listen to. Play counts are in the player too.",
                body:
                    "The Stats page shows what you replay most, which artists make up most of your listening, how " +
                    "much of your library you've never played, over the last 30 days, the last 12 months or all time.\n\n" +
                    "The full player shows how many times you've played the current song.",
                links: [{ label: "Open Stats", href: "/stats" }],
            },
            {
                kind: "note",
                key: "lastfm.gone",
                title: "No accounts, no keys",
                summary: "Last.fm is gone. Nothing to sign up for or set up.",
                body:
                    "Similar artists come from ListenBrainz, with Deezer as a backup. Names come from MusicBrainz, " +
                    "artist bios from Wikidata, and album art from Deezer and the Cover Art Archive. None of it needs " +
                    "an account or an API key.\n\n" +
                    "ListenBrainz is recommended for popularity, never required. If you sign up there and turn on " +
                    "scrobbling, Kima switches your popularity to your ListenBrainz data automatically. Until then, " +
                    "Deezer keeps filling it in.",
            },
            {
                kind: "choice",
                key: GPU_CHOICE_KEY,
                title: "Use an NVIDIA graphics card",
                summary: "Optional. Run the heaviest job on your graphics card; off unless you turn it on.",
                body:
                    "Making vibe data is the heaviest job Kima runs. If your server runs Linux and has an NVIDIA " +
                    "card that Kima can see, that job can run on the card: about 2 to 3 times faster with your " +
                    "worker slider up, and your processor stays free for everything else.\n\n" +
                    "It's safe to turn on partway through a run. You can change it any time in Settings, under " +
                    "Library Enrichment.",
                discloses:
                    "Kima downloads twelve pinned packages (about 2 GB) from PyPI, checks every file against a fixed " +
                    "fingerprint, and installs them in your data folder, where they take about 3.4 GB. Nothing about " +
                    "your library leaves your server.",
                defaultValue: false,
                requires: "admin",
            },
        ],
    },
    {
        version: "1.10.1",
        title: "What counts as a play",
        summary:
            "Play counts now track what you've listened to, not what started loading. There's a one-off cleanup for the counts you've already got.",
        date: "2026-08-25",
        items: [
            {
                kind: "note",
                key: "plays.rule",
                title: "A play means you listened",
                summary: "A song counts once you've heard half of it, or 4 minutes of it.",
                body:
                    "A play used to be logged the moment a song started loading, so skipping through an album counted " +
                    "every song. Now a song counts once you've heard half of it or 4 minutes of it, whichever is " +
                    "less, the same rule Last.fm and ListenBrainz use. Songs 30 seconds or shorter never count.",
            },
            {
                kind: "note",
                key: "plays.repair",
                title: "Clean up old play counts",
                summary: "Find the skips that were counted as plays, and remove them.",
                body:
                    "Your old counts still include those skips. A tool on the Stats page finds plays that were followed " +
                    "seconds later by another play, shows you each one, and lets you remove them or keep them.\n\n" +
                    "It only removes what it can show was a skip, and it never touches your music files.",
                links: [{ label: "Open the cleanup", href: "/stats#false-starts" }],
            },
        ],
    },
];

/** The release a given version belongs to, if the window has anything to say. */
export function findRelease(version: string): Release | undefined {
    return RELEASES.find((r) => r.version === version);
}

/** Every choice a release asks, flattened — used to resolve a dismissal. */
export function choicesIn(
    release: Release,
): Array<{ key: string; defaultValue: boolean; requires?: "admin" }> {
    return release.items
        .filter((i): i is Extract<ReleaseItem, { kind: "choice" }> => i.kind === "choice")
        .map((i) => ({ key: i.key, defaultValue: i.defaultValue, requires: i.requires }));
}
