import { describe, expect, it } from "vitest";
import { isSearchViewLoading, selectSearchView } from "./searchView";
import type { DiscoverResult, SearchResult, SoulseekResult } from "./types";

const library: SearchResult = {
    artists: [{ id: "local-artist", name: "Library Artist" }],
    albums: [{ id: "local-album", title: "Local Album" }],
    tracks: [{
        id: "local-track", title: "Local Track", duration: 180,
        album: {
            id: "local-album", title: "Local Album",
            artist: { id: "local-artist", name: "Library Artist" },
        },
    }],
};

const discovered: DiscoverResult[] = [
    { type: "music", name: "New Artist", mbid: "external-artist" },
];

const p2p: SoulseekResult[] = [{
    username: "peer", path: "music/track.flac", filename: "track.flac",
    size: 1024, bitrate: 1000, format: "flac",
}];

function view(filterTab: "all" | "library" | "discover" | "soulseek") {
    return selectSearchView({
        filterTab, libraryResults: library, discoverResults: discovered,
        similarArtists: [], soulseekResults: p2p,
    });
}

describe("search source filtering", () => {
    it("prefers the local top result and includes playable tracks in All", () => {
        expect(view("all")).toMatchObject({
            showLibrary: true, showDiscover: true, libraryArtist: library.artists?.[0],
            discoveryArtist: discovered[0], hasTopResult: true,
            hasTracks: true, hasResults: true,
        });
    });

    it("never leaks discovery results or P2P tracks into the Library tab", () => {
        expect(view("library")).toMatchObject({
            showLibrary: true, showDiscover: false,
            libraryArtist: library.artists?.[0],
            discoveryArtist: undefined, hasTracks: true, hasResults: true,
        });

        const onlyRemote = selectSearchView({
            filterTab: "library", libraryResults: null,
            discoverResults: discovered, similarArtists: [], soulseekResults: p2p,
        });
        expect(onlyRemote.hasTopResult).toBe(false);
        expect(onlyRemote.hasTracks).toBe(false);
        expect(onlyRemote.hasResults).toBe(false);
    });

    it("shows only discovery artists and never renders an empty Tracks section in Discover", () => {
        expect(view("discover")).toMatchObject({
            showLibrary: false, showDiscover: true,
            libraryArtist: undefined, discoveryArtist: discovered[0],
            hasTopResult: true, hasTracks: false, hasResults: true,
        });

        const localOnly = selectSearchView({
            filterTab: "discover", libraryResults: library,
            discoverResults: [], similarArtists: [], soulseekResults: p2p,
        });
        expect(localOnly.hasTopResult).toBe(false);
        expect(localOnly.hasTracks).toBe(false);
        expect(localOnly.hasResults).toBe(false);
    });

    it("leaves the P2P tab to its dedicated browser, even with local matches", () => {
        expect(view("soulseek")).toMatchObject({
            showLibrary: false, showDiscover: false,
            libraryArtist: undefined, discoveryArtist: undefined,
            hasTopResult: false, hasTracks: false, hasResults: false,
        });
    });

    it("does not show a no-results message for album-only local matches", () => {
        const albumOnly = selectSearchView({
            filterTab: "library", libraryResults: { albums: library.albums },
            discoverResults: [], similarArtists: [], soulseekResults: [],
        });
        expect(albumOnly.hasResults).toBe(true);
        expect(albumOnly.hasTracks).toBe(false);
    });
});

describe("search loading source selection", () => {
    const loading = {
        isLibrarySearching: false,
        isDiscoverSearching: false,
        isSoulseekSearching: true,
        isSoulseekPolling: false,
    };

    it("does not make Library or Discover wait on P2P", () => {
        expect(isSearchViewLoading("library", loading)).toBe(false);
        expect(isSearchViewLoading("discover", loading)).toBe(false);
        expect(isSearchViewLoading("all", loading)).toBe(true);
        expect(isSearchViewLoading("soulseek", loading)).toBe(true);
    });

    it("waits for the selected source only", () => {
        expect(isSearchViewLoading("library", { ...loading, isLibrarySearching: true })).toBe(true);
        expect(isSearchViewLoading("discover", { ...loading, isDiscoverSearching: true })).toBe(true);
        expect(isSearchViewLoading("soulseek", {
            ...loading, isSoulseekSearching: false, isSoulseekPolling: true,
        })).toBe(true);
    });
});

describe("unrendered discovery categories", () => {
    it("shows the empty state instead of a blank Discover page for podcast-only results", () => {
        const result = selectSearchView({
            filterTab: "discover", libraryResults: null,
            discoverResults: [{ type: "podcast", name: "Podcast result" }],
            similarArtists: [], soulseekResults: [],
        });
        expect(result.hasTopResult).toBe(false);
        expect(result.hasTracks).toBe(false);
        expect(result.hasResults).toBe(false);
    });
});
