/**
 * Vibe Map translation is presentation-only: labels change when the selected
 * locale changes, but backend mood keys, player track IDs, titles and callback
 * arguments remain exactly as they were.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n/language-context";
import { VibeToolbar } from "@/features/vibe/VibeToolbar";
import { MoodLegend } from "@/features/vibe/MoodLegend";
import { TrackPanel } from "@/features/vibe/TrackPanel";
import { QueueTab } from "@/features/vibe/tabs/QueueTab";
import type { MapTrack } from "@/features/vibe/types";

vi.mock("@/components/ui/CachedImage", () => ({
    CachedImage: () => null,
}));

const audioControls = vi.hoisted(() => ({
    playTracks: vi.fn(), pause: vi.fn(), resume: vi.fn(),
}));
const originals = vi.hoisted(() => ([
    { id: "ci-recording-1", title: "CI Original Track Title", artist: { name: "CI Artist" }, duration: 180 },
    { id: "ci-recording-2", title: "Another Original Track", artist: { name: "CI Artist" }, duration: 150 },
]));
vi.mock("@/lib/audio-state-context", () => ({
    useAudioState: () => ({
        currentTrack: originals[0], queue: originals,
        currentIndex: 0, activeOperation: { type: "drift" },
    }),
}));
vi.mock("@/lib/audio-controls-context", () => ({
    useAudioControls: () => audioControls,
}));
vi.mock("@/lib/audio-playback-context", () => ({
    useAudioPlayback: () => ({ isPlaying: false }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;

const find = (selector: string) => host.querySelector(selector) as HTMLElement | null;

async function render(node: React.ReactNode) {
    await act(async () => {
        root.render(<LanguageProvider>{node}</LanguageProvider>);
    });
}
async function switchLanguage(next: "en" | "nl") {
    await act(async () => {
        localStorage.setItem("kima-hub-language", next);
        window.dispatchEvent(new Event("kima-hub-language-change"));
    });
}

const track: MapTrack = {
    id: "ci-recording-1", title: "CI Original Track Title",
    artist: "CI Original Artist", artistId: "ci-artist-id",
    albumId: "ci-album-id", coverUrl: null,
    x: 0, y: 0, z: 0, colour: 0.5,
    dominantMood: "moodHappy", moods: { moodHappy: 0.9, moodSad: 0.1 },
    energy: 0.75, valence: 0.85,
};

beforeEach(() => {
    localStorage.removeItem("kima-hub-language");
    audioControls.playTracks.mockReset();
    audioControls.pause.mockReset();
    audioControls.resume.mockReset();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});
afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("Vibe Map EN/NL controls", () => {
    it("translates both toolbar layouts live without altering actions or search terms", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        const onPathMode = vi.fn(), onAlchemyMode = vi.fn(), onSearch = vi.fn();
        const props = {
            mode: "idle" as const, compact: false,
            onSearch, results: null, onPickResult: vi.fn(),
            onPathMode, onAlchemyMode, onReset: vi.fn(), clearSignal: 0,
        };
        await render(<VibeToolbar {...props} />);
        expect(find("input")?.getAttribute("placeholder")).toBe("Zoek een nummer of artiest");
        expect(find('input[aria-label="Nummers of artiesten zoeken"]')).not.toBeNull();
        const pathButton = find('button[aria-label^="Nummerpad:"]') as HTMLButtonElement;
        const blendButton = find('button[aria-label^="Mix: combineer"]') as HTMLButtonElement;
        expect(pathButton).not.toBeNull();
        expect(blendButton).not.toBeNull();
        await act(async () => pathButton.click());
        await act(async () => blendButton.click());
        expect(onPathMode).toHaveBeenCalledTimes(1);
        expect(onAlchemyMode).toHaveBeenCalledTimes(1);
        await switchLanguage("en");
        expect(find("input")?.getAttribute("placeholder")).toBe("Find a track or artist");
        expect(find('button[aria-label^="Song Path:"]')).not.toBeNull();
        await render(<VibeToolbar {...props} compact />);
        expect(find('[role="toolbar"]')?.getAttribute("aria-label")).toBe("Map tools");
        await switchLanguage("nl");
        expect(find('[role="toolbar"]')?.getAttribute("aria-label")).toBe("Kaartgereedschap");
    });

    it("localizes visible mood names, not the actual backend mood key", async () => {
        const onToggle = vi.fn(), onPreview = vi.fn();
        localStorage.setItem("kima-hub-language", "nl");
        await render(<MoodLegend tracks={[track]} trackCount={1} activeMood={null} onToggle={onToggle} onPreview={onPreview} />);
        expect(find('[role="group"]')?.getAttribute("aria-label")).toBe("Sferen in je bibliotheek");
        expect(host.textContent).toContain("Opgewekt");
        expect(host.textContent).toContain("1 nummer");
        const moodButton = [...host.querySelectorAll("button")].find(b => b.textContent?.includes("Opgewekt"));
        expect(moodButton).toBeDefined();
        await act(async () => moodButton!.click());
        expect(onToggle).toHaveBeenCalledWith("moodHappy");
        await switchLanguage("en");
        expect(host.textContent).toContain("Upbeat");
        expect(host.textContent).toContain("1 track");
    });

    it("keeps title, artist and album link intact in Dutch track details", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        const onPlay = vi.fn(), onVibe = vi.fn();
        await render(
            <TrackPanel track={track} songPathActive={false}
                onClose={vi.fn()} onPlay={onPlay} onVibe={onVibe}
                onSimilar={vi.fn()} onSongPath={vi.fn()} />
        );
        expect(host.textContent).toContain("CI Original Track Title");
        expect(host.textContent).toContain("CI Original Artist");
        expect(find('a[href="/album/ci-album-id"]')?.textContent?.trim()).toBe("Album openen");
        expect(host.textContent).toContain("Energie");
        expect(host.textContent).toContain("Positiviteit");
        expect(host.textContent).toContain("Opgewekt");
        await act(async () => (find('button[aria-label="Dit nummer afspelen"]') as HTMLButtonElement).click());
        await act(async () => (find('button[aria-label="Sfeerafspeellijst maken op basis van dit nummer"]') as HTMLButtonElement).click());
        expect(onPlay).toHaveBeenCalledTimes(1);
        expect(onVibe).toHaveBeenCalledTimes(1);
        await switchLanguage("en");
        expect(host.textContent).toContain("CI Original Track Title");
        expect(host.textContent).toContain("Energy");
        expect(find('a[href="/album/ci-album-id"]')?.textContent?.trim()).toBe("Open album");
    });

    it("translates the queue operation without modifying its stored type or track IDs", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        await render(<QueueTab />);
        expect(host.textContent).toContain("Nummerrichting");
        expect(host.textContent).toContain("2 nummers");
        expect(host.textContent).toContain("CI Original Track Title");
        expect(host.textContent).toContain("Another Original Track");
        expect(find('button[aria-label="Afspelen"]')).not.toBeNull();
        const second = [...host.querySelectorAll("button")].find(b => b.textContent?.includes("Another Original Track"));
        expect(second).toBeDefined();
        await act(async () => second!.click());
        expect(audioControls.playTracks).toHaveBeenCalledWith(originals, 1);
        await switchLanguage("en");
        expect(host.textContent).toContain("Song Path");
        expect(host.textContent).toContain("2 tracks");
        expect(host.textContent).toContain("Another Original Track");
    });
});
