/** Radio station categories are localized without translating user library genres
 * or changing identifiers/filter types submitted by the playback API.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n/language-context";
import { LibraryRadioStations } from "@/features/home/components/LibraryRadioStations";
import { buildGenreStations, buildDecadeStations, STATIC_STATIONS } from "@/features/home/radioData";

const mocks = vi.hoisted(() => ({ playTracks: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/audio-controls-context", () => ({
    useAudioControls: () => ({ playTracks: mocks.playTracks }),
}));
vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => mocks.get(...args) } }));
vi.mock("@/hooks/useMediaQuery", () => ({ useIsMobile: () => false, useIsTablet: () => false }));
vi.mock("@/hooks/useQueries", () => ({
    useLibraryGenresQuery: () => ({
        data: { genres: [{ genre: "Psychedelic Rock", count: 1234 }] }, isLoading: false,
    }),
    useLibraryDecadesQuery: () => ({
        data: { decades: [{ decade: 1980, count: 47 }] }, isLoading: false,
    }),
}));
vi.mock("@/components/ui/HorizontalCarousel", () => ({
    HorizontalCarousel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/cards/TileCard", () => ({
    TileCard: ({ title, subtitle, onClick }: { title: string; subtitle: string; onClick: () => void }) =>
        <button onClick={onClick}><span>{title}</span><small>{subtitle}</small></button>,
}));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
async function render() {
    await act(async () => root.render(<LanguageProvider><LibraryRadioStations /></LanguageProvider>));
}
async function changeLocale(locale: "en" | "nl") {
    await act(async () => {
        localStorage.setItem("kima-hub-language", locale);
        window.dispatchEvent(new Event("kima-hub-language-change"));
    });
}
beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem("kima-hub-language");
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("home radio station presentation", () => {
    it("translates built-in station titles and quantities but keeps original genres", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        await render();
        expect(host.textContent).toContain("Alles willekeurig afspelen");
        expect(host.textContent).toContain("Je volledige bibliotheek");
        expect(host.textContent).toContain("Energieke nummers");
        expect(host.textContent).toContain("Psychedelic Rock");
        expect(host.textContent).toContain("1.234 nummers");
        expect(host.textContent).toContain("80s");
        expect(host.textContent).toContain("47 nummers");
        await changeLocale("en");
        expect(host.textContent).toContain("Shuffle All");
        expect(host.textContent).toContain("Your entire library");
        expect(host.textContent).toContain("Psychedelic Rock");
        expect(host.textContent).toContain("1,234 tracks");
        expect(mocks.get).not.toHaveBeenCalled();
        expect(mocks.playTracks).not.toHaveBeenCalled();
    });
    it("preserves station backend filter IDs, genre text and decade IDs", () => {
        const source = buildGenreStations([{ genre: "Psychedelic Rock", count: 1234 }])[0];
        expect(source.id).toBe("genre-Psychedelic Rock");
        expect(source.filter).toEqual({ type: "genre", value: "Psychedelic Rock" });
        expect(source.trackCount).toBe(1234);
        const decade = buildDecadeStations([{ decade: 1980, count: 47 }])[0];
        expect(decade.filter).toEqual({ type: "decade", value: "1980" });
        expect(decade.trackCount).toBe(47);
        expect(STATIC_STATIONS[0].filter).toEqual({ type: "all" });
    });
});
