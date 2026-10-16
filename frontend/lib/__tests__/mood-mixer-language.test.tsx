/**
 * The v1.11 Mood Mixer translates only interface copy. Mood identifiers,
 * playlist event names, artist names and track metadata stay unmodified.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n/language-context";
import { MoodMixer } from "@/components/MoodMixer";

const mocks = vi.hoisted(() => ({
    getPresets: vi.fn(),
    getMix: vi.fn(),
    saveMix: vi.fn(),
    playTracks: vi.fn(),
    refetchQueries: vi.fn(),
    notifyError: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
    api: {
        getMoodBucketPresets: (...args: unknown[]) => mocks.getPresets(...args),
        getMoodBucketMix: (...args: unknown[]) => mocks.getMix(...args),
        saveMoodBucketMix: (...args: unknown[]) => mocks.saveMix(...args),
    },
}));
vi.mock("@/lib/audio-controls-context", () => ({
    useAudioControls: () => ({ playTracks: mocks.playTracks }),
}));
vi.mock("@tanstack/react-query", () => ({
    useQueryClient: () => ({ refetchQueries: mocks.refetchQueries }),
}));
vi.mock("@/lib/notify", () => ({
    notify: { error: (...args: unknown[]) => mocks.notifyError(...args) },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const onClose = vi.fn();

function moodButton(text: string): HTMLButtonElement {
    const button = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
    if (!button) throw new Error(`Missing mood button: ${text}`);
    return button;
}

async function render() {
    await act(async () => {
        root.render(
            <LanguageProvider>
                <MoodMixer isOpen onClose={onClose} />
            </LanguageProvider>,
        );
    });
}

async function switchLanguage(locale: "en" | "nl") {
    await act(async () => {
        localStorage.setItem("kima-hub-language", locale);
        window.dispatchEvent(new Event("kima-hub-language-change"));
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem("kima-hub-language");
    mocks.getPresets.mockResolvedValue([
        { id: "happy", trackCount: 12, pendingTracks: 0 },
        { id: "party", trackCount: 2 },
        { id: "chill", trackCount: 0 },
        { id: "sad", trackCount: 0 },
        { id: "aggressive", trackCount: 0 },
    ]);
    mocks.refetchQueries.mockResolvedValue(undefined);
    mocks.saveMix.mockResolvedValue(undefined);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
});

afterEach(() => {
    act(() => root.unmount());
    host.remove();
});

describe("Mood Mixer EN/NL UI", () => {
    it("switches mood labels, descriptions and accessible close control without changing mood IDs", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        await render();

        expect(host.querySelector('[role="dialog"]')?.getAttribute("aria-modal")).toBe("true");
        expect(host.textContent).toContain("Stemmingsmix");
        expect(host.textContent).toContain("Kies je sfeer");
        expect(moodButton("Opgewekt").title).toBe("Vrolijk en opbeurend");
        expect(moodButton("Energiek").disabled).toBe(true);
        expect(host.querySelector('button[aria-label="Sluiten"]')).not.toBeNull();

        await switchLanguage("en");
        expect(host.textContent).toContain("Mood Mixer");
        expect(host.textContent).toContain("Pick your vibe");
        expect(moodButton("Upbeat").title).toBe("Bright & uplifting");
        expect(host.querySelector('button[aria-label="Close"]')).not.toBeNull();
        expect(mocks.getMix).not.toHaveBeenCalled();
        expect(mocks.saveMix).not.toHaveBeenCalled();
    });

    it("explains unavailable moods with correct Dutch counts, then the threshold without pending work", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        mocks.getPresets.mockResolvedValueOnce([
            { id: "happy", trackCount: 12, pendingTracks: 1234 },
            { id: "party", trackCount: 2 },
        ]);
        await render();
        expect(moodButton("Energiek").title).toBe("Nog niet geanalyseerd — 1.234 nummers worden nog geanalyseerd");
        expect(host.textContent).toContain("Sfeeranalyse loopt nog voor 1.234 nummers");
        await switchLanguage("en");
        expect(moodButton("Energetic").title).toContain("tracks still being analysed");

        mocks.getPresets.mockResolvedValue([
            { id: "happy", trackCount: 12, pendingTracks: 0 },
            { id: "party", trackCount: 2 },
        ]);
        await switchLanguage("nl");
        expect(moodButton("Energiek").title).toBe("Minstens 8 nummers nodig (2 beschikbaar)");
    });

    it("passes the original mood code, track IDs, titles and artist to playback and saved mixes", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        mocks.getMix.mockResolvedValue({
            tracks: [{
                id: "ci-original-track-id",
                title: "Original Track – Don't Translate",
                albumId: "ci-original-album-id",
                album: { title: "Original Album", coverUrl: null, artist: { id: "ci-artist-id", name: "Original Artist" } },
                duration: 180,
            }],
        });
        await render();
        await act(async () => moodButton("Opgewekt").click());

        expect(mocks.getMix).toHaveBeenCalledWith("happy");
        expect(mocks.saveMix).toHaveBeenCalledWith("happy", ["ci-original-track-id"]);
        expect(mocks.playTracks).toHaveBeenCalledWith([
            expect.objectContaining({
                id: "ci-original-track-id",
                title: "Original Track – Don't Translate",
                artist: expect.objectContaining({ name: "Original Artist" }),
                album: expect.objectContaining({ title: "Original Album" }),
            }),
        ], 0);
        expect(mocks.refetchQueries).toHaveBeenCalledWith({ queryKey: ["mixes"] });
        expect(onClose).toHaveBeenCalledOnce();
    });

    it("uses translated placeholders only for missing metadata", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        mocks.getMix.mockResolvedValue({
            tracks: [{ id: "ci-track-no-album", title: "Real Song", albumId: null, duration: 145 }],
        });
        await render();
        await act(async () => moodButton("Opgewekt").click());
        expect(mocks.playTracks).toHaveBeenCalledWith([
            expect.objectContaining({
                title: "Real Song",
                artist: expect.objectContaining({ name: "Onbekende artiest" }),
                album: expect.objectContaining({ title: "Onbekend album" }),
            }),
        ], 0);
    });

    it("localizes failed preset loading and an empty generation without changing the API", async () => {
        localStorage.setItem("kima-hub-language", "nl");
        mocks.getPresets.mockRejectedValueOnce(new Error("offline"));
        await render();
        expect(mocks.notifyError).toHaveBeenCalledWith("Kon sfeervoorinstellingen niet laden");

        mocks.getPresets.mockResolvedValue([{ id: "happy", trackCount: 9, pendingTracks: 0 }]);
        await switchLanguage("en");
        await switchLanguage("nl");
        mocks.getMix.mockResolvedValue({ tracks: [] });
        await act(async () => moodButton("Opgewekt").click());
        expect(mocks.getMix).toHaveBeenCalledWith("happy");
        expect(mocks.notifyError).toHaveBeenCalledWith("Niet genoeg nummers voor deze sfeer", {
            message: "Analyseer meer muziek of kies een andere sfeer.",
        });
        expect(mocks.saveMix).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });
});
