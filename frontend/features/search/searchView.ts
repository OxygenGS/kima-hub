import type { DiscoverResult, FilterTab, SearchResult, SoulseekResult } from "./types";

interface SearchViewInput {
    filterTab: FilterTab;
    libraryResults: SearchResult | null;
    discoverResults: DiscoverResult[];
    similarArtists: DiscoverResult[];
    soulseekResults: SoulseekResult[];
}

/** Which results actually belong to the selected search tab? No extra requests. */
export function selectSearchView({
    filterTab, libraryResults, discoverResults, similarArtists, soulseekResults,
}: SearchViewInput) {
    const showLibrary = filterTab === "all" || filterTab === "library";
    const showDiscover = filterTab === "all" || filterTab === "discover";
    const showP2PTracks = filterTab === "all";

    const libraryArtist = showLibrary ? libraryResults?.artists?.[0] : undefined;
    const discoveryArtist = showDiscover
        ? discoverResults.find((result) => result.type === "music")
        : undefined;

    const hasTracks =
        (showLibrary && (libraryResults?.tracks?.length ?? 0) > 0) ||
        (showP2PTracks && soulseekResults.length > 0);

    const hasLibraryMatches = !!libraryResults && (
        (libraryResults.artists?.length ?? 0) > 0 ||
        (libraryResults.albums?.length ?? 0) > 0 ||
        (libraryResults.tracks?.length ?? 0) > 0 ||
        (libraryResults.podcasts?.length ?? 0) > 0 ||
        (libraryResults.audiobooks?.length ?? 0) > 0 ||
        (libraryResults.episodes?.length ?? 0) > 0
    );

    const hasResults =
        (showLibrary && hasLibraryMatches) ||
        (showDiscover && (discoverResults.length > 0 || similarArtists.length > 0)) ||
        (showP2PTracks && soulseekResults.length > 0);

    return {
        showLibrary,
        showDiscover,
        libraryArtist,
        discoveryArtist,
        hasTopResult: !!(libraryArtist || discoveryArtist),
        hasTracks,
        hasResults,
    };
}

interface SearchLoadingInput {
    isLibrarySearching: boolean;
    isDiscoverSearching: boolean;
    isSoulseekSearching: boolean;
    isSoulseekPolling: boolean;
}

/** A background search in another tab must not keep this tab in loading state. */
export function isSearchViewLoading(filterTab: FilterTab, loading: SearchLoadingInput) {
    return (
        ((filterTab === "all" || filterTab === "library") && loading.isLibrarySearching) ||
        ((filterTab === "all" || filterTab === "discover") && loading.isDiscoverSearching) ||
        ((filterTab === "all" || filterTab === "soulseek") &&
            (loading.isSoulseekSearching || loading.isSoulseekPolling))
    );
}
